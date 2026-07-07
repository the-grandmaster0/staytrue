// supabase/functions/send-email/index.ts
//
// Delivers a transactional email to a target user AND stores the notification
// in the public.notifications table for the in-app inbox.
//
// Required Supabase secrets (set via: supabase secrets set KEY=value):
//   RESEND_API_KEY   — API key from resend.com (free tier: 3,000 emails/month)
//   FROM_EMAIL       — verified sender address, e.g. "StayTrue <noreply@staytrue.app>"
//
// Auto-injected by Supabase:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Per-user in-memory rate limiter (resets on cold start) ───────────────────
const rl = new Map<string, { n: number; reset: number }>();
function rateOk(id: string, max = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const e   = rl.get(id);
  if (!e || now > e.reset) { rl.set(id, { n: 1, reset: now + windowMs }); return true; }
  if (e.n >= max) return false;
  e.n++;
  return true;
}

// ── Simple HTML email template ───────────────────────────────────────────────
function buildEmailHtml(title: string, body: string, url: string, appUrl: string): string {
  const actionUrl = url.startsWith('http') ? url : `${appUrl}${url}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#161b27;border:1px solid #1e2a40;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:#1a2236;padding:24px 32px;border-bottom:1px solid #1e2a40;">
              <span style="font-size:20px;font-weight:900;color:#e2e8f0;letter-spacing:2px;text-transform:uppercase;">⚡ StayTrue</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#e2e8f0;">${title}</h2>
              <p style="margin:0 0 28px;font-size:15px;color:#94a3b8;line-height:1.6;">${body}</p>
              <a href="${actionUrl}"
                 style="display:inline-block;padding:12px 28px;background:#3b82f6;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.5px;">
                Open StayTrue →
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #1e2a40;">
              <p style="margin:0;font-size:12px;color:#475569;">
                You're receiving this because you have email notifications enabled.
                <br/>
                <a href="${appUrl}/dashboard/notifications" style="color:#3b82f6;text-decoration:none;">Manage notifications</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const rawBody = await req.json().catch(() => null);
    if (!rawBody) return json({ error: 'Invalid JSON body' }, 400);

    const {
      user_id,
      title,
      body: msgBody,
      url         = '/dashboard',
      type        = 'general',
      pref_key,
    } = rawBody as {
      user_id: string;
      title: string;
      body: string;
      url?: string;
      type?: string;
      pref_key?: string;
    };

    if (!user_id || !title || !msgBody) {
      return json({ error: 'Missing required fields: user_id, title, body' }, 400);
    }

    if (!rateOk(user_id)) return json({ error: 'Rate limit exceeded' }, 429);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const RESEND_KEY   = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL   = Deno.env.get('FROM_EMAIL') || 'StayTrue <noreply@staytrue.app>';
    const APP_URL      = Deno.env.get('APP_URL') || 'https://staytrue.app';

    const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // ── Check notification preference ─────────────────────────────────────────
    const { data: prof } = await db
      .from('profiles')
      .select('notification_prefs, email')
      .eq('id', user_id)
      .single();

    if (pref_key && (prof?.notification_prefs ?? {})[pref_key] === false) {
      console.log(`[send-email] skipped — pref "${pref_key}" off for ${user_id}`);
      return json({ skipped: true, reason: `pref_${pref_key}_disabled` });
    }

    const recipientEmail = prof?.email;

    // ── 1. Store in notifications table (always) ──────────────────────────────
    const { error: dbErr } = await db.from('notifications').insert({
      user_id,
      type: type || pref_key || 'general',
      title,
      body: msgBody,
      url,
    });

    if (dbErr) {
      console.error('[send-email] failed to insert notification:', dbErr.message);
    }

    // ── 2. Send email via Resend (if configured and user has an email) ─────────
    if (!RESEND_KEY) {
      console.warn('[send-email] RESEND_API_KEY not set — notification stored in DB only');
      return json({ ok: true, stored: true, emailed: false, reason: 'no_resend_key' });
    }

    if (!recipientEmail) {
      console.warn(`[send-email] no email for user ${user_id}`);
      return json({ ok: true, stored: true, emailed: false, reason: 'no_user_email' });
    }

    const htmlBody = buildEmailHtml(title, msgBody, url, APP_URL);

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [recipientEmail],
        subject: title,
        html:    htmlBody,
      }),
    });

    const emailData = await emailRes.json().catch(() => ({}));

    if (!emailRes.ok) {
      console.error('[send-email] Resend error:', emailRes.status, JSON.stringify(emailData));
      return json({ ok: true, stored: true, emailed: false, emailError: emailData }, 200);
    }

    console.log(`[send-email] sent "${title}" to ${recipientEmail} — Resend id: ${emailData.id}`);
    return json({ ok: true, stored: true, emailed: true, resendId: emailData.id });

  } catch (err) {
    console.error('[send-email] unhandled error:', err);
    return json({ error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
