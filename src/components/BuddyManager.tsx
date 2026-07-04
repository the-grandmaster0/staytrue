import React, { useState } from 'react';
import {
  Users, Search, Loader2, UserPlus, Check, Clock, Trash2, Flame, Calendar, Swords,
} from 'lucide-react';
import {
  useSearchProfiles,
  useBuddyRequests,
  useBuddies,
  useSendBuddyRequest,
  useRemoveBuddy,
  useBuddyStreak,
} from '../hooks/useBuddies';
import { SkeletonBuddyCard } from './Skeleton';
import { EmptyState } from './EmptyState';
import { AvatarWithPresence, OnlineBadge } from './OnlineBadge';
import { usePresenceFeed } from '../hooks/usePresence';
import { ChallengeModal } from './ChallengeModal';
import type { Buddy } from '../types/buddy';
import type { Profile } from '../store/useAuthStore';
import { useAuthStore } from '../store/useAuthStore';

// ─── Individual Buddy Card ────────────────────────────────────────────────────
interface BuddyCardProps {
  buddy: Buddy;
  goalId?: string;
  onRemove: (buddyId: string) => void;
  isRemoving: boolean;
}

const BuddyCard: React.FC<BuddyCardProps> = ({ buddy, goalId, onRemove, isRemoving }) => {
  const { data: streakData } = useBuddyStreak(goalId ?? '', buddy.buddy_id);
  const [confirming, setConfirming] = useState(false);
  const [showChallenge, setShowChallenge] = useState(false);
  const name = buddy.profile?.full_name || buddy.profile?.username || buddy.profile?.email || 'Unknown';

  const handleRemoveClick = () => {
    if (!confirming) { setConfirming(true); return; }
    onRemove(buddy.buddy_id);
    setConfirming(false);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-app-panel border border-app-border-active/20 p-4 animate-fade-in glow-green">
      {/* Challenge modal */}
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

      {/* Streak stats — only shown when a goalId context is provided */}
      {goalId && (
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
      )}

      {/* Inline two-step remove */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Challenge button */}
        <button
          onClick={() => setShowChallenge(true)}
          style={{ minHeight: '44px' }}
          className="flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider rounded-none border border-amber-500/30 text-amber-400 hover:border-amber-500/60 hover:bg-amber-500/10 transition-all cursor-pointer shrink-0"
          aria-label={`Challenge ${name}`}
          title="Send a competition challenge"
        >
          <Swords className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Challenge</span>
        </button>

        {confirming && (
          <button
            onClick={() => setConfirming(false)}
            className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider border border-app-border text-app-text-secondary hover:text-app-text-primary rounded-none transition-all cursor-pointer"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleRemoveClick}
          disabled={isRemoving}
          style={{ minHeight: '44px' }}
          className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider rounded-none border transition-all cursor-pointer disabled:opacity-40 ${
            confirming
              ? 'border-red-500/60 text-red-400 bg-red-500/15 hover:bg-red-500/25'
              : 'border-red-500/30 text-red-400 hover:border-red-500/60 hover:bg-red-500/10'
          }`}
          aria-label={confirming ? `Confirm remove ${name}` : `Remove ${name} as buddy`}
        >
          {isRemoving
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Trash2 className="h-3.5 w-3.5" />}
          {confirming ? 'Confirm?' : 'Remove'}
        </button>
      </div>
    </div>
  );
};

// ─── Main BuddyManager ────────────────────────────────────────────────────────
interface BuddyManagerProps {
  /** When provided, shows streak stats for this goal's context */
  goalId?: string;
}

export const BuddyManager: React.FC<BuddyManagerProps> = ({ goalId }) => {
  const { user } = useAuthStore();
  const [query, setQuery] = useState('');

  const { data: searchResults = [], isFetching: isSearching } = useSearchProfiles(query);
  const { data: outgoing = [] } = useBuddyRequests('outgoing');
  const { data: buddies = [], isLoading: buddiesLoading } = useBuddies();
  const sendRequest = useSendBuddyRequest();
  const removeBuddy = useRemoveBuddy();

  // Subscribe to realtime presence updates for all buddies
  const buddyIds = buddies.map((b) => b.buddy_id);
  usePresenceFeed(buddyIds);

  const acceptedBuddyIds = new Set(buddyIds);
  const pendingReceiverIds = new Set(outgoing.map((r) => r.receiver_id));

  // Filter out self, existing buddies, and already-pending
  const filteredResults = searchResults.filter(
    (p) => p.id !== user?.id && !acceptedBuddyIds.has(p.id) && !pendingReceiverIds.has(p.id)
  );

  return (
    <div className="space-y-6">
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

      {/* Search */}
      <div className="space-y-2">
        <label htmlFor="buddy-search" className="block text-[10px] font-bold uppercase tracking-widest text-app-text-secondary">
          Search by username or email
        </label>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            {isSearching
              ? <Loader2 className="h-4 w-4 text-app-text-dim animate-spin" />
              : <Search className="h-4 w-4 text-app-text-dim" />}
          </span>
          <input
            id="buddy-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Min 3 characters..."
            className="block w-full pl-10 pr-4 py-2.5 bg-app-input border border-app-border focus:border-app-border-active text-xs rounded-none text-app-text-primary placeholder-app-text-dim focus:outline-none transition-all"
          />
        </div>

        {query.length >= 3 && (
          <div className="border border-app-border bg-app-panel overflow-hidden animate-fade-in">
            {filteredResults.length === 0 ? (
              <div className="p-4 text-center text-[10px] text-app-text-secondary uppercase tracking-wider">
                {isSearching ? 'Searching...' : 'No users found'}
              </div>
            ) : (
              <ul className="divide-y divide-app-border">
                {filteredResults.map((profile) => {
                  const isSending = sendRequest.isPending && sendRequest.variables?.receiverId === profile.id;
                  const displayName = profile.full_name || profile.username || profile.email;

                  return (
                    <li key={profile.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-app-bg transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-7 w-7 rounded-none bg-app-accent-bg border border-app-border-active/20 flex items-center justify-center shrink-0 overflow-hidden">
                          {profile.avatar_url
                            ? <img src={profile.avatar_url} alt={displayName || ''} className="h-full w-full object-cover" />
                            : <Users className="h-3 w-3 text-app-text-primary" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-app-text-body uppercase truncate">{displayName}</p>
                          {profile.username && (
                            <p className="text-[9px] text-app-text-dim truncate">@{profile.username}</p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => sendRequest.mutate({ receiverId: profile.id })}
                        disabled={isSending}
                        style={{ minHeight: '44px' }}
                        className="btn-primary flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-none cursor-pointer disabled:opacity-40 shrink-0"
                        aria-label={`Send buddy request to ${displayName}`}
                      >
                        {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                        Invite
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Pending sent requests */}
      {outgoing.length > 0 && (
        <div className="space-y-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-app-text-dim">Pending sent</p>
          {outgoing.map((req) => {
            const name = req.receiver?.full_name || req.receiver?.username || req.receiver?.email || 'Unknown';
            return (
              <div key={req.id} className="flex items-center gap-3 px-4 py-3 border border-app-border bg-app-panel animate-fade-in">
                <div className="h-7 w-7 rounded-none bg-app-accent-bg border border-app-border-active/20 flex items-center justify-center shrink-0 overflow-hidden">
                  {req.receiver?.avatar_url
                    ? <img src={req.receiver.avatar_url} alt={name} className="h-full w-full object-cover" />
                    : <Users className="h-3 w-3 text-app-text-primary" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold text-app-text-body uppercase truncate">{name}</p>
                  {req.receiver?.username && (
                    <p className="text-[9px] text-app-text-dim truncate">@{req.receiver.username}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[9px] text-app-text-secondary uppercase tracking-wider shrink-0">
                  <Clock className="h-3 w-3" />
                  Awaiting
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Buddy list */}
      <div className="space-y-2">
        {buddiesLoading ? (
          [1, 2].map((i) => <SkeletonBuddyCard key={i} />)
        ) : buddies.length === 0 ? (
          <EmptyState variant="no-buddies" compact />
        ) : (
          buddies.map((buddy) => (
            <BuddyCard
              key={buddy.buddy_id}
              buddy={buddy}
              goalId={goalId}
              onRemove={(buddyId) => removeBuddy.mutate({ buddyId })}
              isRemoving={removeBuddy.isPending && removeBuddy.variables?.buddyId === buddy.buddy_id}
            />
          ))
        )}
      </div>

      {sendRequest.isSuccess && (
        <div className="flex items-center gap-2 p-3 bg-app-accent-bg border border-app-border-active/40 text-app-text-primary text-[10px] font-bold uppercase tracking-wider animate-fade-in">
          <Check className="h-3.5 w-3.5" />
          Request sent!
        </div>
      )}
      {sendRequest.isError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-mono animate-fade-in">
          {(sendRequest.error as Error).message}
        </div>
      )}
    </div>
  );
};
