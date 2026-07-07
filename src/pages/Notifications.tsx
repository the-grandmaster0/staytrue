import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Trash2, CheckCheck, Loader2,
  MessageSquare, Flame, Users, Swords, Clock, Info, ChevronRight,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useNotifications,
  useMarkNotifRead,
  useMarkAllNotifsRead,
  useDeleteNotif,
  useClearAllNotifs,
  type AppNotification,
} from '../hooks/useNotifications';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store/useAuthStore';
import { EmptyState } from '../components/EmptyState';
import type { NotificationPrefs } from '../hooks/useNotifications';

// ── Type → icon + colour ──────────────────────────────────────────────────────
function notifMeta(type: string): { icon: React.ReactNode; colour: string; label: string } {
  switch (type) {
    case 'message':
      return { icon: <MessageSquare className="h-4 w-4" />, colour: 'text-blue-400 bg-blue-500/10 border-blue-500/20', label: 'Message' };
    case 'checkin':
      return { icon: <Flame className="h-4 w-4" />, colour: 'text-orange-400 bg-orange-500/10 border-orange-500/20', label: 'Check-in' };
    case 'buddy_request':
      return { icon: <Users className="h-4 w-4" />, colour: 'text-purple-400 bg-purple-500/10 border-purple-500/20', label: 'Buddy' };
    case 'challenge':
      return { icon: <Swords className="h-4 w-4" />, colour: 'text-amber-400 bg-amber-500/10 border-amber-500/20', label: 'Challenge' };
    case 'daily_reminder':
      return { icon: <Clock className="h-4 w-4" />, colour: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', label: 'Reminder' };
    default:
      return { icon: <Info className="h-4 w-4" />, colour: 'text-slate-400 bg-slate-500/10 border-slate-500/20', label: 'General' };
  }
}

// ── Relative time ─────────────────────────────────────────────────────────────
function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── FILTER TABS ───────────────────────────────────────────────────────────────
const FILTER_TABS = [
  { key: 'all',          label: 'All'       },
  { key: 'message',      label: 'Messages'  },
  { key: 'checkin',      label: 'Check-ins' },
  { key: 'buddy_request',label: 'Buddies'   },
  { key: 'challenge',    label: 'Challenges'},
  { key: 'daily_reminder',label: 'Reminders'},
] as const;

type FilterKey = typeof FILTER_TABS[number]['key'];

// ── Notification row ──────────────────────────────────────────────────────────
interface NotifRowProps {
  notif: AppNotification;
  onRead:   (id: string) => void;
  onDelete: (id: string) => void;
}

const NotifRow: React.FC<NotifRowProps> = ({ notif, onRead, onDelete }) => {
  const navigate = useNavigate();
  const meta     = notifMeta(notif.type);

  const handleClick = () => {
    if (!notif.read) onRead(notif.id);
    if (notif.url && notif.url !== '/dashboard') navigate(notif.url);
  };

  return (
    <tr
      className={`border-b border-app-border last:border-0 transition-colors ${
        notif.read ? 'opacity-60' : 'bg-blue-950/10'
      } hover:bg-app-panel/60 cursor-pointer`}
      onClick={handleClick}
    >
      {/* Type icon */}
      <td className="px-4 py-3 w-10">
        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border text-xs ${meta.colour}`}>
          {meta.icon}
        </span>
      </td>

      {/* Type badge */}
      <td className="px-3 py-3 hidden sm:table-cell w-28">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border ${meta.colour}`}>
          {meta.label}
        </span>
      </td>

      {/* Title + body */}
      <td className="px-3 py-3 min-w-0">
        <div className="flex items-start gap-2 min-w-0">
          {!notif.read && (
            <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-400 shrink-0" aria-label="Unread" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold text-app-text-body truncate leading-tight">{notif.title}</p>
            <p className="text-xs text-app-text-secondary mt-0.5 line-clamp-2 leading-relaxed">{notif.body}</p>
          </div>
        </div>
      </td>

      {/* Time */}
      <td className="px-3 py-3 w-24 text-right shrink-0">
        <span className="text-[11px] font-mono text-app-text-dim whitespace-nowrap">
          {relativeTime(notif.created_at)}
        </span>
      </td>

      {/* Actions */}
      <td className="px-3 py-3 w-20 text-right shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          {!notif.read && (
            <button
              title="Mark read"
              onClick={(e) => { e.stopPropagation(); onRead(notif.id); }}
              className="p-1.5 rounded-md text-app-text-dim hover:text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer"
            >
              <CheckCheck className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            title="Delete"
            onClick={(e) => { e.stopPropagation(); onDelete(notif.id); }}
            className="p-1.5 rounded-md text-app-text-dim hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {notif.url && notif.url !== '/dashboard' && (
            <ChevronRight className="h-3.5 w-3.5 text-app-text-dim" />
          )}
        </div>
      </td>
    </tr>
  );
};

