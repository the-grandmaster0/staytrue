// supabase/functions/daily-reminder/index.ts
// Deno Edge Function — scheduled via pg_cron every hour.
// Finds users whose reminder_time matches current hour (in their timezone)
// and who haven't checked in today on any active goal.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Get current hour + minute in a given IANA timezone ───────────────────────
// Uses Intl.DateTimeFormat parts — reliable in Deno and avoids Date parsing bugs.
function getCurrentTimeInZone(timezone: string): { hour: number; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false, // 0-23
    }).formatToParts(new Date());

    const hourPart   = parts.find((p) => p.type === 'hour')?.value;
    const minutePart = parts.find((p) => p.type === 'minute')?.value;

    if (!hourPart || !minutePart) return null;

    let hour = parseInt(hourPart, 10);
    const minute = parseInt(minutePart, 10);

    // Some runtimes return 24 for midnight — normalise to 0
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

    const now   = new Date();
    // today's date in UTC — used for checkin range query
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setUTCHours(23, 59, 59, 999);

    // Fetch all users who have a push subscription
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select(`
        id,
        timezone,
        reminder_time,
        notification_prefs,
        push_subscriptions!inner ( id )
      `);

    if (profilesError) throw profilesError;

    const usersToCheck: string[] = [];

    for (const profile of (profiles ?? []) as any[]) {
      const prefs = profile.notification_prefs ?? {};
      if (prefs.daily_reminder === false) continue;
      if (!profile.reminder_time || !profile.timezone) continue;

      // Parse stored reminder_time — stored as "HH:MM" in 24h format
      const [reminderHour, reminderMinute] = profile.reminder_time.split(':').map(Number);
      if (isNaN(reminderHour) || isNaN(reminderMinute)) continue;

      // Get current time in user's timezone using reliable Intl API
      const userTime = getCurrentTimeInZone(profile.timezone);
      if (!userTime) continue;

      // Match within a ±15 minute window to absorb cron jitter
      const matchesHour = userTime.hour === reminderHour;
      const minuteDiff  = Math.abs(userTime.minute - reminderMinute);
      if (matchesHour && minuteDiff <= 15) {
        usersToCheck.push(profile.id);
      }
    }

    if (usersToCheck.length === 0) {
      const { hour } = getCurrentTimeInZone('UTC') ?? { hour: now.getUTCHours() };
      return new Response(
        JSON.stringify({ message: 'No users scheduled for this time', utcHour: hour }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Find active goals for these users
    const { data: goals, error: goalsError } = await supabase
      .from('goals')
      .select('id, title, user_id')
      .in('user_id', usersToCheck)
      .eq('status', 'active');

    if (goalsError) throw goalsError;

    // Get today's check-ins using the timestamp column (checked_in_at), not checkin_date
    const { data: todayCheckins } = await supabase
      .from('checkins')
      .select('user_id, goal_id')
      .in('user_id', usersToCheck)
      .gte('checked_in_at', todayStart.toISOString())
      .lte('checked_in_at', todayEnd.toISOString());

    const checkedInSet = new Set(
      (todayCheckins ?? []).map((c: any) => `${c.user_id}:${c.goal_id}`)
    );

    // Collect users who have NOT checked in on any active goal today
    const toNotify = new Map<string, string>();

    for (const goal of (goals ?? []) as any[]) {
      const key = `${goal.user_id}:${goal.id}`;
      if (!checkedInSet.has(key) && !toNotify.has(goal.user_id)) {
        toNotify.set(goal.user_id, goal.title);
      }
    }

    // Send pushes
    const results = await Promise.allSettled(
      [...toNotify.entries()].map(async ([userId, goalTitle]) => {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
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
            pref_key: 'daily_reminder',
          }),
        });
        return { userId, status: res.status };
      }),
    );

    return new Response(
      JSON.stringify({
        checked: usersToCheck.length,
        sent: toNotify.size,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[daily-reminder] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
