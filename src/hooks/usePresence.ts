import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store/useAuthStore';

// ─── Constants ───────────────────────────────────────────────────────────────
/** How often (ms) we write last_seen_at to the DB while the tab is active */
const HEARTBEAT_INTERVAL_MS = 45_000; // 45 seconds
/** Users seen within this window (ms) are considered "online" */
const ONLINE_THRESHOLD_MS = 3 * 60_000; // 3 minutes

// ─── Query key ───────────────────────────────────────────────────────────────
export const presenceKey = (userIds: string[]) =>
  ['presence', ...userIds.sort()] as const;

// ─── Types ───────────────────────────────────────────────────────────────────
export interface PresenceState {
  /** user_id → last_seen_at ISO string (from DB heartbeat) */
  lastSeen: Record<string, string>;
  /** user_id → true if currently online via Supabase Presence channel */
  liveOnline: Record<string, boolean>;
}

// ─── Module-level Supabase Presence channel ──────────────────────────────────
// One shared channel across the whole app lifetime.
let presenceChannel: ReturnType<typeof supabase.channel> | null = null;
let presenceChannelRefs = 0;
const liveOnlineState: Record<string, boolean> = {};
const liveOnlineListeners = new Set<() => void>();

function notifyListeners() {
  liveOnlineListeners.forEach((fn) => fn());
}

function acquirePresenceChannel(userId: string) {
  presenceChannelRefs += 1;
  if (presenceChannel) return; // already open

  presenceChannel = supabase.channel('presence:global', {
    config: { presence: { key: userId } },
  });

  presenceChannel
    .on('presence', { event: 'sync' }, () => {
      if (!presenceChannel) return;
      const state = presenceChannel.presenceState<{ user_id: string }>();
      // Reset and rebuild from full sync
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
        const userId = (p as { user_id?: string }).user_id;
        if (userId) liveOnlineState[userId] = true;
      });
      notifyListeners();
    })
    .on('presence', { event: 'leave' }, ({ leftPresences }) => {
      leftPresences.forEach((p) => {
        const userId = (p as { user_id?: string }).user_id;
        if (userId) delete liveOnlineState[userId];
      });
      notifyListeners();
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && presenceChannel) {
        await presenceChannel.track({ user_id: userId, online_at: new Date().toISOString() });
      }
    });
}

async function releasePresenceChannel() {
  presenceChannelRefs -= 1;
  if (presenceChannelRefs > 0) return;
  if (presenceChannel) {
    await presenceChannel.untrack();
    await supabase.removeChannel(presenceChannel);
    presenceChannel = null;
  }
  Object.keys(liveOnlineState).forEach((k) => delete liveOnlineState[k]);
}

// ─── usePresenceTracker — mount once in AuthProvider ─────────────────────────
/**
 * Tracks the current user's presence (both Supabase Presence channel and
 * DB heartbeat). Mount this once at the app level when the user is logged in.
 */
export function usePresenceTracker() {
  const { user } = useAuthStore();
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const writeHeartbeat = useCallback(async (userId: string) => {
    const now = new Date().toISOString();
    await supabase
      .from('profiles')
      .update({ last_seen_at: now })
      .eq('id', userId);
  }, []);

  useEffect(() => {
    if (!user) return;

    acquirePresenceChannel(user.id);

    // Write immediately on mount
    writeHeartbeat(user.id);

    // Repeat every 45 seconds
    heartbeatRef.current = setInterval(() => {
      writeHeartbeat(user.id);
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      releasePresenceChannel();
    };
  }, [user, writeHeartbeat]);
}

// ─── useIsOnline — check a single user's online status ───────────────────────
/**
 * Returns `{ isOnline, lastSeen, label }` for a given userId.
 *  - isOnline: true if the user is currently in the Presence channel
 *              OR their last_seen_at is within ONLINE_THRESHOLD_MS
 *  - lastSeen: ISO string from DB, or null
 *  - label:    human-readable status string e.g. "Online" / "3m ago"
 */
export function useIsOnline(userId: string | null | undefined) {
  const queryClient = useQueryClient();

  // Subscribe to live online state changes
  const liveOnlineSnapshot = useQuery<Record<string, boolean>>({
    queryKey: ['presence-live-snapshot'],
    queryFn: () => ({ ...liveOnlineState }),
    staleTime: 0,
    gcTime: 0,
  });

  // Re-fetch the snapshot whenever live state changes
  useEffect(() => {
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['presence-live-snapshot'] });
    };
    liveOnlineListeners.add(refresh);
    return () => { liveOnlineListeners.delete(refresh); };
  }, [queryClient]);

  // Fetch last_seen_at from DB (keep fresh via realtime subscription in usePresenceFeed)
  const { data: profile } = useQuery({
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
    staleTime: 30_000,
  });

  if (!userId) return { isOnline: false, lastSeen: null, label: '' };

  const lastSeenAt = profile?.last_seen_at ?? null;
  const liveOnline = !!(liveOnlineSnapshot.data?.[userId]);
  const recentlyActive = lastSeenAt
    ? Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS
    : false;

  const isOnline = liveOnline || recentlyActive;
  const label = formatPresenceLabel(isOnline, lastSeenAt);

  return { isOnline, lastSeen: lastSeenAt, label };
}

// ─── usePresenceFeed — subscribe to real-time last_seen_at updates ────────────
/**
 * Opens a postgres_changes subscription on the profiles table to keep
 * last_seen_at values fresh for a list of user IDs. Mount once per page
 * that shows multiple online indicators.
 */
export function usePresenceFeed(userIds: string[]) {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const idsKey = userIds.slice().sort().join(',');

  useEffect(() => {
    if (!userIds.length) return;

    const channelName = `presence-feed:${idsKey}:${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          const updated = payload.new as { id: string; last_seen_at: string | null };
          if (userIds.includes(updated.id)) {
            // Update the cached presence-profile query for this user
            queryClient.setQueryData(
              ['presence-profile', updated.id],
              { last_seen_at: updated.last_seen_at }
            );
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
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

export { ONLINE_THRESHOLD_MS };
