import React from 'react';
import { Swords, Trophy, Loader2, ShieldAlert } from 'lucide-react';
import { useChallenges, useChallengesFeed } from '../hooks/useChallenges';
import { ChallengeCard } from '../components/ChallengeCard';
import { useAuthStore } from '../store/useAuthStore';
import type { Challenge } from '../types/challenge';

export const Challenges: React.FC = () => {
  const { user } = useAuthStore();
  const { data: challenges = [], isLoading, error } = useChallenges();

  // Subscribe to realtime updates
  useChallengesFeed();

  const pending  = challenges.filter((c) => c.status === 'pending');
  const active   = challenges.filter((c) => c.status === 'active');
  const finished = challenges.filter(
    (c) => c.status === 'completed' || c.status === 'declined'
  );

  const wins   = finished.filter((c) => c.winner_id === user?.id).length;
  const losses = finished.filter(
    (c) => c.status === 'completed' && c.winner_id !== null && c.winner_id !== user?.id
  ).length;
  const draws  = finished.filter(
    (c) => c.status === 'completed' && c.winner_id === null
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold text-app-text-body"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Challenges
        </h1>
        <p className="text-sm text-app-text-secondary mt-0.5">
          Compete with your accountability buddies
        </p>
      </div>

      {/* Stats bar */}
      {finished.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Wins',   value: wins,   color: 'text-emerald-400', icon: '🏆' },
            { label: 'Losses', value: losses, color: 'text-red-400',     icon: '💀' },
            { label: 'Draws',  value: draws,  color: 'text-app-text-secondary', icon: '🤝' },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-app-panel border border-app-border rounded-none p-4 text-center"
            >
              <p className="text-xl mb-0.5">{s.icon}</p>
              <p className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-app-text-dim uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex min-h-[20vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-app-text-primary" />
        </div>
      ) : error ? (
        <div className="bg-app-panel border border-red-500/30 rounded-xl p-6 text-center">
          <ShieldAlert className="h-8 w-8 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-red-400">{(error as Error).message}</p>
        </div>
      ) : challenges.length === 0 ? (
        <div className="bg-app-panel border border-app-border border-dashed rounded-none p-12 text-center animate-fade-in">
          <Swords className="h-10 w-10 text-app-text-dim mx-auto mb-4" />
          <p className="text-sm font-bold text-app-text-secondary mb-1">No challenges yet</p>
          <p className="text-xs text-app-text-dim">
            Go to your buddies list and hit the ⚔ Challenge button to start competing.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Incoming pending */}
          {pending.filter((c) => c.opponent_id === user?.id).length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-amber-400 flex items-center gap-2">
                <Swords className="h-3.5 w-3.5" /> Incoming challenges
              </h2>
              {pending
                .filter((c) => c.opponent_id === user?.id)
                .map((c) => <ChallengeCard key={c.id} challenge={c} />)}
            </section>
          )}

          {/* Outgoing pending */}
          {pending.filter((c) => c.challenger_id === user?.id).length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-app-text-secondary flex items-center gap-2">
                <Swords className="h-3.5 w-3.5" /> Sent challenges
              </h2>
              {pending
                .filter((c) => c.challenger_id === user?.id)
                .map((c) => <ChallengeCard key={c.id} challenge={c} />)}
            </section>
          )}

          {/* Active */}
          {active.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-app-text-primary flex items-center gap-2">
                <Swords className="h-3.5 w-3.5" /> Active battles
              </h2>
              {active.map((c) => <ChallengeCard key={c.id} challenge={c} />)}
            </section>
          )}

          {/* History */}
          {finished.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-app-text-dim flex items-center gap-2">
                <Trophy className="h-3.5 w-3.5" /> History
              </h2>
              {finished.map((c) => <ChallengeCard key={c.id} challenge={c} />)}
            </section>
          )}
        </div>
      )}
    </div>
  );
};
