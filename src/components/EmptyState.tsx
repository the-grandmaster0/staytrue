import React from 'react';

// ── Shared illustration style ─────────────────────────────────────────────────
const illustrationColors = {
  accent: '#6366f1',
  accentLight: '#a5b4fc',
  accentBg: 'rgba(99,102,241,0.12)',
  muted: '#2a2f45',
  mutedMid: '#3f4861',
  white: '#e2e8f0',
};
const c = illustrationColors;

// ── SVG Illustrations ─────────────────────────────────────────────────────────

const NoGoalsIllustration: React.FC = () => (
  <svg width="140" height="120" viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Target circles */}
    <circle cx="70" cy="62" r="48" fill={c.accentBg} stroke={c.muted} strokeWidth="2" />
    <circle cx="70" cy="62" r="34" fill="none" stroke={c.muted} strokeWidth="2" />
    <circle cx="70" cy="62" r="20" fill="none" stroke={c.muted} strokeWidth="2" />
    <circle cx="70" cy="62" r="7" fill={c.accent} opacity="0.4" />
    {/* Arrow missing the target */}
    <line x1="108" y1="24" x2="82" y2="50" stroke={c.accentLight} strokeWidth="2.5" strokeLinecap="round" />
    <polygon points="108,16 116,32 100,28" fill={c.accentLight} />
    {/* Sparkles */}
    <circle cx="28" cy="28" r="3" fill={c.accentLight} opacity="0.6" />
    <circle cx="118" cy="88" r="2.5" fill={c.accentLight} opacity="0.4" />
    <circle cx="18" cy="82" r="2" fill={c.accent} opacity="0.5" />
    {/* Small star top-right */}
    <path d="M122 18l1.5 4 4 0-3.2 2.4 1.2 4-3.5-2.3-3.5 2.3 1.2-4L116.5 22l4 0z" fill={c.accentLight} opacity="0.7" />
    {/* Dashed ring hint */}
    <circle cx="70" cy="62" r="55" stroke={c.muted} strokeWidth="1" strokeDasharray="4 5" opacity="0.5" />
  </svg>
);

const NoBuddiesIllustration: React.FC = () => (
  <svg width="140" height="120" viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Left person */}
    <circle cx="40" cy="42" r="14" fill={c.accentBg} stroke={c.muted} strokeWidth="2" />
    <circle cx="40" cy="40" r="8" fill={c.mutedMid} />
    <path d="M20 80 Q20 62 40 62 Q60 62 60 80" fill={c.accentBg} stroke={c.muted} strokeWidth="2" />
    {/* Right person */}
    <circle cx="100" cy="42" r="14" fill={c.accentBg} stroke={c.muted} strokeWidth="2" />
    <circle cx="100" cy="40" r="8" fill={c.mutedMid} />
    <path d="M80 80 Q80 62 100 62 Q120 62 120 80" fill={c.accentBg} stroke={c.muted} strokeWidth="2" />
    {/* Dashed connection line with "+" in middle */}
    <line x1="60" y1="50" x2="80" y2="50" stroke={c.accentLight} strokeWidth="2" strokeDasharray="4 3" />
    <circle cx="70" cy="50" r="10" fill={c.accentBg} stroke={c.accent} strokeWidth="1.5" />
    <line x1="66" y1="50" x2="74" y2="50" stroke={c.accentLight} strokeWidth="2" strokeLinecap="round" />
    <line x1="70" y1="46" x2="70" y2="54" stroke={c.accentLight} strokeWidth="2" strokeLinecap="round" />
    {/* Sparkles */}
    <circle cx="70" cy="100" r="2.5" fill={c.accent} opacity="0.4" />
    <circle cx="25" cy="95" r="2" fill={c.accentLight} opacity="0.5" />
    <circle cx="115" cy="95" r="2" fill={c.accentLight} opacity="0.5" />
    <path d="M68 14l1 3 3 0-2.4 1.8.9 3L68 20l-2.5 1.8.9-3L64 17l3 0z" fill={c.accentLight} opacity="0.7" />
  </svg>
);

