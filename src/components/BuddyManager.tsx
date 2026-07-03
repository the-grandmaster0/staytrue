import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Search,
  Loader2,
  UserPlus,
  Check,
  Clock,
  Trash2,
  X,
  Flame,
  Calendar,
} from 'lucide-react';
import {
  useSearchProfiles,
  useBuddyRequestsForGoal,
  useGoalBuddies,
  useSendBuddyRequest,
  useRemoveBuddy,
  useBuddyStreak,
} from '../hooks/useBuddies';
import { SkeletonBuddyCard } from './Skeleton';
import { EmptyState } from './EmptyState';
import type { Buddy } from '../types/buddy';
import { useAuthStore } from '../store/useAuthStore';

// ─── Individual Buddy Card ────────────────────────────────────────────────────
interface BuddyCardProps {
  buddy: Buddy;
  goalId: string;
  onRemove: (buddyId: string) => void;
  isRemoving: boolean;
}

const BuddyCard: React.FC<BuddyCardProps> = ({ buddy, goalId, onRemove, isRemoving }) => {
  const { data: streakData } = useBuddyStreak(goalId, buddy.buddy_id);
  const name = buddy.profile?.full_name || buddy.profile?.email || 'UNKNOWN_NODE';
  const lastCheckin = streakData?.last_checkin_date
    ? new Date(streakData.last_checkin_date).toLocaleDateString()
    : 'N/A';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-app-panel border border-app-border-active/20 p-4 animate-fade-in glow-green">
      {/* Avatar + info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="h-10 w-10 rounded-none bg-app-accent-bg border border-app-border-active/40 flex items-center justify-center shrink-0 overflow-hidden">
          {buddy.profile?.avatar_url ? (
            <img
              src={buddy.profile.avatar_url}
              alt={name}
              className="h-full w-full object-cover"
            />
          ) : (
            <Users className="h-4 w-4 text-app-text-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-app-text-body uppercase truncate">{name}</p>
          <p className="text-[10px] text-app-text-secondary lowercase truncate">
            {buddy.profile?.email}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-[10px] uppercase tracking-wider shrink-0">
        <div className="flex items-center gap-1 text-app-text-primary font-bold">
          <Flame className="h-3.5 w-3.5" />
          <span>{String(streakData?.current_streak ?? 0).padStart(2, '0')}_STK</span>
        </div>
        <div className="flex items-center gap-1 text-app-text-secondary">
          <Calendar className="h-3.5 w-3.5" />
          <span>{lastCheckin}</span>
        </div>
      </div>

      {/* Remove button */}
      <button
        onClick={() => onRemove(buddy.buddy_id)}
        disabled={isRemoving}
        style={{ minHeight: '44px' }}
        className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-lg border border-red-500/30 text-red-400 hover:text-red-500 hover:border-red-500/60 hover:bg-red-500/10 transition-all cursor-pointer disabled:opacity-40 shrink-0"
        aria-label={`Remove ${name} as buddy`}
      >
        {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        Remove
      </button>
    </div>
  );
};

