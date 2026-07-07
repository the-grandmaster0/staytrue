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
import { AvatarWithPresence } from '../components/OnlineBadge';
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

  // Clear the nav badge when the messages page is first opened, but only if no
  // specific conversation is open yet (the per-conversation BuddyChat handles
  // marking individual threads read). This avoids bulk-clearing unread state
  // before the user has actually seen any messages.
  useEffect(() => {
    if (!user || selectedBuddyId) return;
    // Only zero out the badge display — don't write read_at to the DB here.
    // Individual conversations mark their own messages read via useMarkMessagesRead.
    queryClient.invalidateQueries({ queryKey: unreadCountKey() });
    queryClient.invalidateQueries({ queryKey: ['messages-overview', user.id] });
  }, [user, queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="flex flex-col h-full">
      {/* ── Desktop: two-panel layout; Mobile: single panel with back nav ── */}

      {/* Mobile header — only shown when chat is open */}
      {selectedBuddyId && (
        <div className="flex items-center gap-3 mb-4 md:hidden">
          <button
            onClick={deselectBuddy}
            className="flex items-center gap-1.5 text-sm text-app-text-secondary hover:text-app-text-body transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-xl font-bold text-app-text-body" style={{ fontFamily: 'var(--font-display)' }}>
            {displayName}
          </h1>
        </div>
      )}

      {/* Page title — hidden on mobile when chat is open */}
      {!selectedBuddyId && (
        <div className="mb-4 md:mb-6">
          <h1 className="text-2xl font-bold text-app-text-body" style={{ fontFamily: 'var(--font-display)' }}>
            Messages
          </h1>
          <p className="text-sm text-app-text-secondary mt-0.5">
            Conversations with your accountability buddies
          </p>
        </div>
      )}

      {/* Desktop two-panel / Mobile single panel */}
      <div className="flex gap-4 flex-1 min-h-0" style={{ height: 'calc(100vh - 180px)' }}>

        {/* ── Left panel: conversation list ── */}
        <div className={`
          flex-col bg-app-panel border border-app-border rounded-xl overflow-hidden
          ${selectedBuddyId ? 'hidden md:flex md:w-72 lg:w-80 shrink-0' : 'flex w-full md:w-72 lg:w-80 shrink-0'}
        `}>
          <div className="px-4 py-3 border-b border-app-border shrink-0">
            <p className="text-xs font-bold uppercase tracking-widest text-app-text-secondary">Conversations</p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-app-border">
            {isLoading ? (
              [1, 2, 3, 4].map((i) => <SkeletonMessageRow key={i} />)
            ) : error ? (
              <div className="p-4 text-center">
                <ShieldAlert className="h-6 w-6 text-red-400 mx-auto mb-2" />
                <p className="text-xs text-red-400">{(error as Error).message}</p>
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-6">
                <EmptyState variant="no-messages" />
              </div>
            ) : (
              conversations.map(({ buddy, lastMessage, unreadCount }) => {
                const name = buddy.full_name || buddy.username || buddy.email || 'Unknown';
                const isSelected = selectedBuddyId === buddy.id;
                return (
                  <button
                    key={buddy.id}
                    onClick={() => selectBuddy(buddy.id, buddy)}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-app-bg transition-colors text-left ${
                      isSelected ? 'bg-app-accent-bg border-l-2 border-l-app-accent' : ''
                    }`}
                  >
                    {/* Unread dot */}
                    <div className="shrink-0 w-2 flex justify-center">
                      {unreadCount > 0 && (
                        <span className="h-2 w-2 rounded-full bg-app-accent block" />
                      )}
                    </div>

                    <AvatarWithPresence
                      userId={buddy.id}
                      size="sm"
                      className="h-9 w-9 rounded-full bg-app-accent-bg border border-app-border overflow-hidden flex items-center justify-center shrink-0"
                    >
                      {buddy.avatar_url ? (
                        <img src={buddy.avatar_url} alt={name} className="h-9 w-9 object-cover rounded-full" />
                      ) : (
                        <MessageSquare className="h-4 w-4 text-app-text-primary" />
                      )}
                    </AvatarWithPresence>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className={`text-xs font-semibold truncate ${unreadCount > 0 ? 'text-app-text-body' : 'text-app-text-secondary'}`}>
                          {name}
                        </p>
                        {lastMessage && (
                          <span className="text-[10px] text-app-text-dim shrink-0">{formatTime(lastMessage.created_at)}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <p className={`text-[11px] truncate ${unreadCount > 0 ? 'text-app-text-secondary' : 'text-app-text-dim'}`}>
                          {formatPreview(lastMessage)}
                        </p>
                        {unreadCount > 0 && (
                          <span className="badge shrink-0" style={{ fontSize: '9px', padding: '1px 5px' }}>
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right panel: chat or empty state ── */}
        <div className={`
          flex-1 min-w-0
          ${selectedBuddyId ? 'flex' : 'hidden md:flex'}
          flex-col
        `}>
          {selectedBuddyId ? (
            <BuddyChat
              buddyId={selectedBuddyId}
              buddyProfile={selectedBuddyProfile}
              onBack={deselectBuddy}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-app-panel border border-app-border rounded-xl text-center p-8">
              <MessageSquare className="h-10 w-10 text-app-text-dim" />
              <p className="text-sm font-semibold text-app-text-secondary">Select a conversation</p>
              <p className="text-xs text-app-text-dim">Choose a buddy from the left to start chatting</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
