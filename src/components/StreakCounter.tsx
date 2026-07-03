import React, { useEffect, useRef, useState } from 'react';
import { Flame } from 'lucide-react';
import { useStreak } from '../hooks/useCheckins';

interface StreakCounterProps {
  goalId: string;
  frequency: 'daily' | 'three_per_week' | 'weekly';
  animateTrigger?: number;
  compact?: boolean;
}

const streakUnit = (f: StreakCounterProps['frequency']) =>
  f === 'daily' ? 'days' : 'weeks';

export const StreakCounter: React.FC<StreakCounterProps> = ({
  goalId, frequency, animateTrigger = 0, compact = true,
}) => {
  const { data: streak, isLoading } = useStreak(goalId);
  const [displayValue, setDisplayValue] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevStreakRef = useRef<number | null>(null);
  const prevTriggerRef = useRef(animateTrigger);

  useEffect(() => {
    if (streak == null) return;
    const target = streak.current_streak;
    const prev = prevStreakRef.current;
    const shouldAnimate = animateTrigger > prevTriggerRef.current && prev !== null && target > prev;
    prevTriggerRef.current = animateTrigger;

    if (shouldAnimate) {
      setIsAnimating(true);
      const start = prev ?? 0;
      const startTime = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - startTime) / 600, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplayValue(Math.round(start + (target - start) * eased));
        if (p < 1) requestAnimationFrame(tick);
        else { setDisplayValue(target); setTimeout(() => setIsAnimating(false), 400); }
      };
      requestAnimationFrame(tick);
    } else {
      setDisplayValue(target);
    }
    prevStreakRef.current = target;
  }, [streak, animateTrigger]);

  const unit = streakUnit(frequency);

  if (isLoading) {
    return (
      <span className="flex items-center gap-1.5 text-app-text-secondary text-xs">
        <Flame className="h-3.5 w-3.5" />
        <span>–</span>
      </span>
    );
  }

  if (compact) {
    return (
      <span className="flex items-center gap-1.5">
        <Flame className={`h-3.5 w-3.5 text-orange-400 ${isAnimating ? 'animate-streak-flame' : ''}`} />
        <span className={`text-xs font-semibold ${isAnimating ? 'animate-streak-pop text-app-text-primary' : 'text-app-text-secondary'}`}>
          {displayValue} {unit}
        </span>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border border-orange-500/20 bg-orange-500/5 ${isAnimating ? 'animate-streak-pop' : ''}`}>
        <Flame className={`h-5 w-5 text-orange-400 ${isAnimating ? 'animate-streak-flame' : ''}`} />
        <div>
          <p className="text-xs text-app-text-secondary font-medium">Current streak</p>
          <p className="text-2xl font-bold text-orange-400 leading-tight tabular-nums">
            {displayValue}
            <span className="text-sm font-medium ml-1">{unit}</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-app-border bg-app-panel">
        <div>
          <p className="text-xs text-app-text-secondary font-medium">Best streak</p>
          <p className="text-2xl font-bold text-app-text-primary leading-tight tabular-nums">
            {streak?.longest_streak ?? 0}
            <span className="text-sm font-medium ml-1">{unit}</span>
          </p>
        </div>
      </div>
    </div>
  );
};