// ─── Confirm Remove Modal ─────────────────────────────────────────────────────
interface ConfirmRemoveModalProps {
  buddyName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmRemoveModal: React.FC<ConfirmRemoveModalProps> = ({
  buddyName,
  onConfirm,
  onCancel,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
    <div className="bg-app-panel border border-red-500/50 rounded-none p-6 max-w-sm w-full animate-fade-in shadow-2xl">
      <div className="flex items-center gap-2 mb-4">
        <Trash2 className="h-4 w-4 text-red-500" />
        <h3 className="text-sm font-bold text-red-500 uppercase tracking-widest">
          CONFIRM_REMOVAL
        </h3>
        <button
          onClick={onCancel}
          className="ml-auto text-app-text-secondary hover:text-app-text-primary transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-xs text-app-text-secondary uppercase tracking-wider leading-relaxed mb-6">
        Remove{' '}
        <span className="text-app-text-body font-bold">{buddyName}</span> as buddy from this goal?
        This will sever the accountability link.
      </p>
      <div className="flex items-center gap-3 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider border border-app-border text-app-text-secondary hover:text-app-text-primary hover:border-app-border-active/40 rounded-none transition-all cursor-pointer"
        >
          CANCEL
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider border border-red-500/60 text-red-400 bg-red-500/10 hover:bg-red-500/25 rounded-none transition-all cursor-pointer"
        >
          CONFIRM_REMOVE
        </button>
      </div>
    </div>
  </div>
);

// ─── Main BuddyManager component ─────────────────────────────────────────────
interface BuddyManagerProps {
  goalId: string;
}

export const BuddyManager: React.FC<BuddyManagerProps> = ({ goalId }) => {
  const { user } = useAuthStore();

  const [emailQuery, setEmailQuery] = useState('');
  const [debouncedEmail, setDebouncedEmail] = useState('');
  const [removeTarget, setRemoveTarget] = useState<Buddy | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce email search — 300ms, min 3 chars
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedEmail(emailQuery);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [emailQuery]);

  const { data: searchResults = [], isFetching: isSearching } = useSearchProfiles(debouncedEmail);
  const { data: goalRequests = [] } = useBuddyRequestsForGoal(goalId);
  const { data: buddies = [], isLoading: buddiesLoading } = useGoalBuddies(goalId);
  const sendRequest = useSendBuddyRequest();
  const removeBuddy = useRemoveBuddy();

  // Build sets for quick status lookup
  const acceptedBuddyIds = new Set(buddies.map((b) => b.buddy_id));
  const pendingReceiverIds = new Set(
    goalRequests
      .filter((r) => r.status === 'pending' && r.sender_id === user?.id)
      .map((r) => r.receiver_id)
  );

  const handleSend = (receiverId: string) => {
    sendRequest.mutate({ goalId, receiverId });
  };

  const handleRemoveConfirm = () => {
    if (!removeTarget) return;
    removeBuddy.mutate(
      { goalId, buddyId: removeTarget.buddy_id },
      { onSuccess: () => setRemoveTarget(null) }
    );
  };

  // Filter out self and existing buddies from search results
  const filteredResults = searchResults.filter(
    (p) => p.id !== user?.id && !acceptedBuddyIds.has(p.id)
  );

  return (
    <>
      {removeTarget && (
        <ConfirmRemoveModal
          buddyName={removeTarget.profile?.full_name || removeTarget.profile?.email || 'this user'}
          onConfirm={handleRemoveConfirm}
          onCancel={() => setRemoveTarget(null)}
        />
      )}

      <div className="space-y-6">
        {/* Section Header */}
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-app-text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-app-text-primary">
            ACCOUNTABILITY_BUDDIES
          </h3>
          {buddies.length > 0 && (
            <span className="ml-auto px-2 py-0.5 bg-app-accent-bg border border-app-border-active/40 text-app-text-primary text-[9px] font-bold uppercase tracking-widest">
              {String(buddies.length).padStart(2, '0')}_LINKED
            </span>
          )}
        </div>

        {/* Search buddy by email */}
        <div className="space-y-2">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-app-text-secondary">
            SEARCH_NODE_BY_EMAIL
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              {isSearching ? (
                <Loader2 className="h-4 w-4 text-app-text-dim animate-spin" />
              ) : (
                <Search className="h-4 w-4 text-app-text-dim" />
              )}
            </span>
            <input
              id="buddy-search-input"
              type="email"
              value={emailQuery}
              onChange={(e) => setEmailQuery(e.target.value)}
              placeholder="MIN_3_CHARS..."
              className="block w-full pl-10 pr-4 py-2.5 bg-app-input border border-app-border focus:border-app-border-active text-xs rounded-none text-app-text-primary placeholder-app-text-dim focus:outline-none focus:ring-1 focus:ring-app-accent/10 transition-all"
            />
          </div>

          {/* Search Results */}
          {debouncedEmail.length >= 3 && (
            <div className="border border-app-border bg-app-panel overflow-hidden animate-fade-in">
              {filteredResults.length === 0 ? (
                <div className="p-4 text-center text-[10px] text-app-text-secondary uppercase tracking-wider">
                  {isSearching ? 'SCANNING...' : 'NO_NODES_FOUND'}
                </div>
              ) : (
                <ul className="divide-y divide-app-border">
                  {filteredResults.map((profile) => {
                    const isPending = pendingReceiverIds.has(profile.id);
                    const isSending =
                      sendRequest.isPending && sendRequest.variables?.receiverId === profile.id;
                    const displayName = profile.full_name || profile.email;

                    return (
                      <li
                        key={profile.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-app-bg transition-colors"
                      >
                        {/* Profile */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-7 w-7 rounded-none bg-app-accent-bg border border-app-border-active/20 flex items-center justify-center shrink-0 overflow-hidden">
                            {profile.avatar_url ? (
                              <img
                                src={profile.avatar_url}
                                alt={displayName || ''}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Users className="h-3 w-3 text-app-text-primary" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold text-app-text-body uppercase truncate">
                              {displayName}
                            </p>
                            <p className="text-[9px] text-app-text-secondary truncate lowercase">
                              {profile.email}
                            </p>
                          </div>
                        </div>

                        {/* Action */}
                        {isPending ? (
                          <div className="flex items-center gap-1 text-xs text-app-text-secondary shrink-0">
                            <Clock className="h-3.5 w-3.5" />
                            Pending
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSend(profile.id)}
                            disabled={isSending}
                            style={{ minHeight: '44px' }}
                            className="btn-primary flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg cursor-pointer disabled:opacity-40 shrink-0"
                            aria-label={`Send buddy request to ${displayName}`}
                          >
                            {isSending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <UserPlus className="h-3.5 w-3.5" />
                            )}
                            Invite
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Accepted Buddies List */}
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
                onRemove={(buddyId) => {
                  const found = buddies.find((b) => b.buddy_id === buddyId);
                  if (found) setRemoveTarget(found);
                }}
                isRemoving={
                  removeBuddy.isPending && removeBuddy.variables?.buddyId === buddy.buddy_id
                }
              />
            ))
          )}
        </div>

        {/* Sent pending requests section */}
        {goalRequests.filter((r) => r.status === 'pending' && r.sender_id === user?.id).length >
          0 && (
          <div className="space-y-2">
            <p className="text-[9px] font-bold uppercase tracking-widest text-app-text-dim">
              PENDING_SENT_REQUESTS
            </p>
            {goalRequests
              .filter((r) => r.status === 'pending' && r.sender_id === user?.id)
              .map((req) => {
                const name =
                  req.receiver?.full_name || req.receiver?.email || 'UNKNOWN_NODE';
                return (
                  <div
                    key={req.id}
                    className="flex items-center gap-3 px-4 py-3 border border-app-border bg-app-panel animate-fade-in"
                  >
                    <div className="h-7 w-7 rounded-none bg-app-accent-bg border border-app-border-active/20 flex items-center justify-center shrink-0 overflow-hidden">
                      {req.receiver?.avatar_url ? (
                        <img
                          src={req.receiver.avatar_url}
                          alt={name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Users className="h-3 w-3 text-app-text-primary" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold text-app-text-body uppercase truncate">
                        {name}
                      </p>
                      <p className="text-[9px] text-app-text-secondary truncate lowercase">
                        {req.receiver?.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-[9px] text-app-text-secondary uppercase tracking-wider shrink-0">
                      <Clock className="h-3 w-3" />
                      AWAITING_RESPONSE
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* Success message */}
        {sendRequest.isSuccess && (
          <div className="flex items-center gap-2 p-3 bg-app-accent-bg border border-app-border-active/40 text-app-text-primary text-[10px] font-bold uppercase tracking-wider animate-fade-in">
            <Check className="h-3.5 w-3.5" />
            REQUEST_SENT_SUCCESSFULLY
          </div>
        )}
      </div>
    </>
  );
};
