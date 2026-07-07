// supabase/functions/send-push/index.ts
//
// Delivers a Web Push notification to a target user.
//
// Required Supabase secrets (set via: supabase secrets set KEY=value):
//   VAPID_PUBLIC_KEY   — same base64url key as VITE_VAPID_PUBLIC_KEY in client .env
//   VAPID_PRIVATE_KEY  — EC P-256 private key scalar, base64url encoded
//   VAPID_SUBJECT      — mailto: or https: URI  e.g. "mailto:admin@staytrue.app"
//
// Auto-injected by Supabase (do not set manually):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Per-user rate limiter (in-memory, resets on cold start) ──────────────────
const rl = new Map<string, { n: number; reset: number }>();
function rateOk(id: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const e   = rl.get(id);
  if (!e || now > e.reset) { rl.set(id, { n: 1, reset: now + windowMs }); return true; }
  if (e.n >= max) return false;
  e.n++;
  return true;
}

// ── Base64url ────────────────────────────────────────────────────────────────
const b64uToBytes = (s: string): Uint8Array => {
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (p.length % 4)) % 4;
  return Uint8Array.from(atob(p + '='.repeat(pad)), (c) => c.charCodeAt(0));
};
const bytesToB64u = (b: Uint8Array): string =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
const enc = (s: string) => new TextEncoder().encode(s);

// ── VAPID JWT (ES256) ────────────────────────────────────────────────────────
async function makeVapidJwt(sub: string, aud: string, pub: string, priv: string): Promise<string> {
  const now  = Math.floor(Date.now() / 1000);
  const hdr  = bytesToB64u(enc(JSON.stringify({ alg: 'ES256', typ: 'JWT' })));
  const pay  = bytesToB64u(enc(JSON.stringify({ aud, exp: now + 43200, sub })));
  const msg  = enc(`${hdr}.${pay}`);
  const pb   = b64uToBytes(pub);
  const key  = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256',
    x: bytesToB64u(pb.slice(1, 33)),
    y: bytesToB64u(pb.slice(33, 65)),
    d: bytesToB64u(b64uToBytes(priv)),
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, msg));
  return `${hdr}.${pay}.${bytesToB64u(sig)}`;
}

// ── RFC 8291 payload encryption (aes128gcm) ──────────────────────────────────
async function encryptPush(plain: string, p256dh: string, authSecret: string) {
  const salt      = crypto.getRandomValues(new Uint8Array(16));
  const recvPub   = b64uToBytes(p256dh);
  const authBytes = b64uToBytes(authSecret);
  const text      = enc(plain);

  const svrKP = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const svrPub = new Uint8Array(await crypto.subtle.exportKey('raw', svrKP.publicKey));

  const recvKey = await crypto.subtle.importKey('raw', recvPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared  = await crypto.subtle.deriveBits({ name: 'ECDH', public: recvKey }, svrKP.privateKey, 256);

  const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let off = 0; a.forEach((x) => { o.set(x, off); off += x.length; }); return o; };

  const prk = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const ikm = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: authBytes, info: cat(enc('WebPush: info\x00'), recvPub, svrPub) } as any, prk, 256);
  const ikmKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);

  const cek = await crypto.subtle.importKey('raw',
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc('Content-Encoding: aes128gcm\x00') } as any, ikmKey, 128),
    'AES-GCM', false, ['encrypt']);
  const iv = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc('Content-Encoding: nonce\x00') } as any, ikmKey, 96);

  const padded = new Uint8Array(text.length + 1);
  padded.set(text); padded[text.length] = 0x02;
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cek, padded));

  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096, false);
  return cat(salt, rs, new Uint8Array([svrPub.length]), svrPub, ct);
}

// ── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Invalid JSON body' }, 400);

    const { user_id, title, body: msgBody, url = '/dashboard', pref_key } = body;

    if (!user_id || !title || !msgBody) {
      return json({ error: 'Missing required fields: user_id, title, body' }, 400);
    }

    if (!rateOk(user_id)) return json({ error: 'Rate limit exceeded' }, 429);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Check per-user notification preference
    if (pref_key) {
      const { data: prof } = await db.from('profiles').select('notification_prefs').eq('id', user_id).single();
      if ((prof?.notification_prefs ?? {})[pref_key] === false) {
        console.log(`[send-push] skipped — pref "${pref_key}" off for ${user_id}`);
        return json({ skipped: true, reason: `pref_${pref_key}_disabled` });
      }
    }

    // Fetch push subscriptions
    const { data: subs, error: subErr } = await db
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', user_id);

    if (subErr) { console.error('[send-push] DB error:', subErr.message); throw subErr; }
    if (!subs?.length) {
      console.log(`[send-push] no subscriptions for ${user_id}`);
      return json({ skipped: true, reason: 'no_subscription' });
    }

    const PUB  = Deno.env.get('VAPID_PUBLIC_KEY');
    const PRIV = Deno.env.get('VAPID_PRIVATE_KEY');
    const SUBJ = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@staytrue.app';

    if (!PUB || !PRIV) {
      console.error('[send-push] VAPID secrets not set — run: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...');
      return json({ error: 'VAPID secrets not configured' }, 500);
    }

    console.log(`[send-push] VAPID_PUBLIC_KEY first20="${PUB.slice(0,20)}" len=${PUB.length}`);

    const payload = JSON.stringify({ title, body: msgBody, url });
    console.log(`[send-push] sending "${title}" to ${subs.length} sub(s) for ${user_id}`);

    const results = await Promise.allSettled(subs.map(async (sub: any) => {
      const origin = new URL(sub.endpoint).origin;

      // ── WNS (Edge on Windows) requires OAuth2, not VAPID — skip gracefully ──
      // WNS endpoints: notify.windows.com
      // To support Edge/WNS, register an app at https://partner.microsoft.com/dashboard
      // and add WNS_CLIENT_ID + WNS_CLIENT_SECRET secrets, then handle the token flow.
      if (sub.endpoint.includes('notify.windows.com')) {
        console.log('[send-push] skipping WNS endpoint (Edge/Windows) — VAPID not supported by WNS');
        return { status: 'skipped_wns' };
      }
      const [jwt, encrypted] = await Promise.all([
        makeVapidJwt(SUBJ, origin, PUB, PRIV),
        encryptPush(payload, sub.p256dh, sub.auth),
      ]);

      const resp = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type':     'application/octet-stream',
          'Content-Encoding': 'aes128gcm',
          'TTL':              '86400',
          'Authorization':    `vapid t=${jwt},k=${PUB}`,
        },
        body: encrypted.buffer as ArrayBuffer,
      });

      const respText = await resp.text().catch(() => '');
      console.log(`[send-push] push → ${resp.status} body="${respText.slice(0,200)}" endpoint="${sub.endpoint.slice(0, 60)}"`);

      // 410 Gone / 404 = subscription expired, remove it
      if (resp.status === 410 || resp.status === 404) {
        await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        console.log('[send-push] removed stale subscription');
      }

      return { status: resp.status, body: respText.slice(0, 200) };
    }));

    return json({ ok: true, sent: subs.length, results });
  } catch (err) {
    console.error('[send-push] unhandled error:', err);
    return json({ error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
