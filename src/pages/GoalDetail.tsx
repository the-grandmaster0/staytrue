import React from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, ShieldAlert, Clock, Sparkles, MessageSquare, Users, BarChart2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store/useAuthStore';
import type { Goal } from '../types/goal';
import { CATEGORIES, FREQUENCIES } from '../components/CreateGoalModal';
import { StreakCounter } from '../components/StreakCounter';
import { CheckInButton } from '../components/CheckInButton';
import { ContributionHeatmap } from '../components/ContributionHeatmap';
import { BuddyManager } from '../components/BuddyManager';
import { GoalChat } from '../components/GoalChat';
import { useCheckins } from '../hooks/useCheckins';
import { useMessages } from '../hooks/useMessages';

export const GoalDetail: React.FC = () => {
  const { goalId } = useParams<{ goalId: string }>();
  const { user } = useAuthStore();
  const location = useLocation();
  const [animateTrigger, setAnimateTrigger] = React.useState(0);

  // Allow Messages page to deep-link to the messages tab
  const initialTab = (location.state as any)?.tab ?? 'overview';
  const [activeTab, setActiveTab] = React.useState<'overview' | 'buddies' | 'messages'>(initialTab);

  const { data: goal, isLoading, error } = useQuery<Goal | null>({
    queryKey: ['goal', goalId],
    queryFn: async () => {
      if (!user || !goalId) return null;
      const { data, error: fetchError } = await supabase
        .from('goals').select('*').eq('id', goalId).eq('user_id', user.id).single();
      if (fetchError) throw fetchError;
      return data as Goal;
    },
    enabled: !!user && !!goalId,
    staleTime: 60_000,
  });

  const { data: checkins = [], isLoading: checkinsLoading } = useCheckins(goalId || '');
  const { data: goalMessages = [] } = useMessages(goalId || '');
  const unreadInGoal = goalMessages.filter((m) => m.receiver_id === user?.id && m.read_at === null).length;

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-app-text-primary" />
      </div>
    );
  }

  if (error || !goal) {
    return (
      <div className="bg-app-panel border border-red-500/30 rounded-xl p-6 text-center max-w-lg mx-auto">
        <ShieldAlert className="h-10 w-10 text-red-400 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-red-400 mb-2">Goal not found</h3>
        <p className="text-sm text-app-text-secondary mb-5">{(error as Error)?.message || 'Unable to load goal data.'}</p>
        <Link to="/dashboard" className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </div>
    );
  }

  const catMeta = CATEGORIES.find((c) => c.value === goal.category);
  const IconComponent = catMeta ? catMeta.icon : Sparkles;
  const isActionable = goal.status === 'active';

  const getDaysMeta = (d: string | null) => {
    if (!d) return { text: 'No deadline', color: 'text-app-text-secondary' };
    const diff = Math.ceil((new Date(d).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000);
    if (diff < 0) return { text: 'Overdue', color: 'text-red-400 font-semibold' };
    if (diff === 0) return { text: 'Due today', color: 'text-amber-400 font-semibold' };
    if (diff === 1) return { text: '1 day left', color: 'text-emerald-400' };
    return { text: `${diff} days left`, color: 'text-emerald-400' };
  };

  const daysMeta = getDaysMeta(goal.target_date);
  const recentNotes = checkins.filter((c) => c.note).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-app-border pb-6">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-app-text-secondary hover:text-app-text-body transition-colors mb-4">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to goals
        </Link>

        <div className="flex items-start gap-4">
          <span className={`p-3 rounded-xl border shrink-0 ${catMeta?.color || 'text-app-text-primary bg-app-accent-bg border-app-border-active/20'}`}>
            <IconComponent className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-app-text-body" style={{ fontFamily: 'var(--font-display)' }}>
              {goal.title}
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="chip">{FREQUENCIES.find((f) => f.value === goal.frequency)?.label}</span>
              <span className={`chip ${
                goal.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                goal.status === 'paused' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                'bg-app-accent-bg text-app-text-primary border-app-border-active/20'
              }`}>{goal.status}</span>
              <span className="flex items-center gap-1 text-sm">
                <Clock className="h-3.5 w-3.5 text-app-text-dim" />
                <span className={daysMeta.color}>{daysMeta.text}</span>
              </span>
            </div>
            {goal.description && (
              <p className="text-sm text-app-text-secondary mt-2 leading-relaxed">{goal.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-app-panel border border-app-border rounded-xl p-1 gap-0.5 w-fit">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart2 },
          { id: 'buddies',  label: 'Buddies',  icon: Users },
          { id: 'messages', label: 'Messages', icon: MessageSquare, badge: unreadInGoal },
        ].map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as any)}
            className={`relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              activeTab === id
                ? 'bg-app-accent-bg text-app-text-primary border border-app-border-active/30'
                : 'text-app-text-secondary hover:text-app-text-body'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {!!badge && badge > 0 && (
              <span className="badge" style={{ fontSize: '9px', padding: '0 5px', lineHeight: '16px', height: '16px' }}>
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <StreakCounter goalId={goal.id} frequency={goal.frequency} animateTrigger={animateTrigger} compact={false} />
            {isActionable && (
              <CheckInButton goalId={goal.id} size="md" onSuccess={() => setAnimateTrigger((n) => n + 1)} />
            )}
          </div>
          <ContributionHeatmap checkins={checkins} isLoading={checkinsLoading} />
          {recentNotes.length > 0 && (
            <div className="bg-app-panel border border-app-border rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-app-text-body">Recent notes</h3>
              <ul className="space-y-2 divide-y divide-app-border">
                {recentNotes.map((c) => (
                  <li key={c.id} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 pt-2 first:pt-0 text-sm">
                    <span className="text-xs text-app-text-secondary shrink-0">
                      {new Date(c.checked_in_at).toLocaleDateString()}
                    </span>
                    <span className="text-app-text-body">{c.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {activeTab === 'buddies' && (
        <div className="bg-app-panel border border-app-border rounded-xl p-5">
          <BuddyManager goalId={goal.id} />
        </div>
      )}

      {activeTab === 'messages' && <GoalChat goalId={goal.id} />}
    </div>
  );
};
