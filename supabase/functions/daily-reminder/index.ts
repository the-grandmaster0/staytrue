// supabase/functions/daily-reminder/index.ts
// Deno Edge Function — scheduled via pg_cron every hour.
// Finds users whose reminder_time matches current hour (in their timezone)
// and who haven't checked in today on any active goal.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Simple in-memory rate limiter (prevent abuse) ────────────────────────────
const rateLimitCache = new Map<string, number>();

function checkRateLimit(key: string, maxRequests = 1, windowMs = 60_000): boolean {
  const now = Date.now();
  const lastRun = rateLimitCache.get(key) || 0;

  if (now - lastRun < windowMs) {
    return false; // too soon
  }

  rateLimitCache.set(key, now);
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Rate limit: once per minute globally (cron should call once per day anyway)
  if (!checkRateLimit('daily-reminder', 1, 60_000)) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded. This function should be called once per day by pg_cron.' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Current UTC time
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    const today = now.toISOString().slice(0, 10);

    // Find users whose reminder_time (in their timezone) matches current UTC hour
    // We need to convert user's local time to UTC using their timezone
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select(`
        id,
        timezone,
        reminder_time,
        notification_prefs,
        push_subscriptions!inner ( id )
      `)
      .not('push_subscriptions.id', 'is', null);

    if (profilesError) throw profilesError;

    const usersToCheck: string[] = [];

    // Filter users whose reminder time is NOW (accounting for timezone conversion)
    for (const profile of (profiles ?? []) as any[]) {
      const prefs = profile.notification_prefs ?? {};
      if (prefs.daily_reminder === false) continue;
      if (!profile.reminder_time || !profile.timezone) continue;

      try {
        // Parse reminder_time (HH:MM format)
        const [reminderHour, reminderMinute] = profile.reminder_time.split(':').map(Number);
        
        // Create a date in user's timezone at their reminder time
        const userLocalTime = new Date().toLocaleString('en-US', {
          timeZone: profile.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        
        // Get current time in user's timezone
        const userNow = new Date(userLocalTime);
        const userHour = userNow.getHours();
        const userMinute = userNow.getMinutes();

        // Check if it's the user's reminder hour (±15 min window to avoid missing)
        if (userHour === reminderHour && Math.abs(userMinute - reminderMinute) <= 15) {
          usersToCheck.push(profile.id);
        }
      } catch (err) {
        console.error(`[daily-reminder] Failed to parse timezone for user ${profile.id}:`, err);
      }
    }

    if (usersToCheck.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No users scheduled for this hour', hour: currentHour }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Find active goals for these users
    const { data: goals, error } = await supabase
      .from('goals')
      .select('id, title, user_id')
      .in('user_id', usersToCheck)
      .eq('status', 'active');

    if (error) throw error;

    // Get today's check-ins
    const { data: todayCheckins } = await supabase
      .from('checkins')
      .select('user_id, goal_id')
      .eq('checkin_date', today)
      .in('user_id', usersToCheck);

    const checkedInSet = new Set(
      (todayCheckins ?? []).map((c: any) => `${c.user_id}:${c.goal_id}`)
    );

    // Collect users who have NOT checked in on any goal today
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
        hour: currentHour,
        results 
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
