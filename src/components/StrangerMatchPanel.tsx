import React, { useEffect, useState } from 'react';
import {
  Shuffle,
  Loader2,
  Clock,
  X,
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useStrangerMatch } from '../hooks/useStrangerMatch';
import type { Profile } from '../store/useAuthStore';

// ─── Confetti burst (pure CSS, no library) ────────────────────────────────────
const CONFETTI_COLORS = ['#34d399', '#10b981', '#6ee7b7', '#d1fae5', '#a7f3d0'];

const ConfettiBurst: React.FC = () => {
  const particles = Array.from({ length: 18 }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {particles.map((i) => {
        const left = `${Math.random() * 90 + 5}%`;
        const delay = `${Math.random() * 0.4}s`;
        const size = `${Math.random() * 4 + 4}px`;
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        return (
          <span
            key={i}
            className="confetti-particle"
            style={{
              left,
              top: `${Math.random() * 20}%`,
              animationDelay: delay,
              width: size,
              height: size,
              backgroundColor: color,
              borderRadius: i % 3 === 0 ? '50%' : '0',
            }}
          />
        );
      })}
    </div>
  );
};

// ─── Matched buddy card ───────────────────────────────────────────────────────
const MatchedBuddyCard: React.FC<{ buddy: Profile; onReset: () => void }> = ({
  buddy,
  onReset,
}) => {
  const name = buddy.full_name || buddy.email || 'UNKNOWN_OPERATOR';
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowConfetti(false), 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative border border-app-border-active bg-app-accent-bg rounded-none p-6 animate-match-reveal animate-match-pulse overflow-hidden">
      {/* Scan line */}
      <div className="animate-scan-line" aria-hidden="true" />

      {/* Confetti */}
      {showConfetti && <ConfettiBurst />}

      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <CheckCircle2 className="h-4 w-4 text-app-text-primary shrink-0" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-app-text-primary">
          MATCH_ACQUIRED // STATUS: LINKED
        </p>
      </div>

      {/* Buddy profile */}
      <div className="flex items-center gap-4">
        <div className="relative h-14 w-14 shrink-0 bg-app-panel border border-app-border-active/60 flex items-center justify-center overflow-hidden glow-green">
          {buddy.avatar_url ? (
            <img
              src={buddy.avatar_url}
              alt={name}
              className="h-full w-full object-cover"
            />
          ) : (
            <Users className="h-6 w-6 text-app-text-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-app-text-body uppercase tracking-wide truncate">
            {name}
          </p>
          {buddy.email && (
            <p className="text-[10px] text-app-text-secondary lowercase truncate mt-0.5">
              {buddy.email}
            </p>
          )}
          {buddy.timezone && (
            <p className="text-[9px] text-app-text-dim uppercase tracking-wider mt-1">
              TZ: {buddy.timezone}
            </p>
          )}
        </div>
      </div>

      {/* Footer action */}
      <div className="mt-5 pt-4 border-t border-app-border flex items-center justify-between">
        <p className="text-[9px] text-app-text-dim uppercase tracking-wider leading-relaxed max-w-xs">
          Accountability link established. Buddy added to this goal.
        </p>
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border border-app-border text-app-text-secondary hover:text-app-text-primary hover:border-app-border-active/40 rounded-none transition-all cursor-pointer shrink-0 ml-4"
        >
          <RefreshCw className="h-3 w-3" />
          RESET
        </button>
      </div>
    </div>
  );
};

// ─── Waiting state ────────────────────────────────────────────────────────────
const WaitingState: React.FC<{ category: string; onCancel: () => void }> = ({
  category,
  onCancel,
}) => (
  <div className="relative border border-app-border bg-app-panel rounded-none p-6 overflow-hidden">
    {/* Scan line */}
    <div className="animate-scan-line" aria-hidden="true" />

    <div className="flex flex-col items-center text-center gap-4">
      {/* Pulsing radar icon */}
      <div className="relative flex items-center justify-center h-14 w-14">
        <div className="absolute inset-0 rounded-none border border-app-border-active/40 animate-wait-ping" />
        <div className="absolute inset-2 rounded-none border border-app-border-active/25 animate-wait-ping [animation-delay:0.4s]" />
        <Clock className="h-6 w-6 text-app-text-primary relative z-10" />
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-app-text-primary mb-1">
          SCANNING_NETWORK...
        </p>
        <p className="text-[10px] text-app-text-secondary uppercase tracking-wide leading-relaxed">
          Looking for a{' '}
          <span className="text-app-text-body font-bold">{category.toUpperCase()}</span> buddy.
          <br />
          You'll be notified the moment one is found.
        </p>
      </div>

      {/* Category badge */}
      <div className="px-3 py-1 border border-app-border-active/30 bg-app-accent-bg text-[9px] font-bold uppercase tracking-widest text-app-text-primary">
        CAT: {category.toUpperCase()} // QUEUE: ACTIVE
      </div>

      <button
        onClick={onCancel}
        className="flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold uppercase tracking-wider border border-red-500/30 text-red-500/70 hover:text-red-500 hover:border-red-500/60 hover:bg-red-500/10 rounded-none transition-all cursor-pointer"
      >
        <X className="h-3.5 w-3.5" />
        CANCEL_SEARCH
      </button>
    </div>
  </div>
);

// ─── Main StrangerMatchPanel ──────────────────────────────────────────────────
interface StrangerMatchPanelProps {
  goalId: string;
  goalTitle: string;
  goalCategory: string;
}

export const StrangerMatchPanel: React.FC<StrangerMatchPanelProps> = ({
  goalId,
  goalTitle,
  goalCategory,
}) => {
  const { matchState, triggerMatch, cancelWaiting, reset } = useStrangerMatch(goalId);

  return (
    <div className="space-y-3">
      {/* Section label */}
      <div className="flex items-center gap-2">
        <Shuffle className="h-3.5 w-3.5 text-app-text-primary shrink-0" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-app-text-primary">
          STRANGER_MATCH
        </p>
        <span className="ml-auto px-2 py-0.5 border border-app-border text-[8px] font-bold uppercase tracking-widest text-app-text-dim">
          OPT-IN
        </span>
      </div>

      {/* Goal label */}
      <p className="text-[9px] text-app-text-secondary uppercase tracking-wider truncate">
        TARGET:{' '}
        <span className="text-app-text-body font-bold">{goalTitle}</span>
        {' '}// CAT:{' '}
        <span className="text-app-text-body font-bold">{goalCategory.toUpperCase()}</span>
      </p>

      {/* State machine rendering */}
      {matchState.status === 'idle' && (
        <div className="border border-app-border border-dashed bg-app-panel p-5 text-center">
          <Shuffle className="h-7 w-7 text-app-text-dim mx-auto mb-3" />
          <p className="text-[10px] text-app-text-secondary uppercase tracking-wider mb-4 leading-relaxed">
            Opt in to be matched with a stranger pursuing the same goal category.
            No invite required — instant or queued matching.
          </p>
          <button
            onClick={triggerMatch}
            className="inline-flex items-center gap-2 px-5 py-2.5 btn-primary text-xs font-bold uppercase tracking-widest border rounded-none transition-all cursor-pointer"
          >
            <Shuffle className="h-4 w-4" />
            MATCH_ME
          </button>
        </div>
      )}

      {matchState.status === 'loading' && (
        <div className="border border-app-border bg-app-panel p-6 flex items-center justify-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-app-text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-app-text-secondary">
            QUERYING_POOL...
          </span>
        </div>
      )}

      {matchState.status === 'waiting' && (
        <WaitingState
          category={matchState.poolEntry.category}
          onCancel={cancelWaiting}
        />
      )}

      {matchState.status === 'matched' && (
        <MatchedBuddyCard buddy={matchState.buddy} onReset={reset} />
      )}

      {matchState.status === 'error' && (
        <div className="border border-red-500/40 bg-app-panel p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-500">
              MATCH_ERROR
            </p>
          </div>
          <p className="text-[10px] text-app-text-secondary uppercase tracking-wide">
            {matchState.message}
          </p>
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border border-app-border text-app-text-secondary hover:text-app-text-primary rounded-none transition-all cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" />
            RETRY
          </button>
        </div>
      )}
    </div>
  );
};
