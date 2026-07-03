// supabase/functions/send-push/index.ts
// Sends a Web Push notification using self-contained VAPID signing (no external deps).
//
// Body: { user_id, title, body, url?, pref_key? }
// Secrets needed (supabase secrets set):
//   VAPID_PUBLIC_KEY   — base64url uncompressed EC P-256 public key
//   VAPID_PRIVATE_KEY  — base64url raw EC P-256 private key scalar
//   VAPID_SUBJECT      — mailto: or https: URI
//   SUPABASE_URL       — injected automatically by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — injected automatically by Supabase

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Simple in-memory rate limiter (per user_id) ──────────────────────────────
const rateLimitCache = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string, maxRequests = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = rateLimitCache.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitCache.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false; // rate limit exceeded
  }

  entry.count += 1;
  return true;
}

// ── Base64url helpers ─────────────────────────────────────────────────────────
function base64urlToBytes(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (padded.length % 4)) % 4;
  const raw = atob(padded + '='.repeat(pad));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function utf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// ── Build a VAPID JWT (ES256) ─────────────────────────────────────────────────
async function buildVapidJwt(
  subject: string,
  audience: string,    // e.g. "https://fcm.googleapis.com"
  publicKeyB64: string,
  privateKeyB64: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', typ: 'JWT' };
  const payload = { aud: audience, exp: now + 12 * 3600, sub: subject };

  const headerB64  = bytesToBase64url(utf8(JSON.stringify(header)));
  const payloadB64 = bytesToBase64url(utf8(JSON.stringify(payload)));
  const signingInput = utf8(`${headerB64}.${payloadB64}`);

  // Import private key
  const privBytes = base64urlToBytes(privateKeyB64);
  const pubBytes  = base64urlToBytes(publicKeyB64);

  // Build JWK from raw bytes
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToBase64url(pubBytes.slice(1, 33)),
    y: bytesToBase64url(pubBytes.slice(33, 65)),
    d: bytesToBase64url(privBytes),
  };

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    signingInput,
  );

  return `${headerB64}.${payloadB64}.${bytesToBase64url(new Uint8Array(sigBuf))}`;
}

// ── Encrypt the push payload (RFC 8291 — aes128gcm content encoding) ─────────
async function encryptPayload(
  plaintext: string,
  p256dhB64: string,   // subscriber public key
  authB64: string,     // subscriber auth secret
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const salt        = crypto.getRandomValues(new Uint8Array(16));
  const userPublicKey = base64urlToBytes(p256dhB64);
  const authSecret    = base64urlToBytes(authB64);
  const plaintextBytes = utf8(plaintext);

  // Generate ephemeral server key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  );

  // Export server public key as uncompressed point
  const serverPubRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeyPair.publicKey),
  );

  // Import subscriber's public key
  const subscriberKey = await crypto.subtle.importKey(
    'raw',
    userPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  // Derive shared secret via ECDH
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subscriberKey },
    serverKeyPair.privateKey,
    256,
  );

  // HKDF extract + expand per RFC 8291
  const sharedKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveBits']);

  // PRK_key = HKDF-Extract(auth_secret, ecdh_secret)
  const prkKeyBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: authSecret,
      info: utf8('WebPush: info\x00').concat(userPublicKey, serverPubRaw),
    } as any,
    sharedKey,
    256,
  );

  const prkKey = await crypto.subtle.importKey('raw', prkKeyBits, 'HKDF', false, ['deriveBits']);

  // CEK = HKDF-Expand(PRK_key, "Content-Encoding: aes128gcm\0", 16)
  const cekBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: utf8('Content-Encoding: aes128gcm\x00'),
    } as any,
    prkKey,
    128,
  );

  // Nonce = HKDF-Expand(PRK_key, "Content-Encoding: nonce\0", 12)
  const nonceBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: utf8('Content-Encoding: nonce\x00'),
    } as any,
    prkKey,
    96,
  );

  const cek = await crypto.subtle.importKey('raw', cekBits, 'AES-GCM', false, ['encrypt']);

  // Add padding record delimiter (0x02 = last record)
  const padded = new Uint8Array(plaintextBytes.length + 1);
  padded.set(plaintextBytes);
  padded[plaintextBytes.length] = 0x02;

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonceBits },
      cek,
      padded,
    ),
  );

  return { ciphertext, salt, serverPublicKey: serverPubRaw };
}

// ── Uint8Array concat helper ──────────────────────────────────────────────────
declare global {
  interface Uint8ArrayConstructor {
    prototype: Uint8Array;
  }
}
function concatArrays(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

// ── Build the aes128gcm content-encoding body (RFC 8188) ─────────────────────
function buildEncryptedBody(
  ciphertext: Uint8Array,
  salt: Uint8Array,
  serverPublicKey: Uint8Array,
): Uint8Array {
  // Header: salt (16) + rs (4, big-endian uint32) + idlen (1) + keyid (65)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const idlen = new Uint8Array([serverPublicKey.length]);
  return concatArrays(salt, rs, idlen, serverPublicKey, ciphertext);
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user_id, title, body, url, pref_key } = await req.json();

    if (!user_id || !title || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: user_id, title, body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Rate limit: 10 requests per user per minute
    if (!checkRateLimit(user_id, 10, 60_000)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Check notification preference ────────────────────────────────────────
    if (pref_key) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('notification_prefs')
        .eq('id', user_id)
        .single();
      const prefs = prof?.notification_prefs ?? {};
      if (prefs[pref_key] === false) {
        return new Response(
          JSON.stringify({ skipped: true, reason: `pref ${pref_key} disabled` }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // ── Fetch subscriptions ──────────────────────────────────────────────────
    const { data: subs, error: subErr } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', user_id);

    if (subErr) throw subErr;
    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'no subscription' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@staytrue.app';

    const payloadStr = JSON.stringify({ title, body, url: url ?? '/' });

    const results = await Promise.allSettled(
      subs.map(async (sub) => {
        // Derive push service audience (origin only)
        const endpointOrigin = new URL(sub.endpoint).origin;

        const [jwt, encrypted] = await Promise.all([
          buildVapidJwt(VAPID_SUBJECT, endpointOrigin, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY),
          encryptPayload(payloadStr, sub.p256dh, sub.auth),
        ]);

        const bodyBytes = buildEncryptedBody(
          encrypted.ciphertext,
          encrypted.salt,
          encrypted.serverPublicKey,
        );

        const resp = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Encoding': 'aes128gcm',
            'TTL': '86400',
            'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
          },
          body: bodyBytes,
        });

        if (resp.status === 410 || resp.status === 404) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }

        return { endpoint: sub.endpoint, status: resp.status };
      }),
    );

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[send-push]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
