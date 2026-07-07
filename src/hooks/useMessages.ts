import { useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store/useAuthStore';
import type { Message } from '../types/message';

// ─── Query key helpers ────────────────────────────────────────────────────────
export const messagesKey = (buddyId: string) => ['messages', buddyId] as const;
export const unreadCountKey = () => ['messages-unread-count'] as const;

// ─── Module-level channel registry ───────────────────────────────────────────
// One channel per conversation (userId:buddyId pair).
const channelRegistry = new Map<string, { channel: ReturnType<typeof supabase.channel>; refs: number }>();

function getRegistryKey(userId: string, buddyId: string) {
  return `${userId}:${buddyId}`;
}

function acquireChannel(
  userId: string,
  buddyId: string,
  onMessage: (msg: Message) => void,
) {
  const key = getRegistryKey(userId, buddyId);
  const existing = channelRegistry.get(key);

  if (existing) {
    existing.refs += 1;
    return key;
  }

  const channelName = `msgs:${userId}:${buddyId}:${Date.now()}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${userId}`,
      },
      (payload) => {
        const newMsg = payload.new as Message;
        // Only handle messages from this specific buddy
        if (newMsg.sender_id === buddyId) {
          onMessage(newMsg);
        }
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

// ─── Fetch messages between current user and a specific buddy ─────────────────
export function useMessages(buddyId: string) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const query = useQuery<Message[]>({
    queryKey: messagesKey(buddyId),
    queryFn: async () => {
      if (!user || !buddyId) return [];

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${buddyId}),` +
          `and(sender_id.eq.${buddyId},receiver_id.eq.${user.id})`
        )
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as Message[];
    },
    enabled: !!user && !!buddyId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id || !buddyId) return;

    const userId = user.id;

    const key = acquireChannel(userId, buddyId, (newMsg) => {
      queryClient.setQueryData<Message[]>(messagesKey(buddyId), (old = []) => {
        if (old.some((m) => m.id === newMsg.id)) return old;
        return [...old, newMsg];
      });
      queryClient.invalidateQueries({ queryKey: unreadCountKey() });
    });

    return () => releaseChannel(key);
  }, [user?.id, buddyId, queryClient]);

  return query;
}

// ─── Total unread count across ALL conversations (for nav badge) ──────────────
// Only counts messages from currently accepted buddies — deleted buddies are excluded.
export function useUnreadMessageCount() {
  const { user } = useAuthStore();

  return useQuery<number>({
    queryKey: unreadCountKey(),
    queryFn: async () => {
      if (!user) return 0;

      // Get accepted buddy IDs first so we only count messages from active buddies
      const { data: buddyRows } = await supabase
        .from('buddy_requests')
        .select('sender_id, receiver_id')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

      if (!buddyRows || buddyRows.length === 0) return 0;

      const buddyIds = buddyRows.map((r: { sender_id: string; receiver_id: string }) =>
        r.sender_id === user.id ? r.receiver_id : r.sender_id
      );

      const { count, error } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .in('sender_id', buddyIds)
        .is('read_at', null);

      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

// ─── Mark messages from a specific buddy as read ──────────────────────────────
export function useMarkMessagesRead(buddyId: string) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useCallback(async () => {
    if (!user || !buddyId) return;
    const now = new Date().toISOString();

    // Optimistically clear unread dot in the conversation list
    queryClient.setQueryData<{ buddy: { id: string }; lastMessage: unknown; unreadCount: number }[]>(
      ['messages-overview', user.id],
      (old) => old?.map((c) => c.buddy.id === buddyId ? { ...c, unreadCount: 0 } : c)
    );

    // Snapshot unread count from this buddy BEFORE the optimistic update marks them read
    const cachedMessages = queryClient.getQueryData<Message[]>(messagesKey(buddyId)) ?? [];
    const unreadFromBuddy = cachedMessages.filter(
      (m) => m.sender_id === buddyId && m.read_at === null,
    ).length;

    // Optimistically update the message cache
    queryClient.setQueryData<Message[]>(messagesKey(buddyId), (old = []) =>
      old.map((m) =>
        m.sender_id === buddyId && m.read_at === null ? { ...m, read_at: now } : m,
      ),
    );

    // Subtract the exact count from the nav badge
    queryClient.setQueryData(unreadCountKey(), (old: number = 0) =>
      Math.max(0, old - unreadFromBuddy),
    );

    // Persist to DB
    await supabase
      .from('messages')
      .update({ read_at: now })
      .eq('receiver_id', user.id)
      .eq('sender_id', buddyId)
      .is('read_at', null);

    // Refetch authoritative counts
    queryClient.invalidateQueries({ queryKey: unreadCountKey() });
    queryClient.invalidateQueries({ queryKey: ['messages-overview', user.id] });
  }, [user, buddyId, queryClient]);
}

// ─── Send a message to a buddy ────────────────────────────────────────────────
export function useSendMessage(buddyId: string) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      content,
      messageType = 'text',
      reactionKey,
    }: {
      content: string;
      messageType?: 'text' | 'reaction';
      reactionKey?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('messages')
        .insert({
          goal_id: null,
          sender_id: user.id,
          receiver_id: buddyId,
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
      queryClient.setQueryData<Message[]>(messagesKey(buddyId), (old = []) => {
        if (old.some((m) => m.id === newMsg.id)) return old;
        return [...old, newMsg];
      });
    },
  });
}
