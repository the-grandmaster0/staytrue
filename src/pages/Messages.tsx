import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare,
  ShieldAlert,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store/useAuthStore';
import { unreadCountKey } from '../hooks/useMessages';
import { usePresenceFeed } from '../hooks/usePresence';
import { AvatarWithPresence, OnlineBadge } from '../components/OnlineBadge';
import { SkeletonMessageRow } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import type { Goal } from '../types/goal';
import type { Message } from '../types/message';
import { REACTIONS } from '../types/message';
import type { Profile } from '../store/useAuthStore';

interface GoalWithMessages {
  goal: Goal;
  lastMessage: Message | null;
  unreadCount: number;
  buddyProfile: Profile | null;
}

export const Messages: React.FC = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  // Mark all messages as read when the user opens this page
  useEffect(() => {
    if (!user) return;
    const markAllRead = async () => {
      const now = new Date().toISOString();
      await supabase
        .from('messages')
        .update({ read_at: now })
        .eq('receiver_id', user.id)
        .is('read_at', null);
      // Clear the nav badge immediately
      queryClient.setQueryData(unreadCountKey(), 0);
      queryClient.invalidateQueries({ queryKey: unreadCountKey() });
    };
    markAllRead();
  }, [user, queryClient]);

  // Fetch all goals the user has accepted buddies for (or owns with buddy)
  const { data: conversations = [], isLoading, error } = useQuery<GoalWithMessages[]>({
    queryKey: ['messages-overview', user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Step 1: find all users who are accepted buddies with the current user
      const { data: buddyRows, error: brErr } = await supabase
        .from('buddy_requests')
        .select('goal_id, sender_id, receiver_id')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

      if (brErr) throw brErr;
      if (!buddyRows || buddyRows.length === 0) return [];

      // Step 2: collect unique buddy user IDs
      const buddyIds = [...new Set(
        buddyRows.map((r: any) =>
          r.sender_id === user.id ? r.receiver_id : r.sender_id
        )
      )];

      // Step 3: fetch only the current user's OWN goals
      // (not the buddy's goal — the request may be stored on the buddy's goal_id)
      const { data: myGoals, error: gErr } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (gErr) throw gErr;
      if (!myGoals || myGoals.length === 0) return [];

      // Step 4: fetch buddy profiles for presence display
      const { data: buddyProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, last_seen_at')
        .in('id', buddyIds as string[]);
      const profileMap = new Map<string, Profile>(
        (buddyProfiles ?? []).map((p: Profile) => [p.id, p])
      );

      // Step 5: for each of my goals, fetch last message + unread count
      // Messages may be stored under any goal_id so query by participants
      const results: GoalWithMessages[] = await Promise.all(
        myGoals.map(async (goal: Goal) => {
          const [{ data: lastMsgs }, { count: unread }] = await Promise.all([
            supabase
              .from('messages')
              .select('*')
              .or(
                (buddyIds as string[]).map((bid: string) =>
                  `and(sender_id.eq.${user.id},receiver_id.eq.${bid}),and(sender_id.eq.${bid},receiver_id.eq.${user.id})`
                ).join(',')
              )
              .order('created_at', { ascending: false })
              .limit(1),
            supabase
              .from('messages')
              .select('id', { count: 'exact', head: true })
              .eq('receiver_id', user.id)
              .is('read_at', null),
          ]);

          // Find the buddy for this conversation (first match)
          const buddyRow = buddyRows.find((r: any) =>
            r.sender_id === user.id || r.receiver_id === user.id
          );
          const buddyId = buddyRow
            ? (buddyRow.sender_id === user.id ? buddyRow.receiver_id : buddyRow.sender_id)
            : null;

          return {
            goal,
            lastMessage: (lastMsgs?.[0] as Message) ?? null,
            unreadCount: unread ?? 0,
            buddyProfile: buddyId ? (profileMap.get(buddyId) ?? null) : null,
          };
        })
      );

      // Only show goals that have messages or buddies
      const withActivity = results.filter(r => r.lastMessage !== null);

      // If no messages yet, show all goals with buddies so user can start chatting
      if (withActivity.length === 0) return results;

      // Sort by most recent message first
      return withActivity.sort((a, b) => {
        const aTime = a.lastMessage?.created_at ?? a.goal.created_at;
        const bTime = b.lastMessage?.created_at ?? b.goal.created_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });
    },
    enabled: !!user,
    staleTime: 15_000,
  });

  const formatPreview = (msg: Message | null): string => {
    if (!msg) return 'No messages yet';
    if (msg.message_type === 'reaction') {
      const r = REACTIONS.find((x) => x.key === msg.reaction_key);
      return r ? `${r.emoji} ${r.label}` : msg.content;
    }
    return msg.content.length > 60 ? msg.content.slice(0, 60) + '…' : msg.content;
  };

  const formatTime = (iso: string): string => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays === 1) return 'yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Subscribe to realtime presence updates for all buddy profiles in conversations
  const buddyProfileIds = conversations.map((c) => c.buddyProfile?.id).filter(Boolean) as string[];
  usePresenceFeed(buddyProfileIds);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-app-text-body" style={{ fontFamily: 'var(--font-display)' }}>
          Messages
        </h1>
        <p className="text-sm text-app-text-secondary mt-0.5">
          Conversations with your accountability buddies
        </p>
      </div>

      {isLoading ? (
        <div className="bg-app-panel border border-app-border rounded-xl divide-y divide-app-border overflow-hidden">
          {[1, 2, 3, 4].map((i) => <SkeletonMessageRow key={i} />)}
        </div>
      ) : error ? (
        <div className="bg-app-panel border border-red-500/30 rounded-xl p-6 text-center max-w-lg mx-auto">
          <ShieldAlert className="h-8 w-8 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-red-400">{(error as Error).message}</p>
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState variant="no-messages" />
      ) : (
        <div className="bg-app-panel border border-app-border rounded-xl divide-y divide-app-border overflow-hidden">
          {conversations.map(({ goal, lastMessage, unreadCount, buddyProfile }) => (
            <Link
              key={goal.id}
              to={`/dashboard/goals/${goal.id}`}
              state={{ tab: 'messages' }}
              className="flex items-center gap-4 px-5 py-4 hover:bg-app-bg transition-colors group"
            >
              {/* Unread indicator */}
              <div className="shrink-0 w-2.5 flex justify-center">
                {unreadCount > 0 && (
                  <span className="h-2.5 w-2.5 rounded-full bg-app-accent block" />
                )}
              </div>

              {/* Avatar with presence dot */}
              <AvatarWithPresence
                userId={buddyProfile?.id}
                size="sm"
                className="h-10 w-10 rounded-full bg-app-accent-bg border border-app-border overflow-hidden flex items-center justify-center"
              >
                {buddyProfile?.avatar_url ? (
                  <img
                    src={buddyProfile.avatar_url}
                    alt={buddyProfile.full_name || buddyProfile.email || ''}
                    className="h-10 w-10 object-cover rounded-full"
                  />
                ) : (
                  <MessageSquare className="h-4 w-4 text-app-text-primary" />
                )}
              </AvatarWithPresence>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-semibold truncate ${unreadCount > 0 ? 'text-app-text-body' : 'text-app-text-secondary'}`}>
                    {goal.title}
                  </p>
                  <span className="chip shrink-0">{goal.category}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className={`text-xs truncate ${unreadCount > 0 ? 'text-app-text-secondary font-medium' : 'text-app-text-dim'}`}>
                    {formatPreview(lastMessage)}
                  </p>
                  {buddyProfile?.id && (
                    <OnlineBadge userId={buddyProfile.id} variant="icon" size="xs" className="shrink-0" />
                  )}
                </div>
              </div>

              {/* Meta */}
              <div className="shrink-0 flex flex-col items-end gap-1.5">
                {lastMessage && (
                  <span className="text-xs text-app-text-dim">{formatTime(lastMessage.created_at)}</span>
                )}
                {unreadCount > 0 && (
                  <span className="badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </div>

              <ChevronRight className="h-4 w-4 text-app-text-dim group-hover:text-app-text-secondary transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
