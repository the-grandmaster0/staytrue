import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Flame, Calendar, MessageSquare, Swords, Loader2, Trash2 } from 'lucide-react';
import { useBuddies, useRemoveBuddy, useBuddyStreak } from '../hooks/useBuddies';
import { usePresenceFeed } from '../hooks/usePresence';
import { AvatarWithPresence, OnlineBadge } from './OnlineBadge';
import { ChallengeModal } from './ChallengeModal';
import { SkeletonBuddyCard } from './Skeleton';
import { EmptyState } from './EmptyState';
import type { Buddy } from '../types/buddy';
import type { Profile } from '../store/useAuthStore';

// ─── Single buddy row ─────────────────────────────────────────────────────────
interface BuddyRowProps {
  buddy: Buddy;
  goalId: string;
  onRemove: (buddyId: string) => void;
  isRemoving: boolean;
}

const BuddyRow: React.FC<BuddyRowProps> = ({ buddy, goalId, onRemove, isRemoving }) => {
  const navigate = useNavigate();
  const { data: streakData } = useBuddyStreak(goalId, buddy.buddy_id);
  const [showChallenge, setShowChallenge] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const name = buddy.profile?.full_name || buddy.profile?.username || buddy.profile?.email || 'Unknown';

  const handleRemove = () => {
    if (!confirming) { setConfirming(true); return; }
    onRemove(buddy.buddy_id);
    setConfirming(false);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-app-panel border border-app-border-active/20 p-4 animate-fade-in">
      {showChallenge && buddy.profile && (
        <ChallengeModal
          opponent={buddy.profile as Profile}
          onClose={() => setShowChallenge(false)}
          onSent={() => setShowChallenge(false)}
        />
      )}

      {/* Avatar + info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <AvatarWithPresence
          userId={buddy.buddy_id}
          size="sm"
          className="h-10 w-10 rounded-none bg-app-accent-bg border border-app-border-active/40 overflow-hidden"
        >
          {buddy.profile?.avatar_url ? (
            <img src={buddy.profile.avatar_url} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-10 w-10 flex items-center justify-center">
              <Users className="h-4 w-4 text-app-text-primary" />
            </div>
          )}
        </AvatarWithPresence>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-app-text-body uppercase truncate">{name}</p>
          {buddy.profile?.username && (
            <p className="text-[10px] text-app-text-dim lowercase truncate">@{buddy.profile.username}</p>
          )}
          <OnlineBadge userId={buddy.buddy_id} variant="icon" className="mt-0.5" />
        </div>
      </div>

      {/* Streak stats */}
      <div className="flex items-center gap-4 text-[10px] uppercase tracking-wider shrink-0">
        <div className="flex items-center gap-1 text-app-text-primary font-bold">
          <Flame className="h-3.5 w-3.5" />
          <span>{String(streakData?.current_streak ?? 0).padStart(2, '0')}_STK</span>
        </div>
        <div className="flex items-center gap-1 text-app-text-secondary">
          <Calendar className="h-3.5 w-3.5" />
          <span>
            {streakData?.last_checkin_date
              ? new Date(streakData.last_checkin_date).toLocaleDateString()
              : 'N/A'}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Chat */}
        <button
          onClick={() => navigate('/dashboard/messages', { state: { openBuddyId: buddy.buddy_id } })}
          title={`Message ${name}`}
          aria-label={`Message ${name}`}
          style={{ minHeight: '44px' }}
          className="flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider border border-app-border-active/30 text-app-text-primary hover:border-app-border-active/60 hover:bg-app-accent-bg transition-all cursor-pointer shrink-0"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Chat</span>
        </button>

        {/* Challenge */}
        <button
          onClick={() => setShowChallenge(true)}
          title={`Challenge ${name}`}
          aria-label={`Challenge ${name}`}
          style={{ minHeight: '44px' }}
          className="flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider border border-amber-500/30 text-amber-400 hover:border-amber-500/60 hover:bg-amber-500/10 transition-all cursor-pointer shrink-0"
        >
          <Swords className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Challenge</span>
        </button>

        {/* Remove (two-step) */}
        {confirming && (
          <button
            onClick={() => setConfirming(false)}
            className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider border border-app-border text-app-text-secondary hover:text-app-text-primary transition-all cursor-pointer"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleRemove}
          disabled={isRemoving}
          title={confirming ? 'Confirm remove' : `Remove ${name}`}
          style={{ minHeight: '44px' }}
          className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider border transition-all cursor-pointer disabled:opacity-40 ${
            confirming
              ? 'border-red-500/60 text-red-400 bg-red-500/15 hover:bg-red-500/25'
              : 'border-red-500/30 text-red-400 hover:border-red-500/60 hover:bg-red-500/10'
          }`}
        >
          {isRemoving
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Trash2 className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{confirming ? 'Confirm?' : 'Remove'}</span>
        </button>
      </div>
    </div>
  );
};

// ─── Panel ────────────────────────────────────────────────────────────────────
interface GoalBuddyPanelProps {
  goalId: string;
}

export const GoalBuddyPanel: React.FC<GoalBuddyPanelProps> = ({ goalId }) => {
  const { data: buddies = [], isLoading } = useBuddies();
  const removeBuddy = useRemoveBuddy();

  usePresenceFeed(buddies.map((b) => b.buddy_id));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-app-text-primary" />
        <h3 className="text-xs font-bold uppercase tracking-widest text-app-text-primary">
          Accountability Buddies
        </h3>
        {buddies.length > 0 && (
          <span className="ml-auto px-2 py-0.5 bg-app-accent-bg border border-app-border-active/40 text-app-text-primary text-[9px] font-bold uppercase tracking-widest">
            {buddies.length} linked
          </span>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <SkeletonBuddyCard key={i} />)}
        </div>
      ) : buddies.length === 0 ? (
        <EmptyState variant="no-buddies" compact />
      ) : (
        <div className="space-y-2">
          {buddies.map((buddy) => (
            <BuddyRow
              key={buddy.buddy_id}
              buddy={buddy}
              goalId={goalId}
              onRemove={(buddyId) => removeBuddy.mutate({ buddyId })}
              isRemoving={removeBuddy.isPending && removeBuddy.variables?.buddyId === buddy.buddy_id}
            />
          ))}
        </div>
      )}

      {/* Hint to find buddies */}
      {!isLoading && buddies.length === 0 && (
        <p className="text-xs text-app-text-dim text-center pt-1">
          Add buddies from the{' '}
          <a href="/dashboard/find-buddy" className="text-app-text-primary underline underline-offset-2">
            Find Buddy
          </a>{' '}
          page.
        </p>
      )}
    </div>
  );
};
