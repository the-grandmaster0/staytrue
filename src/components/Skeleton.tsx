import React from 'react';

// ── Base shimmer block ────────────────────────────────────────────────────────
interface SkeletonBlockProps {
  className?: string;
}
export const SkeletonBlock: React.FC<SkeletonBlockProps> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-lg bg-app-border/60 ${className}`} />
);

// ── Goal card skeleton ────────────────────────────────────────────────────────
export const SkeletonGoalCard: React.FC = () => (
  <div className="bg-app-panel border border-app-border rounded-xl p-4 animate-pulse">
    <div className="flex items-start gap-3">
      {/* Category icon */}
      <div className="h-10 w-10 rounded-xl bg-app-border/60 shrink-0" />

      <div className="flex-1 min-w-0 space-y-2.5">
        {/* Title */}
        <div className="h-4 bg-app-border/60 rounded-md w-3/5" />
        {/* Description line */}
        <div className="h-3 bg-app-border/40 rounded-md w-4/5" />

        {/* Chips row */}
        <div className="flex items-center gap-2 pt-1">
          <div className="h-5 w-16 bg-app-border/50 rounded-full" />
          <div className="h-5 w-12 bg-app-border/50 rounded-full" />
          <div className="h-5 w-20 bg-app-border/40 rounded-full" />
        </div>
      </div>

      {/* Action buttons placeholder */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="h-8 w-8 bg-app-border/40 rounded-lg" />
        <div className="h-8 w-8 bg-app-border/40 rounded-lg" />
        <div className="h-8 w-8 bg-app-border/40 rounded-lg" />
      </div>
    </div>
  </div>
);

// ── Message conversation row skeleton ────────────────────────────────────────
export const SkeletonMessageRow: React.FC = () => (
  <div className="flex items-center gap-4 px-5 py-4 animate-pulse">
    {/* Unread dot */}
    <div className="w-2.5 shrink-0" />
    {/* Avatar */}
    <div className="h-10 w-10 rounded-full bg-app-border/60 shrink-0" />
    {/* Content */}
    <div className="flex-1 min-w-0 space-y-2">
      <div className="h-3.5 bg-app-border/60 rounded-md w-1/2" />
      <div className="h-3 bg-app-border/40 rounded-md w-3/4" />
    </div>
    {/* Time */}
    <div className="shrink-0 h-3 w-10 bg-app-border/40 rounded-md" />
  </div>
);

// ── Profile card skeleton ─────────────────────────────────────────────────────
export const SkeletonProfileCard: React.FC = () => (
  <div className="bg-app-panel border border-app-border rounded-xl p-6 flex flex-col items-center text-center gap-4 animate-pulse">
    {/* Avatar */}
    <div className="h-20 w-20 rounded-full bg-app-border/60" />
    {/* Name */}
    <div className="h-4 bg-app-border/60 rounded-md w-32" />
    {/* Email */}
    <div className="h-3 bg-app-border/40 rounded-md w-44" />
    {/* Info rows */}
    <div className="w-full pt-4 border-t border-app-border space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-2.5">
          <div className="h-3.5 w-3.5 rounded bg-app-border/40 shrink-0" />
          <div className="h-3 bg-app-border/40 rounded-md flex-1" />
        </div>
      ))}
    </div>
  </div>
);

// ── Notification row skeleton ─────────────────────────────────────────────────
export const SkeletonNotificationRow: React.FC = () => (
  <div className="flex items-center gap-4 p-4 animate-pulse">
    <div className="h-10 w-10 rounded-xl bg-app-border/60 shrink-0" />
    <div className="flex-1 space-y-2">
      <div className="h-3.5 bg-app-border/60 rounded-md w-3/5" />
      <div className="h-3 bg-app-border/40 rounded-md w-4/5" />
    </div>
    <div className="h-5 w-11 rounded-full bg-app-border/50 shrink-0" />
  </div>
);

// ── Buddy card skeleton ───────────────────────────────────────────────────────
export const SkeletonBuddyCard: React.FC = () => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-app-panel border border-app-border rounded-xl p-4 animate-pulse">
    {/* Avatar + info */}
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <div className="h-10 w-10 rounded-full bg-app-border/60 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3.5 bg-app-border/60 rounded-md w-2/5" />
        <div className="h-3 bg-app-border/40 rounded-md w-3/5" />
      </div>
    </div>
    {/* Stats */}
    <div className="flex items-center gap-3 shrink-0">
      <div className="h-5 w-16 bg-app-border/50 rounded-full" />
      <div className="h-5 w-20 bg-app-border/40 rounded-full" />
    </div>
    {/* Remove button placeholder */}
    <div className="h-9 w-24 bg-app-border/40 rounded-lg shrink-0" />
  </div>
);

// ── Buddy search result skeleton ──────────────────────────────────────────────
export const SkeletonBuddySearchResult: React.FC = () => (
  <div className="flex items-center justify-between gap-3 px-4 py-3 animate-pulse">
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="h-8 w-8 rounded-full bg-app-border/60 shrink-0" />
      <div className="space-y-1.5">
        <div className="h-3 bg-app-border/60 rounded-md w-28" />
        <div className="h-2.5 bg-app-border/40 rounded-md w-36" />
      </div>
    </div>
    <div className="h-9 w-16 bg-app-border/50 rounded-lg shrink-0" />
  </div>
);
