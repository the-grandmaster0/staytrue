import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import {
  MessageSquare,
  ShieldAlert,
  ArrowLeft,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store/useAuthStore';
import { unreadCountKey } from '../hooks/useMessages';
import { usePresenceFeed } from '../hooks/usePresence';
import { AvatarWithPresence, OnlineBadge } from '../components/OnlineBadge';
import { SkeletonMessageRow } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { BuddyChat } from '../components/BuddyChat';
import type { Message } from '../types/message';
import { REACTIONS } from '../types/message';
import type { Profile } from '../store/useAuthStore';

interface BuddyConversation {
  buddy: Profile;
  lastMessage: Message | null;
  unreadCount: number;
}

export const Messages: React.FC = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const location = useLocation();

  // Support deep-link from GoalBuddyPanel: navigate('/dashboard/messages', { state: { openBuddyId } })
  const [selectedBuddyId, setSelectedBuddyId] = useState<string | null>(
    (location.state as { openBuddyId?: string } | null)?.openBuddyId ?? null
  );
  // Store the profile alongside the ID so BuddyChat always has it, even before conversations load
  const [selectedBuddyProfile, setSelectedBuddyProfile] = useState<Profile | null>(null);

  const selectBuddy = (id: string, profile: Profile) => {
    setSelectedBuddyId(id);
    setSelectedBuddyProfile(profile);
  };

  const deselectBuddy = () => {
    setSelectedBuddyId(null);
    setSelectedBuddyProfile(null);
  };

  // Mark all messages as read when the user opens this page (clears nav badge)
  useEffect(() => {
    if (!user) return;
    const markAllRead = async () => {
      const now = new Date().toISOString();
      await supabase
        .from('messages')
        .update({ read_at: now })
        .eq('receiver_id', user.id)
        .is('read_at', null);
      queryClient.setQueryData(unreadCountKey(), 0);
      queryClient.invalidateQueries({ queryKey: unreadCountKey() });
    };
    markAllRead();
  }, [user, queryClient]);

  // Fetch all buddy conversations
  const { data: conversations = [], isLoading, error } = useQuery<BuddyConversation[]>({
    queryKey: ['messages-overview', user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Step 1: find all accepted buddies
      const { data: buddyRows, error: brErr } = await supabase
        .from('buddy_requests')
        .select('sender_id, receiver_id')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

      if (brErr) throw brErr;
      if (!buddyRows || buddyRows.length === 0) return [];

      // Step 2: collect unique buddy IDs
      const buddyIds = [...new Set(
        buddyRows.map((r: any) =>
          r.sender_id === user.id ? r.receiver_id : r.sender_id
        )
      )] as string[];

      // Step 3: fetch buddy profiles (select all columns to satisfy the Profile type)
      const { data: buddyProfiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', buddyIds);

      const profileMap = new Map<string, Profile>(
        (buddyProfiles ?? []).map((p: Profile) => [p.id, p])
      );

      // Step 4: for each buddy fetch their latest message and unread count
      const results = await Promise.all(
        buddyIds.map(async (buddyId) => {
          const [lastMsgRes, unreadRes] = await Promise.all([
            supabase
              .from('messages')
              .select('*')
              .or(
                `and(sender_id.eq.${user.id},receiver_id.eq.${buddyId}),` +
                `and(sender_id.eq.${buddyId},receiver_id.eq.${user.id})`
              )
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from('messages')
              .select('id', { count: 'exact', head: true })
              .eq('receiver_id', user.id)
              .eq('sender_id', buddyId)
              .is('read_at', null),
          ]);

          return {
            buddy: profileMap.get(buddyId) ?? ({ id: buddyId } as Profile),
            lastMessage: (lastMsgRes.data as Message) ?? null,
            unreadCount: unreadRes.count ?? 0,
          } satisfies BuddyConversation;
        })
      );

      // Sort by most recent message first
      return results.sort((a, b) => {
        const aTime = a.lastMessage?.created_at ?? '';
        const bTime = b.lastMessage?.created_at ?? '';
        return bTime.localeCompare(aTime);
      });
    },
    enabled: !!user,
    staleTime: 15_000,
  });

  const formatPreview = (msg: Message | null): string => {
    if (!msg) return 'No messages yet — say hi!';
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

  // Subscribe to realtime presence updates for all buddies
  const buddyIds = conversations.map((c) => c.buddy?.id).filter(Boolean) as string[];
  usePresenceFeed(buddyIds);

  // If we were deep-linked with an openBuddyId but have no profile yet, grab it from conversations once loaded
  useEffect(() => {
    if (selectedBuddyId && !selectedBuddyProfile && conversations.length > 0) {
      const found = conversations.find((c) => c.buddy?.id === selectedBuddyId);
      if (found?.buddy) setSelectedBuddyProfile(found.buddy);
    }
  }, [selectedBuddyId, selectedBuddyProfile, conversations]);

  const displayName = selectedBuddyProfile?.full_name || selectedBuddyProfile?.email || 'Chat';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        {selectedBuddyId && (
          <button
            onClick={deselectBuddy}
            className="flex items-center gap-1.5 text-sm text-app-text-secondary hover:text-app-text-body transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div>
          <h1 className="text-2xl font-bold text-app-text-body" style={{ fontFamily: 'var(--font-display)' }}>
            {selectedBuddyId ? displayName : 'Messages'}
          </h1>
          {!selectedBuddyId && (
            <p className="text-sm text-app-text-secondary mt-0.5">
              Conversations with your accountability buddies
            </p>
          )}
        </div>
      </div>

      {/* Chat view */}
      {selectedBuddyId ? (
        <BuddyChat buddyId={selectedBuddyId} buddyProfile={selectedBuddyProfile} />
      ) : isLoading ? (
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
          {conversations.map(({ buddy, lastMessage, unreadCount }) => {
            const displayName = buddy.full_name || buddy.username || buddy.email || 'Unknown';
            return (
              <button
                key={buddy.id}
                onClick={() => selectBuddy(buddy.id, buddy)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-app-bg transition-colors group text-left"
              >
                {/* Unread indicator */}
                <div className="shrink-0 w-2.5 flex justify-center">
                  {unreadCount > 0 && (
                    <span className="h-2.5 w-2.5 rounded-full bg-app-accent block" />
                  )}
                </div>

                {/* Avatar with presence dot */}
                <AvatarWithPresence
                  userId={buddy.id}
                  size="sm"
                  className="h-10 w-10 rounded-full bg-app-accent-bg border border-app-border overflow-hidden flex items-center justify-center"
                >
                  {buddy.avatar_url ? (
                    <img
                      src={buddy.avatar_url}
                      alt={displayName}
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
                      {displayName}
                    </p>
                    {buddy.username && (
                      <span className="chip shrink-0">@{buddy.username}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className={`text-xs truncate ${unreadCount > 0 ? 'text-app-text-secondary font-medium' : 'text-app-text-dim'}`}>
                      {formatPreview(lastMessage)}
                    </p>
                    <OnlineBadge userId={buddy.id} variant="icon" size="xs" className="shrink-0" />
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
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
