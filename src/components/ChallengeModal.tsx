import React, { useState } from 'react';
import { Swords, X, Loader2 } from 'lucide-react';
import { useSendChallenge } from '../hooks/useChallenges';
import type { ChallengeCategory, ChallengeDuration } from '../types/challenge';
import type { Profile } from '../store/useAuthStore';

const CATEGORIES: { value: ChallengeCategory; label: string; emoji: string }[] = [
  { value: 'fitness',     label: 'Fitness',     emoji: '🏋️' },
  { value: 'learning',    label: 'Learning',    emoji: '📚' },
  { value: 'mindfulness', label: 'Mindfulness', emoji: '🧘' },
  { value: 'finance',     label: 'Finance',     emoji: '💰' },
  { value: 'career',      label: 'Career',      emoji: '💼' },
  { value: 'other',       label: 'Other',       emoji: '🎯' },
];

const DURATIONS: { value: ChallengeDuration; label: string }[] = [
  { value: 7,  label: '7 days'  },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
];

interface ChallengeModalProps {
  opponent: Profile;
  onClose: () => void;
  onSent: () => void;
}

export const ChallengeModal: React.FC<ChallengeModalProps> = ({
  opponent,
  onClose,
  onSent,
}) => {
  const [category, setCategory] = useState<ChallengeCategory>('fitness');
  const [duration, setDuration] = useState<ChallengeDuration>(7);
  const send = useSendChallenge();

  const opponentName = opponent.full_name || opponent.username || opponent.email || 'your buddy';

  const handleSubmit = () => {
    send.mutate(
      { opponentId: opponent.id, category, durationDays: duration },
      {
        onSuccess: () => {
          onSent();
          onClose();
        },
      }
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="challenge-modal-title"
    >
      <div className="bg-app-panel border border-app-border-active/40 rounded-none w-full max-w-sm animate-slide-up shadow-2xl relative overflow-hidden">
        {/* Scan line */}
        <div className="animate-scan-line" aria-hidden="true" />

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-app-border">
          <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-none">
            <Swords className="h-4 w-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="challenge-modal-title"
              className="text-sm font-black text-app-text-body uppercase tracking-widest"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Challenge
            </h2>
            <p className="text-[10px] text-app-text-secondary truncate">
              vs {opponentName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-app-text-secondary hover:text-app-text-primary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-5">
          {/* Category */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-app-text-secondary mb-2">
              Goal category
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  className={`flex flex-col items-center gap-1 py-2.5 px-2 border rounded-none text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    category === c.value
                      ? 'border-app-border-active bg-app-accent-bg text-app-text-primary'
                      : 'border-app-border text-app-text-secondary hover:border-app-border-active/50 hover:text-app-text-body'
                  }`}
                >
                  <span className="text-base leading-none">{c.emoji}</span>
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-app-text-secondary mb-2">
              Duration
            </label>
            <div className="flex gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDuration(d.value)}
                  className={`flex-1 py-2.5 border rounded-none text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    duration === d.value
                      ? 'border-app-border-active bg-app-accent-bg text-app-text-primary'
                      : 'border-app-border text-app-text-secondary hover:border-app-border-active/50 hover:text-app-text-body'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rules summary */}
          <div className="p-3 bg-app-bg border border-app-border rounded-none text-[10px] text-app-text-secondary leading-relaxed space-y-1">
            <p className="font-bold text-app-text-body uppercase tracking-wider">How it works</p>
            <p>Each day you check in on any <span className="text-app-text-primary font-bold">{category}</span> goal = +1 point.</p>
            <p>Most check-in days in <span className="text-app-text-primary font-bold">{duration} days</span> wins.</p>
            <p>Ties are declared a draw.</p>
          </div>

          {send.isError && (
            <p className="text-xs text-red-400 font-mono">{(send.error as Error).message}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 btn-ghost py-2.5 text-xs cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={send.isPending}
            className="flex-1 btn-primary flex items-center justify-center gap-2 py-2.5 text-xs cursor-pointer disabled:opacity-50"
          >
            {send.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Swords className="h-3.5 w-3.5" />}
            Send challenge
          </button>
        </div>
      </div>
    </div>
  );
};
