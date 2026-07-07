// supabase/functions/daily-reminder/index.ts
// Deno Edge Function — scheduled via pg_cron every hour.
// Finds users whose reminder_time matches current hour (in their timezone)
// and who haven't checked in today on any active goal.
// Sends email + stores in-app notification.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getCurrentTimeInZone(timezone: string): { hour: number; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(new Date());

    const hourPart   = parts.find((p) => p.type === 'hour')?.value;
    const minutePart = parts.find((p) => p.type === 'minute')?.value;
    if (!hourPart || !minutePart) return null;

    let hour = parseInt(hourPart, 10);
    const minute = parseInt(minutePart, 10);
    if (hour === 24) hour = 0;
    return { hour, minute };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase    = createClient(supabaseUrl, serviceKey);

    const now        = new Date();
    const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd   = new Date(now); todayEnd.setUTCHours(23, 59, 59, 999);

    // Fetch all users who have notification_prefs.daily_reminder !== false
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, timezone, reminder_time, notification_prefs');

    if (profilesError) throw profilesError;

    const usersToCheck: string[] = [];

    for (const profile of (profiles ?? []) as any[]) {
      const prefs = profile.notification_prefs ?? {};
      if (prefs.daily_reminder === false) continue;
      if (!profile.reminder_time || !profile.timezone) continue;

      const [reminderHour, reminderMinute] = profile.reminder_time.split(':').map(Number);
      if (isNaN(reminderHour) || isNaN(reminderMinute)) continue;

      const userTime = getCurrentTimeInZone(profile.timezone);
      if (!userTime) continue;

      const matchesHour = userTime.hour === reminderHour;
      const minuteDiff  = Math.abs(userTime.minute - reminderMinute);
      if (matchesHour && minuteDiff <= 15) {
        usersToCheck.push(profile.id);
      }
    }

    if (usersToCheck.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No users scheduled for this time' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: goals, error: goalsError } = await supabase
      .from('goals')
      .select('id, title, user_id')
      .in('user_id', usersToCheck)
      .eq('status', 'active');

    if (goalsError) throw goalsError;

    const { data: todayCheckins } = await supabase
      .from('checkins')
      .select('user_id, goal_id')
      .in('user_id', usersToCheck)
      .gte('checked_in_at', todayStart.toISOString())
      .lte('checked_in_at', todayEnd.toISOString());

    const checkedInSet = new Set(
      (todayCheckins ?? []).map((c: any) => `${c.user_id}:${c.goal_id}`)
    );

    const toNotify = new Map<string, string>();
    for (const goal of (goals ?? []) as any[]) {
      const key = `${goal.user_id}:${goal.id}`;
      if (!checkedInSet.has(key) && !toNotify.has(goal.user_id)) {
        toNotify.set(goal.user_id, goal.title);
      }
    }

    const results = await Promise.allSettled(
      [...toNotify.entries()].map(async ([userId, goalTitle]) => {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            user_id: userId,
            title: "Don't break your streak! 🔥",
            body: `You haven't checked in on "${goalTitle}" today.`,
            url: '/dashboard',
            type: 'daily_reminder',
            pref_key: 'daily_reminder',
          }),
        });
        return { userId, status: res.status };
      }),
    );

    return new Response(
      JSON.stringify({ checked: usersToCheck.length, sent: toNotify.size, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[daily-reminder] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
