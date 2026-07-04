// supabase/functions/notify-challenge/index.ts
// Called by a Supabase Database Webhook on INSERT/UPDATE to public.challenges.
// Sends push notifications for:
//   - New challenge received (status = 'pending', opponent gets notified)
//   - Challenge accepted     (status = 'active',  challenger gets notified)
//   - Challenge completed    (status = 'completed', both get notified)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    // Database webhook sends { type, table, record, old_record, schema }
    const record     = payload.record as Record<string, any>;
    const oldRecord  = (payload.old_record ?? {}) as Record<string, any>;

    if (!record) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no record' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase    = createClient(supabaseUrl, serviceKey);

    const sendPush = async (userId: string, title: string, body: string, url: string) => {
      await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ user_id: userId, title, body, url, pref_key: 'challenges' }),
      });
    };

    // Helper: get a display name for a user
    const getName = async (userId: string): Promise<string> => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, username, email')
        .eq('id', userId)
        .single();
      return data?.full_name || data?.username || data?.email || 'Your buddy';
    };

    const status    = record.status as string;
    const oldStatus = oldRecord.status as string | undefined;

    // ── New challenge created (pending) ─────────────────────────────────────
    if (status === 'pending' && !oldStatus) {
      const challengerName = await getName(record.challenger_id);
      await sendPush(
        record.opponent_id,
        '⚔️ Challenge received!',
        `${challengerName} challenged you to a ${record.category} battle for ${record.duration_days} days.`,
        '/dashboard/challenges',
      );
    }

    // ── Challenge accepted (active) ──────────────────────────────────────────
    if (status === 'active' && oldStatus === 'pending') {
      const opponentName = await getName(record.opponent_id);
      await sendPush(
        record.challenger_id,
        '🔥 Challenge accepted!',
        `${opponentName} accepted your ${record.category} challenge. Battle starts now!`,
        '/dashboard/challenges',
      );
    }

    // ── Challenge completed ──────────────────────────────────────────────────
    if (status === 'completed' && oldStatus === 'active') {
      const winnerId = record.winner_id;
      const challengerScore = record.challenger_score;
      const opponentScore   = record.opponent_score;

      if (winnerId === record.challenger_id) {
        // Challenger won
        const opponentName = await getName(record.opponent_id);
        await Promise.all([
          sendPush(record.challenger_id, '🏆 You won!',
            `You beat ${opponentName} ${challengerScore}–${opponentScore} in the ${record.category} challenge!`,
            '/dashboard/challenges'),
          sendPush(record.opponent_id, '💀 You lost!',
            `You lost ${opponentScore}–${challengerScore} in the ${record.category} challenge. Challenge them back!`,
            '/dashboard/challenges'),
        ]);
      } else if (winnerId === record.opponent_id) {
        // Opponent won
        const challengerName = await getName(record.challenger_id);
        await Promise.all([
          sendPush(record.opponent_id, '🏆 You won!',
            `You beat ${challengerName} ${opponentScore}–${challengerScore} in the ${record.category} challenge!`,
            '/dashboard/challenges'),
          sendPush(record.challenger_id, '💀 You lost!',
            `You lost ${challengerScore}–${opponentScore} in the ${record.category} challenge. Get them next time!`,
            '/dashboard/challenges'),
        ]);
      } else {
        // Draw
        const [cName, oName] = await Promise.all([
          getName(record.challenger_id),
          getName(record.opponent_id),
        ]);
        await Promise.all([
          sendPush(record.challenger_id, '🤝 It\'s a draw!',
            `Your ${record.category} challenge vs ${oName} ended ${challengerScore}–${opponentScore}. Dead even!`,
            '/dashboard/challenges'),
          sendPush(record.opponent_id, '🤝 It\'s a draw!',
            `Your ${record.category} challenge vs ${cName} ended ${opponentScore}–${challengerScore}. Dead even!`,
            '/dashboard/challenges'),
        ]);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[notify-challenge]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
