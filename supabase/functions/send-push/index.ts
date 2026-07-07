// supabase/functions/send-push/index.ts
// Sends a Web Push notification using self-contained VAPID signing (no external deps).
//
// Body: { user_id, title, body, url?, pref_key? }
// Secrets needed (supabase secrets set):
//   VAPID_PUBLIC_KEY   — base64url uncompressed EC P-256 public key (same as VITE_VAPID_PUBLIC_KEY)
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

function checkRateLimit(userId: string, maxRequests = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = rateLimitCache.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitCache.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
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
  audience: string,
  publicKeyB64: string,
  privateKeyB64: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', typ: 'JWT' };
  const payload = { aud: audience, exp: now + 12 * 3600, sub: subject };

  const headerB64  = bytesToBase64url(utf8(JSON.stringify(header)));
  const payloadB64 = bytesToBase64url(utf8(JSON.stringify(payload)));
  const signingInput = utf8(`${headerB64}.${payloadB64}`);

  const privBytes = base64urlToBytes(privateKeyB64);
  const pubBytes  = base64urlToBytes(publicKeyB64);

  const jwk = {
    kty: 'EC', crv: 'P-256',
    x: bytesToBase64url(pubBytes.slice(1, 33)),
    y: bytesToBase64url(pubBytes.slice(33, 65)),
    d: bytesToBase64url(privBytes),
  };

  const cryptoKey = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );

  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, signingInput.buffer as ArrayBuffer,
  );

  return `${headerB64}.${payloadB64}.${bytesToBase64url(new Uint8Array(sigBuf))}`;
}

// ── Encrypt the push payload (RFC 8291 — aes128gcm) ─────────────────────────
async function encryptPayload(
  plaintext: string,
  p256dhB64: string,
  authB64: string,
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const salt           = crypto.getRandomValues(new Uint8Array(16));
  const userPublicKey  = base64urlToBytes(p256dhB64);
  const authSecret     = base64urlToBytes(authB64);
  const plaintextBytes = utf8(plaintext);

  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits'],
  );
  const serverPubRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeyPair.publicKey),
  );

  const subscriberKey = await crypto.subtle.importKey(
    'raw', userPublicKey.buffer as ArrayBuffer,
    { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subscriberKey }, serverKeyPair.privateKey, 256,
  );

  const sharedKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveBits']);

  const concat = (...arrays: Uint8Array[]) => {
    const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
    let off = 0;
    for (const a of arrays) { out.set(a, off); off += a.length; }
    return out;
  };

  const prkKeyBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret,
      info: concat(utf8('WebPush: info\x00'), userPublicKey, serverPubRaw) } as any,
    sharedKey, 256,
  );

  const prkKey = await crypto.subtle.importKey('raw', prkKeyBits, 'HKDF', false, ['deriveBits']);

  const cekBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt,
      info: utf8('Content-Encoding: aes128gcm\x00') } as any,
    prkKey, 128,
  );
  const nonceBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt,
      info: utf8('Content-Encoding: nonce\x00') } as any,
    prkKey, 96,
  );

  const cek = await crypto.subtle.importKey('raw', cekBits, 'AES-GCM', false, ['encrypt']);

  const padded = new Uint8Array(plaintextBytes.length + 1);
  padded.set(plaintextBytes);
  padded[plaintextBytes.length] = 0x02;

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonceBits }, cek, padded),
  );

  return { ciphertext, salt, serverPublicKey: serverPubRaw };
}

function buildEncryptedBody(ct: Uint8Array, salt: Uint8Array, spk: Uint8Array): Uint8Array {
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const idlen = new Uint8Array([spk.length]);
  const out = new Uint8Array(salt.length + rs.length + idlen.length + spk.length + ct.length);
  let off = 0;
  for (const a of [salt, rs, idlen, spk, ct]) { out.set(a, off); off += a.length; }
  return out;
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Verify the caller is an authenticated Supabase user ──────────────────
    // This prevents unauthenticated abuse of the endpoint.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify the caller's JWT
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) {
      console.error('[send-push] Auth failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { user_id, title, body, url, pref_key } = await req.json();

    if (!user_id || !title || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: user_id, title, body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!checkRateLimit(user_id, 20, 60_000)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Use service role for all DB operations so RLS doesn't block
    const adminClient = createClient(supabaseUrl, serviceKey);

    // ── Check notification preference ────────────────────────────────────────
    if (pref_key) {
      const { data: prof } = await adminClient
        .from('profiles')
        .select('notification_prefs')
        .eq('id', user_id)
        .single();
      const prefs = prof?.notification_prefs ?? {};
      if (prefs[pref_key] === false) {
        console.log(`[send-push] Skipped — pref "${pref_key}" disabled for ${user_id}`);
        return new Response(
          JSON.stringify({ skipped: true, reason: `pref ${pref_key} disabled` }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // ── Fetch subscriptions ──────────────────────────────────────────────────
    const { data: subs, error: subErr } = await adminClient
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', user_id);

    if (subErr) {
      console.error('[send-push] DB error fetching subs:', subErr.message);
      throw subErr;
    }
    if (!subs || subs.length === 0) {
      console.log(`[send-push] No subscriptions found for user ${user_id}`);
      return new Response(
        JSON.stringify({ skipped: true, reason: 'no subscription' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[send-push] Sending to ${subs.length} subscription(s) for user ${user_id}`);

    const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@staytrue.app';

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.error('[send-push] VAPID secrets missing — run: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...');
      return new Response(
        JSON.stringify({ error: 'VAPID secrets not configured on the server' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const payloadStr = JSON.stringify({ title, body, url: url ?? '/' });

    const results = await Promise.allSettled(
      subs.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
        const endpointOrigin = new URL(sub.endpoint).origin;

        const [jwt, encrypted] = await Promise.all([
          buildVapidJwt(VAPID_SUBJECT, endpointOrigin, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY),
          encryptPayload(payloadStr, sub.p256dh, sub.auth),
        ]);

        const bodyBytes = buildEncryptedBody(
          encrypted.ciphertext, encrypted.salt, encrypted.serverPublicKey,
        );

        const resp = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Encoding': 'aes128gcm',
            'TTL': '86400',
            'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
          },
          body: bodyBytes.buffer as ArrayBuffer,
        });

        console.log(`[send-push] Push to ${sub.endpoint.slice(0, 60)}... → ${resp.status}`);

        if (resp.status === 410 || resp.status === 404) {
          console.log(`[send-push] Removing stale subscription: ${resp.status}`);
          await adminClient.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }

        if (!resp.ok && resp.status !== 410 && resp.status !== 404) {
          const text = await resp.text().catch(() => '');
          console.error(`[send-push] Push service error ${resp.status}: ${text}`);
        }

        return { endpoint: sub.endpoint, status: resp.status };
      }),
    );

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[send-push] Unhandled error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
