/**
 * sendPush — client-side helper to trigger a push notification for another user.
 *
 * Calls the send-push edge function via supabase.functions.invoke so that the
 * anon JWT is forwarded automatically. The edge function handles:
 *   - Fetching the target user's push subscriptions
 *   - Checking their notification preferences (pref_key)
 *   - VAPID signing and encryption
 *
 * This is intentionally fire-and-forget — we never block the UI on it.
 * Errors are swallowed silently so a failed push never breaks app flow.
 */

import { supabase } from './supabaseClient';

interface PushPayload {
  user_id: string;
  title: string;
  body: string;
  url?: string;
  pref_key?: 'daily_reminder' | 'buddy_checkin' | 'messages' | 'challenges';
}

export async function sendPush(payload: PushPayload): Promise<void> {
  try {
    await supabase.functions.invoke('send-push', {
      body: payload,
    });
  } catch {
    // Intentionally silent — push is best-effort, never block UI
  }
}
