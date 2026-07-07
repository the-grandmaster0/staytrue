/**
 * sendPush — fire a push notification to another user via the send-push edge function.
 *
 * Uses supabase.functions.invoke which automatically attaches the caller's
 * JWT in the Authorization header. Fire-and-forget — never blocks the UI.
 */

import { supabase } from './supabaseClient';

export interface PushPayload {
  user_id:  string;
  title:    string;
  body:     string;
  url?:     string;
  pref_key?: 'daily_reminder' | 'buddy_checkin' | 'messages' | 'challenges';
}

export async function sendPush(payload: PushPayload): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: payload,
    });

    if (error) {
      console.warn('[sendPush] error:', error.message);
      return;
    }

    if (data?.skipped) {
      console.log('[sendPush] skipped —', data.reason);
      return;
    }

    console.log('[sendPush] sent ✓', payload.title, '→', payload.user_id.slice(0, 8));
  } catch (err) {
    console.warn('[sendPush] network error:', err);
  }
}
