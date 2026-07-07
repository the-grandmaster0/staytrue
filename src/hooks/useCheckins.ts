import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { sendEmail } from '../lib/sendEmail';
import { sanitizeTrunc } from '../lib/sanitize';
import { useAuthStore } from '../store/useAuthStore';

export interface Checkin {
  id: string;
  goal_id: string;
  user_id: string;
  checked_in_at: string;
  note: string | null;
}

export interface StreakData {
  current_streak: number;
  longest_streak: number;
  last_checkin_date: string | null;
}

// ─── Today's check-ins for a goal ────────────────────────────────
/**
 * Returns today's date string (YYYY-MM-DD) in the user's local timezone.
 * Using local time avoids the bug where a check-in at e.g. 10pm UTC-5
 * (= tomorrow UTC) would be invisible to useTodayCheckin, letting the user
 * check in again on the same local day.
 */
const todayLocal = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const useTodayCheckin = (goalId: string) => {
  const { user } = useAuthStore();
  return useQuery<Checkin | null>({
    queryKey: ['checkin-today', goalId],
    queryFn: async () => {
      if (!user) return null;
      const today = todayLocal();
      // Build local-timezone midnight boundaries as ISO strings
      const startOfDay = new Date(`${today}T00:00:00`).toISOString();
      const endOfDay   = new Date(`${today}T23:59:59.999`).toISOString();
      const { data, error } = await supabase
        .from('checkins')
        .select('*')
        .eq('goal_id', goalId)
        .eq('user_id', user.id)
        .gte('checked_in_at', startOfDay)
        .lte('checked_in_at', endOfDay)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!goalId,
    staleTime: 60_000,
  });
};

// ─── All checkins for a goal (last 12 weeks) ─────────────────────
export const useCheckins = (goalId: string) => {
  const { user } = useAuthStore();

  return useQuery<Checkin[]>({
    queryKey: ['checkins', goalId],
    queryFn: async () => {
      if (!user) return [];
      // Compute the cutoff inside queryFn so it's always fresh on each fetch,
      // even in long-running sessions where the hook was first called days ago.
      const twelveWeeksAgo = new Date();
      twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);
      const { data, error } = await supabase
        .from('checkins')
        .select('*')
        .eq('goal_id', goalId)
        .eq('user_id', user.id)
        .gte('checked_in_at', twelveWeeksAgo.toISOString())
        .order('checked_in_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Checkin[];
    },
    enabled: !!user && !!goalId,
    staleTime: 60_000,
  });
};

// ─── Streak data via RPC function ────────────────────────────────
export const useStreak = (goalId: string) => {
  const { user } = useAuthStore();
  return useQuery<StreakData>({
    queryKey: ['streak', goalId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('calculate_streak', {
        goal_id: goalId,
      });
      if (error) throw error;
      return (data as StreakData) || { current_streak: 0, longest_streak: 0, last_checkin_date: null };
    },
    enabled: !!user && !!goalId,
    staleTime: 60_000,
  });
};

// ─── Perform a check-in ───────────────────────────────────────────
export const useCheckIn = () => {
  const { user, profile } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ goalId, note, goalTitle }: { goalId: string; note?: string; goalTitle?: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('checkins')
        .insert({
          goal_id: goalId,
          user_id: user.id,
          note: note ? sanitizeTrunc(note, 300) : null,
          checked_in_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return { checkin: data as Checkin, goalTitle };
    },
    onSuccess: ({ checkin, goalTitle }) => {
      const goalId = checkin.goal_id;
      queryClient.invalidateQueries({ queryKey: ['checkin-today', goalId] });
      queryClient.invalidateQueries({ queryKey: ['checkins', goalId] });
      queryClient.invalidateQueries({ queryKey: ['streak', goalId] });

      // Fire push notifications to all buddies
      (async () => {
        if (!user) return;
        const { data: buddies } = await supabase
          .from('buddy_requests')
          .select('sender_id, receiver_id')
          .eq('status', 'accepted')
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

        const buddyIds = new Set<string>();
        for (const row of buddies ?? []) {
          const buddyId = row.sender_id === user.id ? row.receiver_id : row.sender_id;
          buddyIds.add(buddyId);
        }

        const userName = profile?.full_name || profile?.username || 'Your buddy';
        const title = goalTitle || 'a goal';

        for (const buddyId of buddyIds) {
          sendEmail({
            user_id: buddyId,
            title: `🔥 ${userName} checked in!`,
            body: `Just completed "${title}"`,
            url: '/dashboard',
            type: 'checkin',
            pref_key: 'buddy_checkin',
          });
        }
      })();
    },
  });
};

// ─── Undo today's check-in ────────────────────────────────────────
export const useUndoCheckin = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ goalId: _goalId, checkinId }: { goalId: string; checkinId: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('checkins')
        .delete()
        .eq('id', checkinId)
        .eq('user_id', user.id); // RLS safety: only delete own checkins
      if (error) throw error;
    },
    onSuccess: (_data, { goalId }) => {
      queryClient.invalidateQueries({ queryKey: ['checkin-today', goalId] });
      queryClient.invalidateQueries({ queryKey: ['checkins', goalId] });
      queryClient.invalidateQueries({ queryKey: ['streak', goalId] });
    },
  });
};
