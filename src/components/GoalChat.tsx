import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  Loader2,
  Users,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';
import { sanitize } from '../lib/sanitize';
import { useMessages, useSendMessage, useMarkMessagesRead } from '../hooks/useMessages';
import { useGoalBuddies } from '../hooks/useBuddies';
import { useAuthStore } from '../store/useAuthStore';
import { REACTIONS } from '../types/message';
import type { Message } from '../types/message';
import type { Profile } from '../store/useAuthStore';

const MAX_CHARS = 150;

// ─── Timestamp helper ─────────────────────────────────────────────────────────
function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Single message bubble ────────────────────────────────────────────────────
interface BubbleProps {
  message: Message;
  isMine: boolean;
  senderProfile: Profile | null;
}

const MessageBubble: React.FC<BubbleProps> = ({ message, isMine, senderProfile }) => {
  const name = senderProfile?.full_name || senderProfile?.email || 'USER';
  const isReaction = message.message_type === 'reaction';

  return (
    <div
      className={`flex items-end gap-2 animate-fade-in ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      {!isMine && (
        <div className="h-7 w-7 shrink-0 rounded-none bg-app-accent-bg border border-app-border-active/30 flex items-center justify-center overflow-hidden mb-0.5">
          {senderProfile?.avatar_url ? (
            <img src={senderProfile.avatar_url} alt={name} className="h-full w-full object-cover" />
          ) : (
            <Users className="h-3.5 w-3.5 text-app-text-primary" />
          )}
        </div>
      )}

      <div className={`flex flex-col gap-0.5 max-w-[72%] ${isMine ? 'items-end' : 'items-start'}`}>
        {/* Sender name (only for buddy messages) */}
        {!isMine && (
          <span className="text-[9px] font-bold uppercase tracking-widest text-app-text-secondary px-1">
            {name}
          </span>
        )}

        {/* Bubble */}
        {isReaction ? (
          <div
            className={`px-3 py-2 border rounded-none text-xl leading-none ${
              isMine
                ? 'bg-app-accent-bg border-app-border-active/40'
                : 'bg-app-panel border-app-border'
            }`}
            title={message.content}
            aria-label={message.content}
          >
            {REACTIONS.find((r) => r.key === message.reaction_key)?.emoji ?? message.content}
          </div>
        ) : (
          <div
            className={`px-3 py-2 border rounded-none text-[11px] leading-relaxed break-words ${
              isMine
                ? 'bg-app-accent-bg border-app-border-active/40 text-app-text-body'
                : 'bg-app-panel border-app-border text-app-text-body'
            }`}
          >
            {message.content}
          </div>
        )}

        {/* Timestamp + read indicator */}
        <div className={`flex items-center gap-1.5 px-1 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-[8px] text-app-text-dim uppercase tracking-wider">
            {formatTime(message.created_at)}
          </span>
          {isMine && (
            <span className={`text-[8px] uppercase tracking-wider ${message.read_at ? 'text-app-text-primary' : 'text-app-text-dim'}`}>
              {message.read_at ? '✓✓' : '✓'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Reaction bar ─────────────────────────────────────────────────────────────
interface ReactionBarProps {
  onReact: (key: string, label: string) => void;
  disabled: boolean;
}

const ReactionBar: React.FC<ReactionBarProps> = ({ onReact, disabled }) => (
  <div
    className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin"
    role="toolbar"
    aria-label="Quick reactions"
  >
    {REACTIONS.map((r) => (
      <button
        key={r.key}
        onClick={() => onReact(r.key, `${r.emoji} ${r.label}`)}
        disabled={disabled}
        title={r.label}
        aria-label={`Send reaction: ${r.label}`}
        className="flex items-center gap-1.5 px-3 py-1.5 shrink-0 border border-app-border bg-app-panel hover:border-app-border-active/50 hover:bg-app-accent-bg rounded-none text-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className="text-base leading-none" aria-hidden="true">{r.emoji}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-app-text-secondary whitespace-nowrap">
          {r.label}
        </span>
      </button>
    ))}
  </div>
);

// ─── Main GoalChat component ──────────────────────────────────────────────────
interface GoalChatProps {
  goalId: string;
}

export const GoalChat: React.FC<GoalChatProps> = ({ goalId }) => {
  const { user } = useAuthStore();
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: messages = [], isLoading, error } = useMessages(goalId);
  const { data: buddies = [], isLoading: buddiesLoading } = useGoalBuddies(goalId);
  const sendMessage = useSendMessage(goalId);
  const markRead = useMarkMessagesRead(goalId);

  // Mark messages read when component mounts / messages load
  useEffect(() => {
    if (messages.length > 0) {
      markRead();
    }
  }, [goalId, markRead]); // intentionally not on `messages` to avoid loop

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Determine the buddy (first accepted buddy for this goal)
  const buddy = buddies[0] ?? null;
  const buddyProfile = buddy?.profile ?? null;

  // Build a profile map for rendering
  const profileMap = new Map<string, Profile | null>();
  if (user) profileMap.set(user.id, null); // we don't need our own profile for display
  if (buddyProfile) profileMap.set(buddyProfile.id, buddyProfile);

  const charsLeft = MAX_CHARS - text.length;
  const canSend = text.trim().length > 0 && text.length <= MAX_CHARS && !!buddy && !sendMessage.isPending;

  const handleSend = () => {
    if (!canSend || !buddy) return;
    sendMessage.mutate(
      { receiverId: buddy.buddy_id, content: sanitize(text.trim()).slice(0, 150), messageType: 'text' },
      { onSuccess: () => setText('') }
    );
  };

  const handleReact = (key: string, label: string) => {
    if (!buddy) return;
    sendMessage.mutate({
      receiverId: buddy.buddy_id,
      content: sanitize(label).slice(0, 150),
      messageType: 'reaction',
      reactionKey: sanitize(key),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Loading buddies ─────────────────────────────────────────────────────────
  if (buddiesLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center border border-app-border rounded-xl bg-app-panel">
        <Loader2 className="h-5 w-5 animate-spin text-app-text-primary" />
      </div>
    );
  }

  // ── Error loading messages ───────────────────────────────────────────────────
  if (error) {
    return (
      <div className="border border-red-500/30 bg-app-panel rounded-xl p-5 flex items-center gap-3">
        <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-400">Failed to load messages</p>
          <p className="text-xs text-app-text-secondary mt-0.5">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  // ── No buddy state (only show after data has loaded) ───────────────────────
  if (!isLoading && !buddiesLoading && buddies.length === 0) {
    return (
      <div className="border border-app-border border-dashed bg-app-panel rounded-xl p-10 text-center">
        <MessageSquare className="h-8 w-8 text-app-text-dim mx-auto mb-3" />
        <p className="text-sm font-semibold text-app-text-secondary mb-1">No buddy linked yet</p>
        <p className="text-xs text-app-text-dim">
          Add an accountability buddy from the Buddies tab to unlock messaging
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[520px] border border-app-border bg-app-panel rounded-xl overflow-hidden">

      {/* ── Chat header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-app-border bg-app-bg shrink-0">
        <div className="h-8 w-8 rounded-full bg-app-accent-bg border border-app-border flex items-center justify-center overflow-hidden shrink-0">
          {buddyProfile?.avatar_url ? (
            <img src={buddyProfile.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Users className="h-4 w-4 text-app-text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-app-text-body truncate">
            {buddyProfile?.full_name || buddyProfile?.email || 'Your buddy'}
          </p>
          <p className="text-xs text-app-text-secondary">{messages.length} message{messages.length !== 1 ? 's' : ''}</p>
        </div>
        <MessageSquare className="h-4 w-4 text-app-text-dim shrink-0" />
      </div>

      {/* ── Message feed ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-app-text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <MessageSquare className="h-8 w-8 text-app-text-dim" />
            <p className="text-sm text-app-text-secondary">No messages yet — say hi!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isMine={msg.sender_id === user?.id}
              senderProfile={msg.sender_id === user?.id ? null : buddyProfile}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Reaction bar ─────────────────────────────────────────────────────── */}
      <div className="px-4 pt-2 pb-2 border-t border-app-border shrink-0 bg-app-bg">
        <p className="text-xs text-app-text-dim mb-2 font-medium">Quick reactions</p>
        <ReactionBar onReact={handleReact} disabled={!buddy || sendMessage.isPending} />
      </div>

      {/* ── Text input ───────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-app-border shrink-0 bg-app-bg">
        {sendMessage.isError && (
          <div className="mb-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            Failed to send: {sendMessage.error?.message}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
              onKeyDown={handleKeyDown}
              placeholder={buddy ? 'Write a message… (Enter to send)' : 'No buddy linked'}
              disabled={!buddy || sendMessage.isPending}
              rows={2}
              aria-label="Message input"
              className="input-field w-full px-3 py-2 text-sm resize-none disabled:opacity-50"
            />
            <span
              className={`absolute bottom-2 right-2 text-[10px] tabular-nums pointer-events-none ${
                charsLeft <= 20 ? (charsLeft <= 0 ? 'text-red-400 font-bold' : 'text-amber-400') : 'text-app-text-dim'
              }`}
            >
              {charsLeft}
            </span>
          </div>

          <button
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send message"
            className="btn-primary flex items-center justify-center h-[62px] w-11 shrink-0 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {sendMessage.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
