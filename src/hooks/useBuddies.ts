import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store/useAuthStore';
import type { BuddyRequest, Buddy } from '../types/buddy';
import type { Profile } from '../store/useAuthStore';
import type { StreakData } from './useCheckins';

// ─── Search profiles by email ────────────────────────────────────
export const useSearchProfiles = (emailQuery: string) => {
  const { user } = useAuthStore();
  const cleaned = emailQuery.trim().toLowerCase();

  return useQuery<Profile[]>({
    queryKey: ['profiles-search', cleaned],
    queryFn: async () => {
      if (!user || cleaned.length < 3) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('email', `%${cleaned}%`);

      if (error) throw error;
      return (data || []) as Profile[];
    },
    enabled: !!user && cleaned.length >= 3,
    staleTime: 30_000,
  });
};

// ─── Fetch pending incoming buddy requests ──────────────────────
export const useBuddyRequests = () => {
  const { user } = useAuthStore();

  return useQuery<BuddyRequest[]>({
    queryKey: ['buddy-requests', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('buddy_requests')
        .select(`
          *,
          sender:sender_id(*),
          goal:goal_id(id, title)
        `)
        .eq('receiver_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as BuddyRequest[];
    },
    enabled: !!user,
    staleTime: 30_000,
  });
};

// ─── Fetch all requests for a specific goal (to check invite status) ─
export const useBuddyRequestsForGoal = (goalId: string) => {
  const { user } = useAuthStore();

  return useQuery<BuddyRequest[]>({
    queryKey: ['goal-buddy-requests', goalId],
    queryFn: async () => {
      if (!user || !goalId) return [];
      const { data, error } = await supabase
        .from('buddy_requests')
        .select(`
          *,
          sender:sender_id(*),
          receiver:receiver_id(*)
        `)
        .eq('goal_id', goalId);

      if (error) throw error;
      return (data || []) as unknown as BuddyRequest[];
    },
    enabled: !!user && !!goalId,
    staleTime: 0,
    refetchOnMount: 'always',
  });
};

// ─── Fetch accepted buddies for a goal ───────────────────────────
export const useGoalBuddies = (goalId: string) => {
  const { user } = useAuthStore();

  return useQuery<Buddy[]>({
    queryKey: ['goal-buddies', goalId],
    queryFn: async () => {
      if (!user || !goalId) return [];

      // Step 1: find all users who are accepted buddies with the current user
      // (across ANY goal — the request may be stored under the sender's goal_id)
      const { data: buddyRows, error: buddyError } = await supabase
        .from('buddy_requests')
        .select(`
          id,
          goal_id,
          sender_id,
          receiver_id,
          sender:sender_id(*),
          receiver:receiver_id(*)
        `)
        .eq('status', 'accepted')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

      if (buddyError) throw buddyError;
      if (!buddyRows || buddyRows.length === 0) return [];

      // Step 2: collect all buddy user IDs
      const buddyIds = buddyRows.map((row: any) =>
        row.sender_id === user.id ? row.receiver_id : row.sender_id
      );

      // Step 3: check which of those buddies also have the target goalId
      // as one of their goals (i.e. they are linked to this goal)
      const { data: goalRows, error: goalError } = await supabase
        .from('goals')
        .select('id, user_id')
        .in('user_id', [user.id, ...buddyIds])
        .eq('id', goalId);

      if (goalError) throw goalError;

      // If the goal exists for this user, show all accepted buddies on it
      if (!goalRows || goalRows.length === 0) return [];

      // Deduplicate — one entry per buddy
      const seen = new Set<string>();
      const result: Buddy[] = [];

      for (const row of buddyRows as any[]) {
        const isSender = row.sender_id === user.id;
        const buddyId = isSender ? row.receiver_id : row.sender_id;
        const buddyProfile = isSender ? row.receiver : row.sender;

        if (!seen.has(buddyId)) {
          seen.add(buddyId);
          result.push({
            goal_id: goalId,
            user_id: user.id,
            buddy_id: buddyId,
            profile: buddyProfile as Profile,
          });
        }
      }

      return result;
    },
    enabled: !!user && !!goalId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
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
    mutationFn: async ({ goalId, receiverId }: { goalId: string; receiverId: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('buddy_requests')
        .insert({
          goal_id: goalId,
          sender_id: user.id,
          receiver_id: receiverId,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { goalId }) => {
      queryClient.invalidateQueries({ queryKey: ['goal-buddy-requests', goalId] });
    },
  });
};

// ─── Respond to buddy request (Accept/Decline) ─────────────────────
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
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['buddy-requests', user?.id] });
      if (data && data.goal_id) {
        queryClient.invalidateQueries({ queryKey: ['goal-buddies', data.goal_id] });
        queryClient.invalidateQueries({ queryKey: ['goal-buddy-requests', data.goal_id] });
      }
    },
  });
};

// ─── Remove Buddy ────────────────────────────────────────────────
export const useRemoveBuddy = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ goalId, buddyId }: { goalId: string; buddyId: string }) => {
      if (!user) throw new Error('Not authenticated');
      // A request is deleted to sever the buddy bond
      const { error } = await supabase
        .from('buddy_requests')
        .delete()
        .eq('goal_id', goalId)
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${buddyId}),and(sender_id.eq.${buddyId},receiver_id.eq.${user.id})`);

      if (error) throw error;
      return { goalId, buddyId };
    },
    onMutate: async ({ goalId, buddyId }) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: ['goal-buddies', goalId] });

      // Snapshot previous value
      const previousBuddies = queryClient.getQueryData<Buddy[]>(['goal-buddies', goalId]);

      // Optimistically update list
      queryClient.setQueryData<Buddy[]>(['goal-buddies', goalId], (old) => {
        return old ? old.filter((b) => b.buddy_id !== buddyId) : [];
      });

      return { previousBuddies };
    },
    onError: (_err, { goalId }, context) => {
      if (context?.previousBuddies) {
        queryClient.setQueryData(['goal-buddies', goalId], context.previousBuddies);
      }
    },
    onSuccess: ({ goalId }) => {
      queryClient.invalidateQueries({ queryKey: ['goal-buddies', goalId] });
      queryClient.invalidateQueries({ queryKey: ['goal-buddy-requests', goalId] });
    },
  });
};
