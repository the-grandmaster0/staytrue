export interface Badge {
  badge_key: string;
  earned_at: string;
}

export interface BadgeMeta {
  key: string;
  label: string;
  description: string;
  emoji: string;
  color: string; // tailwind bg class
}

export const BADGE_META: BadgeMeta[] = [
  {
    key: 'first_goal',
    label: 'First Goal',
    description: 'Created your first goal',
    emoji: '🎯',
    color: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  },
  {
    key: 'goal_crusher',
    label: 'Goal Crusher',
    description: 'Completed your first goal',
    emoji: '💥',
    color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  },
  {
    key: 'buddy_up',
    label: 'Buddy Up',
    description: 'Linked your first accountability buddy',
    emoji: '🤝',
    color: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
  },
  {
    key: 'social_butterfly',
    label: 'Social Butterfly',
    description: 'Connected with 3 or more buddies',
    emoji: '🦋',
    color: 'bg-pink-500/10 border-pink-500/20 text-pink-400',
  },
  {
    key: 'streak_7',
    label: '7-Day Streak',
    description: 'Checked in for 7 consecutive days',
    emoji: '🔥',
    color: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
  },
  {
    key: 'marathoner',
    label: 'Marathoner',
    description: 'Maintained a 30-day check-in streak',
    emoji: '🏅',
    color: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  },
];

export function getBadgeMeta(key: string): BadgeMeta {
  return (
    BADGE_META.find((b) => b.key === key) ?? {
      key,
      label: key,
      description: '',
      emoji: '⭐',
      color: 'bg-app-accent-bg border-app-border text-app-text-primary',
    }
  );
}
