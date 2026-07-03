import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shuffle, Loader2, Sparkles, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store/useAuthStore';
import { StrangerMatchPanel } from '../components/StrangerMatchPanel';
import type { Goal } from '../types/goal';

export const FindBuddy: React.FC = () => {
  const { user } = useAuthStore();

  const { data: goals = [], isLoading, error } = useQuery<Goal[]>({
    // Unique key so this page has its own cache entry, not shared with Dashboard
    queryKey: ['goals-find-buddy', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error: err } = await supabase
        .from('goals')
        .select('id, title, category, status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (err) throw err;
      return (data || []) as Goal[];
    },
    enabled: !!user,
    // Always re-fetch when the page is visited — fixes the "need to reload" issue
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const activeGoals = goals.filter((g) => g.status === 'active');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-app-text-body" style={{ fontFamily: 'var(--font-display)' }}>
          Find a Buddy
        </h1>
        <p className="text-sm text-app-text-secondary mt-0.5">
          Get matched with someone working toward the same type of goal
        </p>
      </div>

      {/* How it works */}
      <div className="bg-app-panel border border-app-border rounded-xl p-5 flex gap-4 items-start">
        <div className="p-2.5 rounded-xl bg-app-accent-bg border border-app-border-active/20 shrink-0">
          <Shuffle className="h-4 w-4 text-app-text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-app-text-body mb-1">How it works</p>
          <p className="text-sm text-app-text-secondary leading-relaxed">
            Click <strong className="text-app-text-body">Match Me</strong> on any active goal.
            If someone is already waiting in the same category, you're instantly paired.
            Otherwise you'll be queued and matched the moment they join — no email needed.
          </p>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-app-text-primary" />
        </div>
      ) : error ? (
        <div className="bg-app-panel border border-red-500/30 rounded-xl p-6 text-center max-w-lg mx-auto">
          <ShieldAlert className="h-8 w-8 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-red-400">{(error as Error).message}</p>
        </div>
      ) : activeGoals.length === 0 ? (
        <div className="bg-app-panel border border-app-border border-dashed rounded-2xl p-12 text-center animate-fade-in">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-app-accent-bg border border-app-border-active/20 mb-5">
            <Sparkles className="h-6 w-6 text-app-text-primary" />
          </div>
          <h3 className="text-base font-semibold text-app-text-body mb-2">No active goals</h3>
          <p className="text-sm text-app-text-secondary mb-5 max-w-sm mx-auto">
            You need at least one active goal to find a buddy. Create one from your dashboard first.
          </p>
          <Link to="/dashboard" className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm cursor-pointer">
            Go to Dashboard
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {activeGoals.map((goal) => (
            <div key={goal.id} className="bg-app-panel border border-app-border rounded-xl p-5 space-y-4 animate-fade-in">
              {/* Goal header */}
              <div className="pb-4 border-b border-app-border">
                <p className="text-sm font-semibold text-app-text-body truncate">{goal.title}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="chip">{goal.category}</span>
                  <span className="chip bg-green-500/10 text-green-400 border-green-500/20">
                    {goal.status}
                  </span>
                </div>
              </div>

              <StrangerMatchPanel
                goalId={goal.id}
                goalTitle={goal.title}
                goalCategory={goal.category}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
