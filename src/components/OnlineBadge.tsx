import React from 'react';
import { useIsOnline } from '../hooks/usePresence';

type BadgeSize = 'xs' | 'sm' | 'md';

interface OnlineBadgeProps {
  /** The user ID to check presence for */
  userId: string | null | undefined;
  /**
   * 'dot'    — small coloured dot only (default, for avatar corners)
   * 'pill'   — dot + text label e.g. "Online" / "3m ago"
   * 'icon'   — dot + text, smaller, for inline use
   */
  variant?: 'dot' | 'pill' | 'icon';
  size?: BadgeSize;
  className?: string;
}

const sizeMap: Record<BadgeSize, string> = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
};

/**
 * Reusable presence indicator. Shows a green dot when online,
 * grey when offline, with optional text label.
 */
export const OnlineBadge: React.FC<OnlineBadgeProps> = ({
  userId,
  variant = 'dot',
  size = 'sm',
  className = '',
}) => {
  const { isOnline, label } = useIsOnline(userId);

  if (!userId) return null;

  const dotClass = `
    rounded-full shrink-0 transition-colors duration-300
    ${sizeMap[size]}
    ${isOnline
      ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
      : 'bg-app-text-dim'
    }
  `;

  if (variant === 'dot') {
    return (
      <span
        className={`${dotClass} ${className}`}
        aria-label={isOnline ? 'Online' : label}
        title={label}
        role="img"
      />
    );
  }

  if (variant === 'pill') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 ${className}`}
        aria-label={label}
      >
        <span className={dotClass} aria-hidden="true" />
        <span
          className={`text-[10px] font-mono uppercase tracking-wider ${
            isOnline ? 'text-emerald-400' : 'text-app-text-dim'
          }`}
        >
          {label}
        </span>
      </span>
    );
  }

  // variant === 'icon'
  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      aria-label={label}
    >
      <span className={`${dotClass} h-1.5 w-1.5`} aria-hidden="true" />
      <span
        className={`text-[9px] font-mono uppercase tracking-wider leading-none ${
          isOnline ? 'text-emerald-400' : 'text-app-text-dim'
        }`}
      >
        {label}
      </span>
    </span>
  );
};

/**
 * Wraps a child element and positions a dot indicator at the bottom-right.
 * Use this around avatar images/placeholders.
 *
 * @example
 * <AvatarWithPresence userId={buddy.id}>
 *   <img src={buddy.avatar_url} ... />
 * </AvatarWithPresence>
 */
interface AvatarWithPresenceProps {
  userId: string | null | undefined;
  children: React.ReactNode;
  size?: BadgeSize;
  className?: string;
}

export const AvatarWithPresence: React.FC<AvatarWithPresenceProps> = ({
  userId,
  children,
  size = 'sm',
  className = '',
}) => {
  const { isOnline } = useIsOnline(userId);

  const dotPositionClass = size === 'xs'
    ? 'bottom-0 right-0'
    : size === 'sm'
    ? 'bottom-0 right-0'
    : '-bottom-0.5 -right-0.5';

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      {children}
      {userId && (
        <span
          className={`
            absolute ${dotPositionClass} rounded-full border border-app-panel
            ${sizeMap[size]}
            ${isOnline
              ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]'
              : 'bg-app-text-dim'
            }
          `}
          aria-label={isOnline ? 'Online' : 'Offline'}
          role="img"
        />
      )}
    </div>
  );
};
