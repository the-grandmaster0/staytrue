import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store/useAuthStore';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface NotificationPrefs {
  daily_reminder: boolean;
  buddy_checkin:  boolean;
  messages:       boolean;
  challenges:     boolean;
}

export interface AppNotification {
  id:         string;
  user_id:    string;
  type:       string;
  title:      string;
  body:       string;
  url:        string;
  read:       boolean;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Keys
// ─────────────────────────────────────────────────────────────────────────────

export const notificationsKey   = (userId: string) => ['notifications', userId] as const;
export const unreadNotifCountKey = (userId: string) => ['notifications-unread', userId] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Fetch all notifications for the current user (newest first)
// ─────────────────────────────────────────────────────────────────────────────

export function useNotifications() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const query = useQuery<AppNotification[]>({
    queryKey: notificationsKey(user?.id ?? ''),
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as AppNotification[];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  // ── Realtime: refresh on new notification ──────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          queryClient.setQueryData<AppNotification[]>(
            notificationsKey(user.id),
            (old = []) => [payload.new as AppNotification, ...old],
          );
          queryClient.setQueryData<number>(
            unreadNotifCountKey(user.id),
            (old = 0) => old + 1,
          );
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

  return query;
}

// ─────────────────────────────────────────────────────────────────────────────
// Unread count (for nav badge)
// ─────────────────────────────────────────────────────────────────────────────

export function useUnreadNotifCount() {
  const { user } = useAuthStore();

  return useQuery<number>({
    queryKey: unreadNotifCountKey(user?.id ?? ''),
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mark a single notification as read
// ─────────────────────────────────────────────────────────────────────────────

export function useMarkNotifRead() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
      return id;
    },
    onMutate: async (id) => {
      queryClient.setQueryData<AppNotification[]>(
        notificationsKey(user?.id ?? ''),
        (old = []) => old.map((n) => n.id === id ? { ...n, read: true } : n),
      );
      queryClient.setQueryData<number>(
        unreadNotifCountKey(user?.id ?? ''),
        (old = 0) => Math.max(0, old - 1),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: unreadNotifCountKey(user?.id ?? '') });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mark ALL notifications as read
// ─────────────────────────────────────────────────────────────────────────────

export function useMarkAllNotifsRead() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.setQueryData<AppNotification[]>(
        notificationsKey(user?.id ?? ''),
        (old = []) => old.map((n) => ({ ...n, read: true })),
      );
      queryClient.setQueryData<number>(unreadNotifCountKey(user?.id ?? ''), 0);
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete a single notification
// ─────────────────────────────────────────────────────────────────────────────

export function useDeleteNotif() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
      return id;
    },
    onMutate: async (id) => {
      queryClient.setQueryData<AppNotification[]>(
        notificationsKey(user?.id ?? ''),
        (old = []) => old.filter((n) => n.id !== id),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: unreadNotifCountKey(user?.id ?? '') });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete ALL notifications
// ─────────────────────────────────────────────────────────────────────────────

export function useClearAllNotifs() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.setQueryData<AppNotification[]>(notificationsKey(user?.id ?? ''), []);
      queryClient.setQueryData<number>(unreadNotifCountKey(user?.id ?? ''), 0);
    },
  });
}
