import React from 'react';
import { Swords, Trophy, Loader2, Clock, CheckCircle2, XCircle, Zap } from 'lucide-react';
import { useRespondChallenge } from '../hooks/useChallenges';
import { useAuthStore } from '../store/useAuthStore';
import type { Challenge } from '../types/challenge';

// ─── Score bar ────────────────────────────────────────────────────────────────
const ScoreBar: React.FC<{
  myScore: number;
  theirScore: number;
  total: number;
  isWinning: boolean;
}> = ({ myScore, theirScore, total, isWinning }) => {
  const myPct   = total > 0 ? Math.round((myScore   / total) * 100) : 50;
  const theirPct = total > 0 ? Math.round((theirScore / total) * 100) : 50;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] font-mono text-app-text-secondary uppercase tracking-wider">
        <span className={isWinning ? 'text-emerald-400 font-bold' : ''}>You — {myScore}pts</span>
        <span className={!isWinning ? 'text-amber-400 font-bold' : ''}>Them — {theirScore}pts</span>
      </div>
      <div className="h-2 bg-app-bg rounded-none overflow-hidden flex">
        <div
          className={`h-full transition-all duration-500 ${
            isWinning ? 'bg-emerald-400' : 'bg-app-border-active'
          }`}
          style={{ width: `${myPct}%` }}
        />
        <div
          className={`h-full transition-all duration-500 ${
            !isWinning ? 'bg-amber-400' : 'bg-app-border'
          }`}
          style={{ width: `${theirPct}%` }}
        />
      </div>
    </div>
  );
};

// ─── Days remaining pill ──────────────────────────────────────────────────────
const DaysLeft: React.FC<{ endDate: string | null }> = ({ endDate }) => {
  if (!endDate) return null;
  const diff = Math.ceil(
    (new Date(endDate).setHours(23, 59, 59) - Date.now()) / 86_400_000
  );
  if (diff < 0) return <span className="chip">Ended</span>;
  if (diff === 0) return <span className="chip bg-red-500/10 text-red-400 border-red-500/20">Last day!</span>;
  return (
    <span className="chip">
      <Clock className="h-3 w-3" /> {diff}d left
    </span>
  );
};

// ─── Main ChallengeCard ───────────────────────────────────────────────────────
interface ChallengeCardProps {
  challenge: Challenge;
}

