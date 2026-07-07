import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Play, Pause, Trash2, Clock, Sparkles, ArrowRight } from 'lucide-react';
import type { Goal } from '../types/goal';
import { CATEGORIES, FREQUENCIES } from './CreateGoalModal';
import { StreakCounter } from './StreakCounter';
import { CheckInButton } from './CheckInButton';

interface GoalCardProps {
  goal: Goal;
  daysMeta: { text: string; color: string };
  onStatusToggle: (goal: Goal) => void;
  onPauseToggle: (goal: Goal) => void;
  onDelete: (goalId: string) => void;
}

export const GoalCard: React.FC<GoalCardProps> = ({ goal, daysMeta, onStatusToggle, onPauseToggle, onDelete }) => {
  const [animateTrigger, setAnimateTrigger] = useState(0);
  const catMeta = CATEGORIES.find((c) => c.value === goal.category);
  const IconComponent = catMeta ? catMeta.icon : Sparkles;
  const isActionable = goal.status === 'active';
  const isCompleted = goal.status === 'completed';

  return (
    <div className={`bg-app-panel border border-app-border rounded-xl p-5 flex flex-col gap-4 transition-all duration-200 card-glow ${isCompleted ? 'opacity-60' : ''}`}>
      {/* Top row */}
      <div className="flex items-start gap-3">
        {/* Category icon */}
        <div className={`p-2.5 rounded-lg border shrink-0 ${catMeta?.color || 'text-app-text-primary bg-app-accent-bg border-app-border-active/20'}`}>
          <IconComponent className="h-4 w-4" />
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <Link
            to={`/dashboard/goals/${goal.id}`}
            className={`text-sm font-semibold hover:text-app-text-primary transition-colors leading-snug block truncate ${
              isCompleted ? 'line-through text-app-text-secondary' : 'text-app-text-body'
            }`}
          >
            {goal.title}
          </Link>

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="chip">{catMeta?.label || goal.category}</span>
            <span className="text-xs text-app-text-secondary">
              {FREQUENCIES.find((f) => f.value === goal.frequency)?.label}
            </span>
            {goal.status !== 'active' && (
              <span className={`chip ${goal.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                {goal.status}
              </span>
            )}
          </div>

          {goal.description && (
            <p className="text-xs text-app-text-secondary mt-1.5 leading-relaxed line-clamp-2">
              {goal.description}
            </p>
          )}
        </div>

        {/* Details link */}
        <Link
          to={`/dashboard/goals/${goal.id}`}
          className="btn-ghost p-2 shrink-0 hidden sm:flex items-center justify-center"
          title="View details"
        >
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-app-text-secondary">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-app-text-dim" />
          <span className={daysMeta.color}>{daysMeta.text}</span>
        </span>
        <StreakCounter goalId={goal.id} frequency={goal.frequency} animateTrigger={animateTrigger} />
      </div>

      {/* Action row */}
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-app-border">
        {isActionable ? (
          <CheckInButton goalId={goal.id} goalTitle={goal.title} onSuccess={() => setAnimateTrigger((n) => n + 1)} />
        ) : (
          <span className="text-xs text-app-text-secondary">
            {goal.status === 'paused' ? 'Paused' : 'Completed'}
          </span>
        )}

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onStatusToggle(goal)}
            title={isCompleted ? 'Mark as active' : 'Mark as complete'}
            className={`flex items-center justify-center p-2 rounded-lg border transition-all cursor-pointer ${
              isCompleted
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'btn-ghost'
            }`}
            style={{ minHeight: '44px', minWidth: '44px' }}
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>

          {!isCompleted && (
            <button
              onClick={() => onPauseToggle(goal)}
              title={goal.status === 'paused' ? 'Resume' : 'Pause'}
              className="btn-ghost flex items-center justify-center p-2 cursor-pointer"
              style={{ minHeight: '44px', minWidth: '44px' }}
            >
              {goal.status === 'paused' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
          )}

          <button
            onClick={() => onDelete(goal.id)}
            title="Delete goal"
            className="btn-ghost flex items-center justify-center p-2 cursor-pointer hover:text-red-400 hover:border-red-400/30 hover:bg-red-500/5"
            style={{ minHeight: '44px', minWidth: '44px' }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
