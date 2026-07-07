/**
 * sendEmail — fires a notification to another user via the send-email edge function.
 *
 * The function stores the notification in the DB (always) AND sends an email
 * via Resend if the RESEND_API_KEY secret is configured on the server.
 *
 * Fire-and-forget — never blocks the UI.
 */

import { supabase } from './supabaseClient';

export interface EmailPayload {
  user_id:   string;
  title:     string;
  body:      string;
  url?:      string;
  type?:     'message' | 'checkin' | 'buddy_request' | 'challenge' | 'daily_reminder' | 'general';
  pref_key?: 'daily_reminder' | 'buddy_checkin' | 'messages' | 'challenges';
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: payload,
    });

    if (error) {
      console.warn('[sendEmail] error:', error.message);
      return;
    }

    if (data?.skipped) {
      console.log('[sendEmail] skipped —', data.reason);
      return;
    }

    console.log(
      '[sendEmail] stored ✓',
      payload.title,
      '→',
      payload.user_id.slice(0, 8),
      data?.emailed ? '(email sent)' : '(DB only)',
    );
  } catch (err) {
    console.warn('[sendEmail] network error:', err);
  }
}