// ── Preference toggle row ─────────────────────────────────────────────────────
interface PrefRowProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

const PrefRow: React.FC<PrefRowProps> = ({ icon, label, description, checked, onChange }) => (
  <tr className="border-b border-app-border last:border-0">
    <td className="px-4 py-3 w-10">
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-app-bg border border-app-border text-app-text-secondary">
        {icon}
      </span>
    </td>
    <td className="px-3 py-3">
      <p className="text-sm font-bold text-app-text-body">{label}</p>
      <p className="text-xs text-app-text-secondary mt-0.5">{description}</p>
    </td>
    <td className="px-4 py-3 text-right">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer ${
          checked ? 'bg-blue-500' : 'bg-app-border'
        }`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`} />
      </button>
    </td>
  </tr>
);

// ── Main page ─────────────────────────────────────────────────────────────────
export const Notifications: React.FC = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const { data: notifications = [], isLoading } = useNotifications();
  const markRead       = useMarkNotifRead();
  const markAllRead    = useMarkAllNotifsRead();
  const deleteNotif    = useDeleteNotif();
  const clearAll       = useClearAllNotifs();

  // ── Notification preference state ─────────────────────────────────────────
  const defaultPrefs = { daily_reminder: true, buddy_checkin: true, messages: true, challenges: true };

  const { data: prefs } = useQuery<NotificationPrefs>({
    queryKey: ['notification-prefs', user?.id],
    queryFn: async () => {
      if (!user) return defaultPrefs;
      const { data } = await supabase
        .from('profiles')
        .select('notification_prefs')
        .eq('id', user.id)
        .single();
      return { ...defaultPrefs, ...(data?.notification_prefs ?? {}) };
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const [localPrefs, setLocalPrefs] = React.useState<NotificationPrefs | null>(null);
  const [prefsSaved, setPrefsSaved]  = React.useState(false);

  React.useEffect(() => {
    if (prefs && !localPrefs) setLocalPrefs({ ...defaultPrefs, ...prefs });
  }, [prefs]);

  const savePrefsMutation = useMutation({
    mutationFn: async (p: NotificationPrefs) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('profiles')
        .update({ notification_prefs: p })
        .eq('id', user.id);
      if (error) throw error;
      return p;
    },
    onSuccess: (p) => {
      queryClient.setQueryData(['notification-prefs', user?.id], p);
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 2500);
    },
  });

  const currentPrefs = localPrefs ?? defaultPrefs;
  const handlePrefChange = (key: keyof NotificationPrefs, v: boolean) =>
    setLocalPrefs({ ...currentPrefs, [key]: v });

  // ── Derived lists ─────────────────────────────────────────────────────────
  const filtered = activeFilter === 'all'
    ? notifications
    : notifications.filter((n) => n.type === activeFilter);

  const unreadTotal = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-3xl font-black text-app-text-body tracking-tight"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Notifications
          </h1>
          <p className="text-sm text-app-text-secondary mt-1">
            Your activity inbox — also delivered to your email
          </p>
        </div>
        {unreadTotal > 0 && (
          <span className="badge shrink-0 mt-1">{unreadTotal > 99 ? '99+' : unreadTotal} unread</span>
        )}
      </div>

      {/* ── Inbox ──────────────────────────────────────────────────────────── */}
      <div className="bg-app-panel/80 backdrop-blur-xl border border-app-border rounded-2xl overflow-hidden shadow-lg">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-app-border gap-2 flex-wrap">
          <h2 className="text-xs font-bold text-app-text-secondary uppercase tracking-wider">// INBOX</h2>
          <div className="flex items-center gap-2">
            {unreadTotal > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-app-border text-app-text-secondary hover:text-blue-400 hover:border-blue-500/30 transition-colors cursor-pointer disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={() => clearAll.mutate()}
                disabled={clearAll.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-app-border text-app-text-secondary hover:text-red-400 hover:border-red-500/30 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex overflow-x-auto border-b border-app-border px-2 gap-0.5 no-scrollbar">
          {FILTER_TABS.map((tab) => {
            const count = tab.key === 'all'
              ? notifications.length
              : notifications.filter((n) => n.type === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-mono font-bold whitespace-nowrap transition-colors cursor-pointer border-b-2 ${
                  activeFilter === tab.key
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-app-text-dim hover:text-app-text-secondary'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded text-[10px] font-bold ${
                    activeFilter === tab.key ? 'bg-blue-500/20 text-blue-400' : 'bg-app-border text-app-text-dim'
                  }`}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12">
            <EmptyState
              variant="no-notifications"
              title="No notifications"
              description={
                activeFilter === 'all'
                  ? "You're all caught up. Notifications appear here when buddies check in, send messages, or send challenges."
                  : `No ${activeFilter.replace('_', ' ')} notifications yet.`
              }
              compact
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-app-border text-left">
                  <th className="px-4 py-2 text-[10px] font-mono text-app-text-dim uppercase tracking-wider w-10"></th>
                  <th className="px-3 py-2 text-[10px] font-mono text-app-text-dim uppercase tracking-wider hidden sm:table-cell w-28">Type</th>
                  <th className="px-3 py-2 text-[10px] font-mono text-app-text-dim uppercase tracking-wider">Notification</th>
                  <th className="px-3 py-2 text-[10px] font-mono text-app-text-dim uppercase tracking-wider text-right w-24">When</th>
                  <th className="px-3 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((notif) => (
                  <NotifRow
                    key={notif.id}
                    notif={notif}
                    onRead={(id) => markRead.mutate(id)}
                    onDelete={(id) => deleteNotif.mutate(id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Email & notification preferences ───────────────────────────────── */}
      <div className="bg-app-panel/80 backdrop-blur-xl border border-app-border rounded-2xl overflow-hidden shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-app-border">
          <h2 className="text-xs font-bold text-app-text-secondary uppercase tracking-wider">// EMAIL PREFERENCES</h2>
          <p className="text-xs text-app-text-dim">Notifications are also sent to your account email</p>
        </div>

        <table className="w-full">
          <tbody>
            <PrefRow
              icon={<Clock className="h-4 w-4" />}
              label="Daily reminder"
              description="Email if you haven't checked in on any active goal today"
              checked={currentPrefs.daily_reminder}
              onChange={(v) => handlePrefChange('daily_reminder', v)}
            />
            <PrefRow
              icon={<Flame className="h-4 w-4" />}
              label="Buddy check-in alerts"
              description="Email when a buddy logs progress on a goal"
              checked={currentPrefs.buddy_checkin}
              onChange={(v) => handlePrefChange('buddy_checkin', v)}
            />
            <PrefRow
              icon={<MessageSquare className="h-4 w-4" />}
              label="Message alerts"
              description="Email when a buddy sends you a message"
              checked={currentPrefs.messages}
              onChange={(v) => handlePrefChange('messages', v)}
            />
            <PrefRow
              icon={<Users className="h-4 w-4" />}
              label="Buddy requests"
              description="Email when someone sends you a buddy request"
              checked={currentPrefs.buddy_checkin}
              onChange={(v) => handlePrefChange('buddy_checkin', v)}
            />
            <PrefRow
              icon={<Swords className="h-4 w-4" />}
              label="Challenge alerts"
              description="Email for challenge events — received, accepted, or completed"
              checked={currentPrefs.challenges ?? true}
              onChange={(v) => handlePrefChange('challenges', v)}
            />
          </tbody>
        </table>

        <div className="px-4 py-3 border-t border-app-border flex items-center justify-between">
          {prefsSaved
            ? <span className="text-xs text-green-400 font-bold">✓ Preferences saved</span>
            : savePrefsMutation.isError
            ? <span className="text-xs text-red-400">Failed — please try again</span>
            : <span className="text-xs text-app-text-dim">Changes apply to both in-app and email notifications</span>}
          <button
            onClick={() => savePrefsMutation.mutate(currentPrefs)}
            disabled={savePrefsMutation.isPending}
            className="btn-primary flex items-center gap-2 px-4 py-2 text-xs cursor-pointer disabled:opacity-50"
          >
            {savePrefsMutation.isPending
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...</>
              : 'Save preferences'}
          </button>
        </div>
      </div>

      {/* ── How it works ────────────────────────────────────────────────────── */}
      <div className="bg-app-panel/80 backdrop-blur-xl border border-app-border rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-blue-400 shrink-0" />
          <h2 className="text-sm font-bold text-app-text-body">How notifications work</h2>
        </div>
        <div className="space-y-2 text-sm text-app-text-secondary leading-relaxed">
          <p>Every notification is stored here in your inbox so you never miss anything.</p>
          <p>
            An email is also sent to your account address for each event — unless you turn off
            the relevant preference above.
          </p>
          <p>
            The daily reminder fires once a day if you haven't checked in on any active goal.
            It skips if you have already checked in.
          </p>
        </div>
      </div>
    </div>
  );
};
