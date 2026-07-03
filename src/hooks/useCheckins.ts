import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
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
const todayUTC = () => new Date().toISOString().split('T')[0]; // YYYY-MM-DD

export const useTodayCheckin = (goalId: string) => {
  const { user } = useAuthStore();
  return useQuery<Checkin | null>({
    queryKey: ['checkin-today', goalId],
    queryFn: async () => {
      if (!user) return null;
      const today = todayUTC();
      const { data, error } = await supabase
        .from('checkins')
        .select('*')
        .eq('goal_id', goalId)
        .eq('user_id', user.id)
        .gte('checked_in_at', `${today}T00:00:00Z`)
        .lt('checked_in_at', `${today}T23:59:59Z`)
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
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

  return useQuery<Checkin[]>({
    queryKey: ['checkins', goalId],
    queryFn: async () => {
      if (!user) return [];
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
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ goalId, note }: { goalId: string; note?: string }) => {
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
      return data as Checkin;
    },
    onSuccess: (_data, { goalId }) => {
      queryClient.invalidateQueries({ queryKey: ['checkin-today', goalId] });
      queryClient.invalidateQueries({ queryKey: ['checkins', goalId] });
      queryClient.invalidateQueries({ queryKey: ['streak', goalId] });
    },
  });
};
