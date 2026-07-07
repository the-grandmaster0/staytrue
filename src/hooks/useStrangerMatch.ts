import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store/useAuthStore';
import type { MatchBuddyResult, MatchingPoolEntry } from '../types/buddy';
import type { Profile } from '../store/useAuthStore';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type MatchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'waiting'; poolEntry: MatchingPoolEntry }
  | { status: 'matched'; buddy: Profile }
  | { status: 'error'; message: string };

// Invalidate all buddy-related query keys so UI updates instantly after a match
function invalidateBuddyQueries(queryClient: ReturnType<typeof useQueryClient>, _goalId: string) {
  queryClient.invalidateQueries({ queryKey: ['buddies'] });
  queryClient.invalidateQueries({ queryKey: ['buddy-requests'] });
  queryClient.invalidateQueries({ queryKey: ['goals-find-buddy'] });
}

export function useStrangerMatch(goalId: string) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [matchState, setMatchState] = useState<MatchState>({ status: 'idle' });
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Subscribe to pool row updates (waiting state) ─────────────────────────
  const subscribeToPool = useCallback(
    (poolEntryId: string, poolGoalId: string) => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      const channel = supabase
        .channel(`matching_pool:${poolEntryId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'matching_pool',
            filter: `id=eq.${poolEntryId}`,
          },
          async (payload) => {
            const updated = payload.new as MatchingPoolEntry;
            if (!updated.is_matched) return;

            // Use matched_with_user_id from the pool row — set directly by the
            // match_buddy DB function — so we never accidentally fetch an older
            // existing buddy relationship instead of the newly matched one.
            const matchedUserId = updated.matched_with_user_id;

            if (!matchedUserId) {
              // Fallback: pool row doesn't carry the matched ID (older schema),
              // fetch the most recently created accepted request as a best-effort.
              const { data: reqData } = await supabase
                .from('buddy_requests')
                .select('sender_id, receiver_id, sender:sender_id(*), receiver:receiver_id(*)')
                .eq('status', 'accepted')
                .or(`sender_id.eq.${user?.id},receiver_id.eq.${user?.id}`)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (reqData) {
                const buddy = (
                  (reqData as any).sender_id === user?.id
                    ? (reqData as any).receiver
                    : (reqData as any).sender
                ) as Profile;
                setMatchState({ status: 'matched', buddy });
                invalidateBuddyQueries(queryClient, poolGoalId);
              }
            } else {
              // Happy path: fetch the exact matched user's profile directly.
              const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', matchedUserId)
                .single();

              if (profileData) {
                setMatchState({ status: 'matched', buddy: profileData as Profile });
                invalidateBuddyQueries(queryClient, poolGoalId);
              }
            }

            supabase.removeChannel(channel);
            channelRef.current = null;
          }
        )
        .subscribe();

      channelRef.current = channel;
    },
    [user?.id, queryClient]
  );

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  // ── Trigger match ─────────────────────────────────────────────────────────
  const triggerMatch = useCallback(async () => {
    if (!user) return;
    setMatchState({ status: 'loading' });

    try {
      const { data, error } = await supabase.rpc('match_buddy', {
        p_user_id: user.id,
        p_goal_id: goalId,
      });

      if (error) throw error;

      const result = data as MatchBuddyResult;

      if (result.matched && result.buddy) {
        setMatchState({ status: 'matched', buddy: result.buddy });
        // Invalidate so GoalDetail's Buddies tab and chat show the new buddy
        invalidateBuddyQueries(queryClient, goalId);
      } else {
        // Waiting — fetch our pool entry to subscribe to it
        const { data: poolRow, error: poolError } = await supabase
          .from('matching_pool')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (poolError || !poolRow) {
          throw new Error('Could not retrieve pool entry. Please try again.');
        }

        const entry = poolRow as MatchingPoolEntry;
        setMatchState({ status: 'waiting', poolEntry: entry });
        // Pass both the pool entry ID and the goal_id for query lookup
        subscribeToPool(entry.id, entry.goal_id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMatchState({ status: 'error', message: msg });
    }
  }, [user, goalId, queryClient, subscribeToPool]);

  // ── Cancel waiting ────────────────────────────────────────────────────────
  const cancelWaiting = useCallback(async () => {
    if (!user) return;
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    try {
      await supabase.rpc('leave_matching_pool', { p_user_id: user.id });
    } catch {
      // best-effort
    }
    setMatchState({ status: 'idle' });
  }, [user]);

  // ── Reset to idle ─────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setMatchState({ status: 'idle' });
  }, []);

  return { matchState, triggerMatch, cancelWaiting, reset };
}
