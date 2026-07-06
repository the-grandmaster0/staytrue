import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store/useAuthStore';
import type { Challenge, ChallengeCategory, ChallengeDuration } from '../types/challenge';

// ─── Query keys ──────────────────────────────────────────────────────────────
export const challengesKey = () => ['challenges'] as const;

// ─── Fetch all challenges for the current user ────────────────────────────────
export function useChallenges() {
  const { user } = useAuthStore();

  return useQuery<Challenge[]>({
    queryKey: challengesKey(),
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('challenges')
        .select('*, challenger:challenger_id(*), opponent:opponent_id(*)')
        .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as Challenge[];
    },
    enabled: !!user,
    staleTime: 15_000,
  });
}

// ─── Pending incoming challenges (for notification badge) ─────────────────────
export function usePendingChallenges() {
  const { user } = useAuthStore();

  return useQuery<Challenge[]>({
    queryKey: ['challenges-pending', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('challenges')
        .select('*, challenger:challenger_id(*)')
        .eq('opponent_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Challenge[];
    },
    enabled: !!user,
    staleTime: 15_000,
  });
}

// ─── Send a challenge ─────────────────────────────────────────────────────────
export function useSendChallenge() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      opponentId,
      category,
      durationDays,
    }: {
      opponentId: string;
      category: ChallengeCategory;
      durationDays: ChallengeDuration;
    }) => {
      if (!user) throw new Error('Not authenticated');

      // Check no active/pending challenge already exists between these two
      const { data: existing } = await supabase
        .from('challenges')
        .select('id, status')
        .or(
          `and(challenger_id.eq.${user.id},opponent_id.eq.${opponentId}),` +
          `and(challenger_id.eq.${opponentId},opponent_id.eq.${user.id})`
        )
        .in('status', ['pending', 'active'])
        .limit(1)
        .maybeSingle();

      if (existing) throw new Error('A challenge is already active or pending with this buddy.');

      const { data, error } = await supabase
        .from('challenges')
        .insert({
          challenger_id: user.id,
          opponent_id: opponentId,
          category,
          duration_days: durationDays,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data as Challenge;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: challengesKey() });
    },
  });
}

// ─── Respond to a challenge (accept / decline) ────────────────────────────────
export function useRespondChallenge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      challengeId,
      accept,
    }: {
      challengeId: string;
      accept: boolean;
    }) => {
      const { data, error } = await supabase.rpc('respond_challenge', {
        p_challenge_id: challengeId,
        p_status: accept ? 'active' : 'declined',
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: challengesKey() });
      queryClient.invalidateQueries({ queryKey: ['challenges-pending'] });
    },
  });
}

// ─── Delete / cancel a challenge ──────────────────────────────────────────────
// Works for: challenger cancelling pending, either party deleting completed/declined
export function useDeleteChallenge() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (challengeId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('challenges')
        .delete()
        .eq('id', challengeId)
        .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: challengesKey() });
      queryClient.invalidateQueries({ queryKey: ['challenges-pending'] });
    },
  });
}

// ─── Refresh scores for a challenge (call after check-in) ─────────────────────
export function useRefreshChallengeScores() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (challengeId: string) => {
      const { data, error } = await supabase.rpc('refresh_challenge_scores', {
        p_challenge_id: challengeId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: challengesKey() });
    },
  });
}

// ─── Realtime subscription — live score updates ───────────────────────────────
export function useChallengesFeed() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`challenges-feed:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'challenges' },
        (payload) => {
          const row = (payload.new || payload.old) as Challenge;
          if (
            row.challenger_id === user.id ||
            row.opponent_id === user.id
          ) {
            queryClient.invalidateQueries({ queryKey: challengesKey() });
            queryClient.invalidateQueries({ queryKey: ['challenges-pending', user.id] });
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user, queryClient]);
}
