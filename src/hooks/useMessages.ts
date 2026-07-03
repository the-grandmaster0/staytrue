import { useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store/useAuthStore';
import type { Message } from '../types/message';

// ─── Query key helpers ────────────────────────────────────────────────────────
export const messagesKey = (goalId: string) => ['messages', goalId] as const;
export const unreadCountKey = () => ['messages-unread-count'] as const;

// ─── Module-level channel registry ───────────────────────────────────────────
// One channel per USER (not per goal) — filters by receiver_id globally.
// This means one subscription handles all incoming messages for the user.
const channelRegistry = new Map<string, { channel: ReturnType<typeof supabase.channel>; refs: number }>();

function getRegistryKey(userId: string, goalId: string) {
  // Key per goal so each GoalChat instance has independent lifecycle
  return `${userId}:${goalId}`;
}

function acquireChannel(
  userId: string,
  goalId: string,
  onMessage: (msg: Message) => void,
) {
  const key = getRegistryKey(userId, goalId);
  const existing = channelRegistry.get(key);

  if (existing) {
    existing.refs += 1;
    return key;
  }

  const channelName = `msgs:${goalId}:${userId}:${Date.now()}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        // Filter by receiver_id so this user gets ALL messages sent to them
        // regardless of which goal_id was used (fixes cross-goal stranger match)
        filter: `receiver_id=eq.${userId}`,
      },
      (payload) => {
        const newMsg = payload.new as Message;
        onMessage(newMsg);
      },
    )
    .subscribe();

  channelRegistry.set(key, { channel, refs: 1 });
  return key;
}

function releaseChannel(key: string) {
  const entry = channelRegistry.get(key);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    supabase.removeChannel(entry.channel);
    channelRegistry.delete(key);
  }
}

// ─── Fetch messages for a goal ────────────────────────────────────────────────
export function useMessages(goalId: string) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const query = useQuery<Message[]>({
    queryKey: messagesKey(goalId),
    queryFn: async () => {
      if (!user || !goalId) return [];

      // First find the buddy for this goal — could be on either goal_id
      // because stranger match creates buddy_requests on each user's own goal
      const { data: buddyRows } = await supabase
        .from('buddy_requests')
        .select('sender_id, receiver_id')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .limit(10);

      if (!buddyRows || buddyRows.length === 0) return [];

      // Collect all buddy IDs
      const buddyIds = buddyRows.map((r: any) =>
        r.sender_id === user.id ? r.receiver_id : r.sender_id
      );

      // Fetch ALL messages between me and any of my buddies
      // regardless of which goal_id the message was stored under
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(
          buddyIds.map((bid: string) =>
            `and(sender_id.eq.${user.id},receiver_id.eq.${bid}),and(sender_id.eq.${bid},receiver_id.eq.${user.id})`
          ).join(',')
        )
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as Message[];
    },
    enabled: !!user && !!goalId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // ── Realtime subscription via registry (safe against double-mount) ────────
  useEffect(() => {
    if (!user?.id || !goalId) return;

    const userId = user.id;

    const key = acquireChannel(userId, goalId, (newMsg) => {
      queryClient.setQueryData<Message[]>(messagesKey(goalId), (old = []) => {
        if (old.some((m) => m.id === newMsg.id)) return old;
        return [...old, newMsg];
      });
      if (newMsg.receiver_id === userId) {
        queryClient.invalidateQueries({ queryKey: unreadCountKey() });
      }
    });

    return () => releaseChannel(key);
  }, [user?.id, goalId, queryClient]);

  return query;
}

// ─── Total unread count across ALL goals (for nav badge) ─────────────────────
export function useUnreadMessageCount() {
  const { user } = useAuthStore();

  return useQuery<number>({
    queryKey: unreadCountKey(),
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .is('read_at', null);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ─── Mark all unread messages as read (for the current user) ─────────────────
export function useMarkMessagesRead(goalId: string) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useCallback(async () => {
    if (!user) return;
    const now = new Date().toISOString();

    // Optimistically update the local cache for this goal's messages
    queryClient.setQueryData<Message[]>(messagesKey(goalId), (old = []) =>
      old.map((m) =>
        m.receiver_id === user.id && m.read_at === null ? { ...m, read_at: now } : m,
      ),
    );

    // Mark ALL unread messages where this user is receiver — regardless of goal_id
    // (fixes cross-goal stranger match where messages are stored under sender's goal)
    await supabase
      .from('messages')
      .update({ read_at: now })
      .eq('receiver_id', user.id)
      .is('read_at', null);

    // Clear the nav badge
    queryClient.setQueryData(unreadCountKey(), 0);
    queryClient.invalidateQueries({ queryKey: unreadCountKey() });
  }, [user, goalId, queryClient]);
}

// ─── Send a message ───────────────────────────────────────────────────────────
export function useSendMessage(goalId: string) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      receiverId,
      content,
      messageType = 'text',
      reactionKey,
    }: {
      receiverId: string;
      content: string;
      messageType?: 'text' | 'reaction';
      reactionKey?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('messages')
        .insert({
          goal_id: goalId,
          sender_id: user.id,
          receiver_id: receiverId,
          content,
          message_type: messageType,
          reaction_key: reactionKey ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Message;
    },
    onSuccess: (newMsg) => {
      queryClient.setQueryData<Message[]>(messagesKey(goalId), (old = []) => {
        if (old.some((m) => m.id === newMsg.id)) return old;
        return [...old, newMsg];
      });
    },
  });
}
