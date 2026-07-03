import React, { useMemo } from 'react';
import type { Checkin } from '../hooks/useCheckins';

interface ContributionHeatmapProps {
  checkins: Checkin[];
  isLoading?: boolean;
}

interface HeatmapCell {
  date: string;
  count: number;
  weekIndex: number;
  dayIndex: number;
}

const CELL = 12;
const GAP = 3;
const WEEKS = 12;

const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function toDateKey(iso: string): string {
  return iso.split('T')[0];
}

function buildCells(checkins: Checkin[]): HeatmapCell[] {
  const counts = new Map<string, number>();
  for (const c of checkins) {
    const key = toDateKey(c.checked_in_at);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endSunday = new Date(today);
  endSunday.setDate(endSunday.getDate() + (6 - endSunday.getDay()));

  const startSunday = new Date(endSunday);
  startSunday.setDate(startSunday.getDate() - (WEEKS * 7 - 1));

  const cells: HeatmapCell[] = [];
  const cursor = new Date(startSunday);

  while (cursor <= endSunday) {
    const dateStr = cursor.toISOString().split('T')[0];
    const daysFromStart = Math.floor(
      (cursor.getTime() - startSunday.getTime()) / (1000 * 60 * 60 * 24)
    );
    cells.push({
      date: dateStr,
      count: counts.get(dateStr) || 0,
      weekIndex: Math.floor(daysFromStart / 7),
      dayIndex: cursor.getDay(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return cells;
}

function intensityColor(count: number, isFuture: boolean): string {
  if (isFuture) return 'var(--heatmap-empty)';
  if (count === 0) return 'var(--heatmap-empty)';
  if (count === 1) return 'var(--heatmap-l1)';
  if (count === 2) return 'var(--heatmap-l2)';
  return 'var(--heatmap-l3)';
}

export const ContributionHeatmap: React.FC<ContributionHeatmapProps> = ({
  checkins,
  isLoading,
}) => {
  const cells = useMemo(() => buildCells(checkins), [checkins]);
  const todayKey = new Date().toISOString().split('T')[0];

  const svgWidth = WEEKS * (CELL + GAP) + 40;
  const svgHeight = 7 * (CELL + GAP) + 24;

  if (isLoading) {
    return (
      <div className="border border-app-border bg-app-panel p-6 animate-pulse">
        <div className="h-4 w-48 bg-app-border mb-4" />
        <div className="h-24 w-full bg-app-border/50" />
      </div>
    );
  }

  const totalCheckins = checkins.length;

  return (
    <div className="border border-app-border bg-app-panel p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-app-text-primary">
            ACTIVITY_HEATMAP
          </h3>
          <p className="text-[10px] text-app-text-secondary uppercase tracking-wider mt-1">
            LAST_12_WEEKS // {totalCheckins} CHECK-INS LOGGED
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] text-app-text-secondary uppercase">
          <span>LESS</span>
          {[0, 1, 2, 3].map((level) => (
            <svg key={level} width={CELL} height={CELL} className="shrink-0">
              <rect
                width={CELL}
                height={CELL}
                fill={intensityColor(level, false)}
                rx={2}
              />
            </svg>
          ))}
          <span>MORE</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg
          width={svgWidth}
          height={svgHeight}
          role="img"
          aria-label="Check-in activity heatmap for the last 12 weeks"
          className="min-w-fit"
        >
          {DAY_LABELS.map((label, i) => (
            <text
              key={label}
              x={0}
              y={i * (CELL + GAP) + CELL - 1}
              className="fill-app-text-secondary"
              style={{ fontSize: '7px', fontFamily: 'var(--font-mono)' }}
            >
              {i % 2 === 1 ? label : ''}
            </text>
          ))}

          {cells.map((cell) => {
            const x = 36 + cell.weekIndex * (CELL + GAP);
            const y = cell.dayIndex * (CELL + GAP);
            const isFuture = cell.date > todayKey;
            const title = isFuture
              ? `${cell.date}: future`
              : cell.count === 0
              ? `${cell.date}: no check-ins`
              : `${cell.date}: ${cell.count} check-in${cell.count > 1 ? 's' : ''}`;

            return (
              <rect
                key={cell.date}
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                rx={2}
                fill={intensityColor(cell.count, isFuture)}
                opacity={isFuture ? 0.3 : 1}
                className="transition-opacity hover:opacity-80"
              >
                <title>{title}</title>
              </rect>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
