import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store/useAuthStore';

// ─── Constants ───────────────────────────────────────────────────────────────
/** Heartbeat write interval while the tab is active */
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 s

// ─── Module-level Supabase Presence channel ──────────────────────────────────
let presenceChannel: ReturnType<typeof supabase.channel> | null = null;
const liveOnlineState: Record<string, boolean> = {};
const liveOnlineListeners = new Set<() => void>();

function notifyListeners() {
  liveOnlineListeners.forEach((fn) => fn());
}

function openPresenceChannel(userId: string) {
  // Close any existing channel first (handles hot-reload / StrictMode double-mount)
  if (presenceChannel) {
    supabase.removeChannel(presenceChannel);
    presenceChannel = null;
  }

  presenceChannel = supabase.channel('presence:global', {
    config: { presence: { key: userId } },
  });

  presenceChannel
    .on('presence', { event: 'sync' }, () => {
      if (!presenceChannel) return;
      const state = presenceChannel.presenceState<{ user_id: string }>();
      Object.keys(liveOnlineState).forEach((k) => delete liveOnlineState[k]);
      Object.values(state).forEach((presences) => {
        presences.forEach((p) => {
          if (p.user_id) liveOnlineState[p.user_id] = true;
        });
      });
      notifyListeners();
    })
    .on('presence', { event: 'join' }, ({ newPresences }) => {
      newPresences.forEach((p) => {
        const uid = (p as { user_id?: string }).user_id;
        if (uid) liveOnlineState[uid] = true;
      });
      notifyListeners();
    })
    .on('presence', { event: 'leave' }, ({ leftPresences }) => {
      leftPresences.forEach((p) => {
        const uid = (p as { user_id?: string }).user_id;
        if (uid) delete liveOnlineState[uid];
      });
      notifyListeners();
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && presenceChannel) {
        await presenceChannel.track({
          user_id: userId,
          online_at: new Date().toISOString(),
        });
      }
    });
}

async function closePresenceChannel() {
  if (presenceChannel) {
    try { await presenceChannel.untrack(); } catch { /* best-effort */ }
    await supabase.removeChannel(presenceChannel);
    presenceChannel = null;
  }
  Object.keys(liveOnlineState).forEach((k) => delete liveOnlineState[k]);
  notifyListeners();
}

// ─── usePresenceTracker ───────────────────────────────────────────────────────
/**
 * Mount once inside AuthProvider. Manages:
 * - Supabase Presence channel (live "online now")
 * - DB heartbeat every 30 s (persists "last seen X ago" after disconnect)
 * - Clears last_seen_at on deliberate sign-out (via useAuthStore.signOut)
 * - Does NOT clear last_seen_at on React cleanup / StrictMode remount
 */