export const ChallengeCard: React.FC<ChallengeCardProps> = ({ challenge }) => {
  const { user } = useAuthStore();
  const respond = useRespondChallenge();

  const isChallenger = challenge.challenger_id === user?.id;
  const me    = isChallenger ? challenge.challenger : challenge.opponent;
  const them  = isChallenger ? challenge.opponent   : challenge.challenger;
  const myScore    = isChallenger ? challenge.challenger_score : challenge.opponent_score;
  const theirScore = isChallenger ? challenge.opponent_score   : challenge.challenger_score;
  const total = challenge.duration_days;
  const isWinning  = myScore >= theirScore;

  const opponentName = them?.full_name || them?.username || them?.email || 'Buddy';
  const isProcessing = respond.isPending;

  // ── Pending (incoming challenge — I'm the opponent) ──────────────────────
  if (challenge.status === 'pending' && !isChallenger) {
    const senderName = me?.full_name || me?.username || me?.email || 'Someone';
    return (
      <div className="bg-app-panel border border-amber-500/30 rounded-none p-4 space-y-3 animate-fade-in">
        <div className="flex items-center gap-2">
          <Swords className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">Challenge received</p>
        </div>
        <p className="text-sm text-app-text-body">
          <span className="font-bold">{senderName}</span> challenged you to a{' '}
          <span className="text-app-text-primary font-bold">{challenge.category}</span> showdown
          for <span className="text-app-text-primary font-bold">{challenge.duration_days} days</span>.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => respond.mutate({ challengeId: challenge.id, accept: true })}
            disabled={isProcessing}
            style={{ minHeight: '44px' }}
            className="btn-primary flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Accept
          </button>
          <button
            onClick={() => respond.mutate({ challengeId: challenge.id, accept: false })}
            disabled={isProcessing}
            style={{ minHeight: '44px' }}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all cursor-pointer disabled:opacity-50 rounded-none"
          >
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            Decline
          </button>
        </div>
      </div>
    );
  }

  // ── Pending (outgoing — I'm the challenger, waiting) ─────────────────────
  if (challenge.status === 'pending' && isChallenger) {
    return (
      <div className="bg-app-panel border border-app-border rounded-none p-4 space-y-2 animate-fade-in opacity-70">
        <div className="flex items-center gap-2">
          <Swords className="h-4 w-4 text-app-text-dim shrink-0" />
          <p className="text-xs font-bold text-app-text-secondary uppercase tracking-widest">Challenge sent</p>
        </div>
        <p className="text-sm text-app-text-secondary">
          Waiting for <span className="font-semibold text-app-text-body">{opponentName}</span> to accept your{' '}
          <span className="text-app-text-primary">{challenge.category}</span> challenge.
        </p>
      </div>
    );
  }

  // ── Active ────────────────────────────────────────────────────────────────
  if (challenge.status === 'active') {
    return (
      <div className="bg-app-panel border border-app-border-active/30 rounded-none p-4 space-y-4 animate-fade-in glow-green">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords className="h-4 w-4 text-app-text-primary shrink-0" />
            <p className="text-xs font-black text-app-text-primary uppercase tracking-widest">
              {challenge.category} battle
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DaysLeft endDate={challenge.end_date} />
          </div>
        </div>

        {/* Versus */}
        <div className="flex items-center gap-3 text-center">
          <div className="flex-1">
            <p className="text-[10px] text-app-text-secondary truncate">You</p>
            <p className="text-3xl font-black text-emerald-400 tabular-nums">{myScore}</p>
          </div>
          <div className="text-app-text-dim font-black text-lg">VS</div>
          <div className="flex-1">
            <p className="text-[10px] text-app-text-secondary truncate">{opponentName}</p>
            <p className="text-3xl font-black text-amber-400 tabular-nums">{theirScore}</p>
          </div>
        </div>

        {/* Bar */}
        <ScoreBar myScore={myScore} theirScore={theirScore} total={total} isWinning={isWinning} />

        {/* Status line */}
        <p className="text-[10px] text-app-text-dim uppercase tracking-wider text-center">
          {isWinning && myScore > theirScore
            ? '⚡ You are leading — keep checking in!'
            : myScore === theirScore
            ? '🤝 Tied — one check-in could decide it'
            : '🔥 You are behind — catch up!'}
        </p>
      </div>
    );
  }

  // ── Completed ─────────────────────────────────────────────────────────────
  if (challenge.status === 'completed') {
    const iWon  = challenge.winner_id === user?.id;
    const isDraw = challenge.winner_id === null;
    return (
      <div className={`bg-app-panel rounded-none p-4 space-y-3 animate-fade-in border ${
        iWon ? 'border-emerald-500/30' : isDraw ? 'border-app-border' : 'border-red-500/20'
      }`}>
        <div className="flex items-center gap-2">
          {iWon
            ? <Trophy className="h-4 w-4 text-amber-400" />
            : isDraw
            ? <Zap className="h-4 w-4 text-app-text-dim" />
            : <Swords className="h-4 w-4 text-red-400" />}
          <p className={`text-xs font-bold uppercase tracking-widest ${
            iWon ? 'text-amber-400' : isDraw ? 'text-app-text-secondary' : 'text-red-400'
          }`}>
            {iWon ? 'Victory!' : isDraw ? 'Draw' : 'Defeat'}
          </p>
          <span className="ml-auto chip">{challenge.category}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-app-text-secondary">
            You <span className="font-bold text-app-text-body">{myScore}</span>
            {' '}—{' '}
            <span className="font-bold text-app-text-body">{theirScore}</span> {opponentName}
          </span>
          <span className="text-[10px] text-app-text-dim">
            {challenge.duration_days}d challenge
          </span>
        </div>
      </div>
    );
  }

  // ── Declined ──────────────────────────────────────────────────────────────
  return (
    <div className="bg-app-panel border border-app-border rounded-none p-4 opacity-50 animate-fade-in">
      <p className="text-xs text-app-text-secondary">
        Challenge with <span className="text-app-text-body font-semibold">{opponentName}</span> was declined.
      </p>
    </div>
  );
};
