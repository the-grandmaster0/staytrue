import React, { useState } from 'react';
import { Check, Loader2, MessageSquarePlus } from 'lucide-react';
import { useCheckIn, useTodayCheckin } from '../hooks/useCheckins';
import { useChallenges, useRefreshChallengeScores } from '../hooks/useChallenges';
import { useAuthStore } from '../store/useAuthStore';

interface CheckInButtonProps {
  goalId: string;
  disabled?: boolean;
  onSuccess?: () => void;
  size?: 'sm' | 'md';
}

export const CheckInButton: React.FC<CheckInButtonProps> = ({
  goalId, disabled = false, onSuccess, size = 'sm',
}) => {
  const { user } = useAuthStore();
  const { data: todayCheckin, isLoading: isCheckingToday } = useTodayCheckin(goalId);
  const checkInMutation = useCheckIn();
  const { data: challenges = [] } = useChallenges();
  const refreshScores = useRefreshChallengeScores();
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');

  const alreadyCheckedIn = !!todayCheckin;
  const isDisabled = disabled || alreadyCheckedIn || checkInMutation.isPending || isCheckingToday;
  const sizeClasses = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';

  const doCheckin = (withNote?: string) => {
    checkInMutation.mutate({ goalId, note: withNote?.trim() || undefined }, {
      onSuccess: () => {
        if (navigator.vibrate) navigator.vibrate(10);
        setShowNote(false);
        setNote('');
        onSuccess?.();
        // Refresh scores for any active challenges this user is part of
        const activeChallenges = challenges.filter(
          (c) => c.status === 'active' &&
            (c.challenger_id === user?.id || c.opponent_id === user?.id)
        );
        activeChallenges.forEach((c) => refreshScores.mutate(c.id));
      },
    });
  };

  if (alreadyCheckedIn) {
    return (
      <button disabled className={`flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 cursor-not-allowed ${sizeClasses} font-medium`} style={{ minHeight: '44px' }}>
        <Check className="h-3.5 w-3.5" />
        Checked in today
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {showNote && (
        <div className="w-full sm:w-64 animate-fade-in">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            placeholder="Add a quick note... (optional)"
            rows={2}
            className="input-field w-full px-3 py-2 text-sm resize-none"
          />
          <p className="text-xs text-app-text-dim text-right mt-0.5">{note.length}/200</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        {!showNote && (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            disabled={isDisabled}
            title="Add a note"
            className="btn-ghost p-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed rounded-lg"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
          </button>
        )}

        {showNote ? (
          <>
            <button
              type="button"
              onClick={() => { setShowNote(false); setNote(''); }}
              className={`btn-ghost ${sizeClasses} font-medium cursor-pointer`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => doCheckin(note)}
              disabled={isDisabled}
              className={`btn-primary flex items-center gap-1.5 ${sizeClasses} font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {checkInMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Confirm
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => doCheckin()}
            disabled={isDisabled}
            className={`btn-primary flex items-center gap-1.5 ${sizeClasses} font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
            style={{ minHeight: '44px' }}
          >
            {checkInMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Check in
          </button>
        )}
      </div>

      {checkInMutation.isError && (
        <p className="text-xs text-red-400">{(checkInMutation.error as Error).message}</p>
      )}
    </div>
  );
};