export function usePresenceTracker() {
  const { user } = useAuthStore();
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track whether this is the very first mount for this user, not a StrictMode
  // double-invoke. We use a ref that survives the cleanup/re-run cycle.
  const mountedRef = useRef(false);

  const writeHeartbeat = useCallback(async (userId: string) => {
    const now = new Date().toISOString();
    await supabase
      .from('profiles')
      .update({ last_seen_at: now })
      .eq('id', userId);
  }, []);

  useEffect(() => {
    if (!user) return;

    // Prevent StrictMode double-mount from re-opening on the cleanup call
    mountedRef.current = true;
    const userId = user.id;

    openPresenceChannel(userId);
    writeHeartbeat(userId);

    heartbeatRef.current = setInterval(() => {
      // Only heartbeat when tab is visible
      if (document.visibilityState === 'visible') {
        writeHeartbeat(userId);
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Resume heartbeat when user brings the tab back into focus
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        writeHeartbeat(userId);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mountedRef.current = false;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      closePresenceChannel();
      // NOTE: We intentionally do NOT null out last_seen_at here.
      // That is only done by useAuthStore.signOut() so "last seen" persists
      // for offline users. React StrictMode calls cleanup+remount immediately
      // so clearing here would erase the timestamp on every dev refresh.
    };
  }, [user, writeHeartbeat]);
}

// ─── useIsOnline ──────────────────────────────────────────────────────────────
/**
 * Returns `{ isOnline, lastSeen, label }` for a given userId.
 * - isOnline  : live Presence channel only (no stale-timestamp fallback)
 * - lastSeen  : ISO string from DB
 * - label     : "Online" | "Just now" | "3m ago" | "2h ago" | "Yesterday" | "Offline"
 */
export function useIsOnline(userId: string | null | undefined) {
  const queryClient = useQueryClient();

  // ── Live presence snapshot ────────────────────────────────────────────────
  const { data: liveSnapshot } = useQuery<Record<string, boolean>>({
    queryKey: ['presence-live-snapshot'],
    queryFn: () => ({ ...liveOnlineState }),
    staleTime: 0,
    gcTime: 0,
  });

  useEffect(() => {
    const refresh = () =>
      queryClient.invalidateQueries({ queryKey: ['presence-live-snapshot'] });
    liveOnlineListeners.add(refresh);
    return () => { liveOnlineListeners.delete(refresh); };
  }, [queryClient]);

  // ── DB last_seen_at ───────────────────────────────────────────────────────
  const { data: presenceRow } = useQuery({
    queryKey: ['presence-profile', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from('profiles')
        .select('last_seen_at')
        .eq('id', userId)
        .single();
      return data as { last_seen_at: string | null } | null;
    },
    enabled: !!userId,
    // Keep reasonably fresh — realtime feed will push instant updates anyway
    staleTime: 10_000,
    refetchInterval: 60_000, // background poll as safety net
  });

  if (!userId) return { isOnline: false, lastSeen: null, label: '' };

  const isOnline = !!(liveSnapshot?.[userId]);
  const lastSeenAt = presenceRow?.last_seen_at ?? null;
  const label = formatPresenceLabel(isOnline, lastSeenAt);

  return { isOnline, lastSeen: lastSeenAt, label };
}

// ─── usePresenceFeed ──────────────────────────────────────────────────────────
/**
 * Subscribes to postgres_changes on profiles for a stable list of user IDs.
 * Pushes updates directly into the React Query cache so useIsOnline reflects
 * changes instantly without a re-fetch.
 *
 * Uses a module-level registry so the same channel is never subscribed twice —
 * multiple components watching the same set of users safely share one channel.
 */

const feedRegistry = new Map<string, { channel: ReturnType<typeof supabase.channel>; refs: number }>();

export function usePresenceFeed(userIds: string[]) {
  const queryClient = useQueryClient();
  const idsKey = [...userIds].sort().join(',');

  useEffect(() => {
    if (!idsKey) return;

    const existing = feedRegistry.get(idsKey);
    if (existing) {
      existing.refs += 1;
      return () => {
        existing.refs -= 1;
        if (existing.refs <= 0) {
          supabase.removeChannel(existing.channel);
          feedRegistry.delete(idsKey);
        }
      };
    }

    const channel = supabase
      .channel(`presence-feed:${idsKey}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const row = payload.new as { id: string; last_seen_at: string | null };
          const ids = idsKey.split(',');
          if (ids.includes(row.id)) {
            queryClient.setQueryData(
              ['presence-profile', row.id],
              { last_seen_at: row.last_seen_at }
            );
          }
        }
      )
      .subscribe();

    feedRegistry.set(idsKey, { channel, refs: 1 });

    return () => {
      const entry = feedRegistry.get(idsKey);
      if (!entry) return;
      entry.refs -= 1;
      if (entry.refs <= 0) {
        supabase.removeChannel(entry.channel);
        feedRegistry.delete(idsKey);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, queryClient]);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatPresenceLabel(isOnline: boolean, lastSeenAt: string | null): string {
  if (isOnline) return 'Online';
  if (!lastSeenAt) return 'Offline';

  const diffMs = Date.now() - new Date(lastSeenAt).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays}d ago`;
}