const NoMessagesIllustration: React.FC = () => (
  <svg width="140" height="120" viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Main bubble */}
    <rect x="18" y="22" width="88" height="56" rx="16" fill={c.accentBg} stroke={c.muted} strokeWidth="2" />
    <path d="M38 78 L28 96 L52 82" fill={c.accentBg} stroke={c.muted} strokeWidth="2" strokeLinejoin="round" />
    {/* Ellipsis dots */}
    <circle cx="44" cy="50" r="5" fill={c.muted} />
    <circle cx="62" cy="50" r="5" fill={c.muted} />
    <circle cx="80" cy="50" r="5" fill={c.muted} />
    {/* Secondary small bubble */}
    <rect x="82" y="58" width="48" height="34" rx="10" fill={c.accentBg} stroke={c.accent} strokeWidth="1.5" opacity="0.7" />
    <path d="M104 92 L112 104 L96 96" fill={c.accentBg} stroke={c.accent} strokeWidth="1.5" strokeLinejoin="round" opacity="0.7" />
    {/* Sparkles */}
    <circle cx="120" cy="26" r="2.5" fill={c.accentLight} opacity="0.6" />
    <circle cx="14" cy="100" r="2" fill={c.accent} opacity="0.4" />
    <path d="M130 50l1.2 3.2 3.2 0-2.6 1.9 1 3.1-2.8-1.9-2.8 1.9 1-3.1-2.6-1.9 3.2 0z" fill={c.accentLight} opacity="0.6" />
  </svg>
);

const NoNotificationsIllustration: React.FC = () => (
  <svg width="140" height="120" viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Bell body */}
    <path d="M70 20 C70 20 45 35 45 65 L45 80 L95 80 L95 65 C95 35 70 20 70 20Z" fill={c.accentBg} stroke={c.muted} strokeWidth="2" />
    {/* Bell clapper */}
    <rect x="60" y="78" width="20" height="10" rx="5" fill={c.muted} />
    <circle cx="70" cy="92" r="8" fill={c.muted} />
    {/* Bell top knob */}
    <circle cx="70" cy="20" r="5" fill={c.mutedMid} stroke={c.muted} strokeWidth="1.5" />
    {/* Zzz letters — quiet bell */}
    <text x="100" y="44" fontFamily="system-ui" fontSize="11" fontWeight="700" fill={c.accentLight} opacity="0.7">z</text>
    <text x="108" y="34" fontFamily="system-ui" fontSize="13" fontWeight="700" fill={c.accentLight} opacity="0.85">z</text>
    <text x="118" y="22" fontFamily="system-ui" fontSize="15" fontWeight="700" fill={c.accentLight}>z</text>
    {/* Calm lines */}
    <line x1="30" y1="60" x2="38" y2="60" stroke={c.muted} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    <line x1="102" y1="60" x2="110" y2="60" stroke={c.muted} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    {/* Stars */}
    <circle cx="20" cy="30" r="2" fill={c.accentLight} opacity="0.4" />
    <circle cx="26" cy="90" r="2.5" fill={c.accent} opacity="0.3" />
  </svg>
);

// ── EmptyState component ──────────────────────────────────────────────────────

type EmptyStateVariant = 'no-goals' | 'no-buddies' | 'no-messages' | 'no-notifications';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}

interface EmptyStateProps {
  variant: EmptyStateVariant;
  title?: string;
  description?: string;
  action?: EmptyStateAction;
  compact?: boolean;
}

const VARIANTS: Record<EmptyStateVariant, { illustration: React.FC; title: string; description: string }> = {
  'no-goals': {
    illustration: NoGoalsIllustration,
    title: 'No goals yet',
    description: 'Create your first goal to start tracking your progress and building accountability.',
  },
  'no-buddies': {
    illustration: NoBuddiesIllustration,
    title: 'No buddies yet',
    description: 'Find an accountability buddy to keep each other on track and celebrate wins together.',
  },
  'no-messages': {
    illustration: NoMessagesIllustration,
    title: 'No conversations yet',
    description: 'Add a buddy to one of your goals, then open the goal\'s Messages tab to start chatting.',
  },
  'no-notifications': {
    illustration: NoNotificationsIllustration,
    title: 'All quiet here',
    description: 'No new notifications. Enable push alerts to stay in the loop on check-ins and messages.',
  },
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  variant,
  title,
  description,
  action,
  compact = false,
}) => {
  const meta = VARIANTS[variant];
  const Illustration = meta.illustration;

  return (
    <div
      className={`bg-app-panel border border-app-border border-dashed rounded-2xl text-center animate-fade-in flex flex-col items-center ${
        compact ? 'p-8 gap-3' : 'p-12 gap-4'
      }`}
    >
      {/* Illustration */}
      <div className="flex items-center justify-center opacity-90">
        <Illustration />
      </div>

      {/* Text */}
      <div className="space-y-1.5 max-w-xs">
        <h3 className="text-base font-semibold text-app-text-body">
          {title ?? meta.title}
        </h3>
        <p className="text-sm text-app-text-secondary leading-relaxed">
          {description ?? meta.description}
        </p>
      </div>

      {/* Action */}
      {action && (
        <button
          onClick={action.onClick}
          className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm cursor-pointer mt-1"
          style={{ minHeight: '44px' }}
        >
          {action.icon}
          {action.label}
        </button>
      )}
    </div>
  );
};
