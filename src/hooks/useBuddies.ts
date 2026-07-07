import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store/useAuthStore';
import type { BuddyRequest, Buddy } from '../types/buddy';
import type { Profile } from '../store/useAuthStore';
import type { StreakData } from './useCheckins';

// ─── Count of incoming pending buddy requests (for nav badge) ────
export const useIncomingBuddyRequestCount = () => {
  const { user } = useAuthStore();

  return useQuery<number>({
    queryKey: ['buddy-requests-count', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from('buddy_requests')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('status', 'pending');
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    staleTime: 0,           // always refetch after invalidation
    refetchInterval: 30_000, // poll every 30s as safety net
  });
};

// ─── Search profiles by username OR email ────────────────────────
export const useSearchProfiles = (query: string) => {
  const { user } = useAuthStore();
  const cleaned = query.trim().toLowerCase();

  return useQuery<Profile[]>({
    queryKey: ['profiles-search', cleaned],
    queryFn: async () => {
      if (!user || cleaned.length < 3) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, username, email, avatar_url, timezone, last_seen_at')
        .or(`email.ilike.%${cleaned}%,username.ilike.%${cleaned}%`)
        .neq('id', user.id)
        .limit(10);

      if (error) throw error;
      return (data || []) as Profile[];
    },
    enabled: !!user && cleaned.length >= 3,
    staleTime: 20_000,
  });
};

// ─── Fetch buddy requests (merged hook) ─────────────────────────
// direction: 'incoming' = pending requests sent TO me
//            'outgoing' = pending requests I sent
//            'all'      = both (default for inbox-style views)
export const useBuddyRequests = (direction: 'incoming' | 'outgoing' | 'all' = 'incoming') => {
  const { user } = useAuthStore();

  return useQuery<BuddyRequest[]>({
    queryKey: ['buddy-requests', user?.id, direction],
    queryFn: async () => {
      if (!user) return [];
      let q = supabase
        .from('buddy_requests')
        .select('*, sender:sender_id(*), receiver:receiver_id(*)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (direction === 'incoming') q = q.eq('receiver_id', user.id);
      else if (direction === 'outgoing') q = q.eq('sender_id', user.id);
      else q = q.or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as BuddyRequest[];
    },
    enabled: !!user,
    staleTime: 15_000,
  });
};

// ─── Fetch accepted buddies (user-scoped, not goal-scoped) ───────
export const useBuddies = () => {
  const { user } = useAuthStore();

  return useQuery<Buddy[]>({
    queryKey: ['buddies', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('buddy_requests')
        .select('sender_id, receiver_id, sender:sender_id(*), receiver:receiver_id(*)')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

      if (error) throw error;

      const seen = new Set<string>();
      const result: Buddy[] = [];

      for (const row of (data || []) as any[]) {
        const isSender = row.sender_id === user.id;
        const buddyId = isSender ? row.receiver_id : row.sender_id;
        const buddyProfile = isSender ? row.receiver : row.sender;

        if (!seen.has(buddyId)) {
          seen.add(buddyId);
          result.push({
            user_id: user.id,
            buddy_id: buddyId,
            profile: buddyProfile as Profile,
          });
        }
      }

      return result;
    },
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
};

// ─── Keep useGoalBuddies as a thin wrapper over useBuddies ───────
// GoalChat and GoalDetail still call this — now just returns all buddies
// since the relationship is user-scoped, not goal-scoped.
export const useGoalBuddies = (_goalId: string) => {
  return useBuddies();
};

// ─── Fetch buddy's streak for a goal ─────────────────────────────
export const useBuddyStreak = (goalId: string, buddyId: string) => {
  const { user } = useAuthStore();

  return useQuery<StreakData>({
    queryKey: ['buddy-streak', goalId, buddyId],
    queryFn: async () => {
      if (!user || !goalId || !buddyId) {
        return { current_streak: 0, longest_streak: 0, last_checkin_date: null };
      }
      const { data, error } = await supabase.rpc('calculate_streak', {
        goal_id: goalId,
        user_id: buddyId,
      });
      if (error) throw error;
      return (data as StreakData) || { current_streak: 0, longest_streak: 0, last_checkin_date: null };
    },
    enabled: !!user && !!goalId && !!buddyId,
    staleTime: 60_000,
  });
};

// ─── Send buddy request ──────────────────────────────────────────
export const useSendBuddyRequest = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ receiverId }: { receiverId: string }) => {
      if (!user) throw new Error('Not authenticated');

      // Check if a request already exists in either direction
      const { data: existing } = await supabase
        .from('buddy_requests')
        .select('id')
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${receiverId}),` +
          `and(sender_id.eq.${receiverId},receiver_id.eq.${user.id})`
        )
        .limit(1)
        .maybeSingle();

      if (existing) throw new Error('A request already exists with this user.');

      const { data, error } = await supabase
        .from('buddy_requests')
        .insert({ sender_id: user.id, receiver_id: receiverId, status: 'pending' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buddy-requests', user?.id] });
    },
  });
};

// ─── Respond to buddy request ────────────────────────────────────
export const useRespondBuddyRequest = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: 'accepted' | 'declined' }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('buddy_requests')
        .update({ status })
        .eq('id', requestId)
        .eq('receiver_id', user.id) // only receiver can respond
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async ({ requestId }) => {
      // Optimistically remove from inbox list and decrement badge immediately
      queryClient.setQueryData<{ id: string }[]>(
        ['buddy-requests', user?.id, 'incoming'],
        (old) => old?.filter((r) => r.id !== requestId)
      );
      queryClient.setQueryData<number>(
        ['buddy-requests-count', user?.id],
        (old = 0) => Math.max(0, old - 1)
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buddy-requests', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['buddy-requests-count', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['buddies', user?.id] });
    },
  });
};

// ─── Remove buddy ────────────────────────────────────────────────
export const useRemoveBuddy = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ buddyId }: { buddyId: string }) => {
      if (!user) throw new Error('Not authenticated');

      // Delete all challenges between the two users first
      const { error: challengeErr } = await supabase
        .from('challenges')
        .delete()
        .or(
          `and(challenger_id.eq.${user.id},opponent_id.eq.${buddyId}),` +
          `and(challenger_id.eq.${buddyId},opponent_id.eq.${user.id})`
        );
      if (challengeErr) throw challengeErr;

      // Then remove the buddy relationship
      const { error } = await supabase
        .from('buddy_requests')
        .delete()
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${buddyId}),` +
          `and(sender_id.eq.${buddyId},receiver_id.eq.${user.id})`
        );
      if (error) throw error;
      return buddyId;
    },
    onMutate: async ({ buddyId }) => {
      await queryClient.cancelQueries({ queryKey: ['buddies', user?.id] });
      const prev = queryClient.getQueryData<Buddy[]>(['buddies', user?.id]);
      queryClient.setQueryData<Buddy[]>(['buddies', user?.id], (old) =>
        old ? old.filter((b) => b.buddy_id !== buddyId) : []
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['buddies', user?.id], ctx.prev);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buddies', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['buddy-requests', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['challenges'] });
      queryClient.invalidateQueries({ queryKey: ['challenges-pending'] });
    },
  });
};

// ─── Legacy aliases ───────────────────────────────────────────────
// useBuddyRequestsForGoal previously returned outgoing requests scoped to a
// goal — goals are no longer the scope unit, so this now returns all incoming
// requests (the correct semantic for an inbox-style component).
export const useBuddyRequestsForGoal = (_goalId: string) =>
  useBuddyRequests('incoming');
