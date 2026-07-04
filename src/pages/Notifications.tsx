import React, { useState } from 'react';
import {
  Bell, BellOff, BellRing, Check, Loader2,
  ShieldAlert, Flame, MessageSquare, Clock, Users, Swords,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePushNotifications } from '../hooks/usePushNotifications';
import type { NotificationPrefs } from '../hooks/usePushNotifications';
import { EmptyState } from '../components/EmptyState';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store/useAuthStore';

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago',
  'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Kolkata',
  'Asia/Singapore', 'Australia/Sydney',
];

// ── Toggle row ────────────────────────────────────────────────────────────────
interface PrefRowProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}

const PrefRow: React.FC<PrefRowProps> = ({ icon, label, description, checked, onChange, disabled }) => (
  <div className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
    checked
      ? 'border-indigo-500/40 bg-indigo-500/8'
      : 'border-app-border bg-app-bg'
  } ${disabled ? 'opacity-50' : ''}`}>
    <div className={`p-3 rounded-xl border shrink-0 ${
      checked ? 'bg-indigo-500/15 border-indigo-500/30' : 'bg-app-panel border-app-border'
    }`}>
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-app-text-body">{label}</p>
      <p className="text-xs text-app-text-secondary mt-0.5 leading-relaxed">{description}</p>
    </div>
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/30 cursor-pointer disabled:cursor-not-allowed ${
        checked
          ? 'bg-gradient-to-r from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/30'
          : 'bg-app-border'
      }`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  </div>
);

// ── Main page ─────────────────────────────────────────────────────────────────
export const Notifications: React.FC = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const {
    isSupported, permission, isSubscribed, prefs, prefsLoading,
    subscribe, unsubscribe, savePrefs, savePrefsLoading, savePrefsError,
  } = usePushNotifications();

  const [subscribing, setSubscribing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [localPrefs, setLocalPrefs] = React.useState<NotificationPrefs | null>(null);
  const [reminderTime, setReminderTime] = useState('08:00');
  const [timezone, setTimezone] = useState('UTC');
  const [reminderSaved, setReminderSaved] = useState(false);

  // Sync local state when DB prefs load
  React.useEffect(() => {
    if (prefs && !localPrefs) {
      setLocalPrefs({
        daily_reminder: (prefs as NotificationPrefs).daily_reminder ?? true,
        buddy_checkin:  (prefs as NotificationPrefs).buddy_checkin  ?? true,
        messages:       (prefs as NotificationPrefs).messages       ?? true,
        challenges:     (prefs as NotificationPrefs).challenges     ?? true,
      });
    }
  }, [prefs, localPrefs]);

  // Load reminder_time and timezone from profile
  const { data: profile } = useQuery({
    queryKey: ['profile-reminder', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('profiles')
        .select('reminder_time, timezone')
        .eq('id', user.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  React.useEffect(() => {
    if (profile) {
      if (profile.reminder_time) setReminderTime(profile.reminder_time.slice(0, 5));
      if (profile.timezone) setTimezone(profile.timezone);
    }
  }, [profile]);

  // Save reminder time mutation
  const saveReminderMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('profiles')
        .update({ reminder_time: reminderTime, timezone })
        .eq('id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-reminder', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      setReminderSaved(true);
      setTimeout(() => setReminderSaved(false), 3000);
    },
  });

  const currentPrefs: NotificationPrefs = localPrefs ?? {
    daily_reminder: true, buddy_checkin: true, messages: true, challenges: true,
  };

  const handlePrefChange = (key: keyof NotificationPrefs, val: boolean) =>
    setLocalPrefs({ ...currentPrefs, [key]: val });

  const handleSave = () => {
    savePrefs(currentPrefs, {
      onSuccess: () => {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      },
    });
  };

  const handleSubscribeToggle = async () => {
    setSubscribing(true);
    if (isSubscribed) await unsubscribe();
    else await subscribe();
    setSubscribing(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-app-text-body tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          Notifications
        </h1>
        <p className="text-sm text-app-text-secondary mt-1">
          Control which alerts you receive and when
        </p>
      </div>

      {/* Browser push permission card */}
      <div className="bg-app-panel/80 backdrop-blur-xl border border-app-border rounded-2xl p-5 shadow-lg">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-2xl border shrink-0 ${
            isSubscribed
              ? 'bg-green-500/10 border-green-500/20'
              : 'bg-indigo-500/10 border-indigo-500/20'
          }`}>
            {isSubscribed
              ? <BellRing className="h-6 w-6 text-green-400" />
              : <BellOff className="h-6 w-6 text-indigo-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-app-text-body">
              {isSubscribed ? 'Push notifications active' : 'Enable push notifications'}
            </p>
            <p className="text-xs text-app-text-secondary mt-1 leading-relaxed">
              {!isSupported
                ? 'Your browser does not support push notifications.'
                : permission === 'denied'
                ? 'Notifications are blocked. Reset them in your browser settings.'
                : isSubscribed
                ? "You'll receive alerts even when the app is closed."
                : 'Get notified about check-ins, messages, and daily reminders.'}
            </p>
          </div>
          {isSupported && permission !== 'denied' && (
            <button
              onClick={handleSubscribeToggle}
              disabled={subscribing}
              className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer disabled:opacity-50 ${
                isSubscribed
                  ? 'border border-red-400/30 text-red-400 hover:bg-red-500/10'
                  : 'btn-primary'
              }`}
            >
              {subscribing
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : isSubscribed
                ? <><BellOff className="h-4 w-4" /> Disable</>
                : <><Bell className="h-4 w-4" /> Enable</>}
            </button>
          )}
        </div>
        {!isSupported && (
          <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-sm text-amber-400">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            Push notifications require a modern browser (Chrome, Firefox, Edge, or Safari 16.4+).
          </div>
        )}
      </div>

      {/* Daily reminder time picker */}
      <div className="bg-app-panel/80 backdrop-blur-xl border border-app-border rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
            <Clock className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-app-text-body">Daily reminder time</h2>
            <p className="text-xs text-app-text-secondary mt-0.5">
              Pick when you want your daily check-in nudge
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-app-text-secondary mb-2 uppercase tracking-wider">
              Reminder time
            </label>
            <input
              type="time"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              disabled={!isSubscribed}
              className="input-field w-full px-4 py-2.5 text-sm disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-app-text-secondary mb-2 uppercase tracking-wider">
              Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={!isSubscribed}
              className="input-field w-full px-4 py-2.5 text-sm disabled:opacity-50"
            >
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          {reminderSaved
            ? <span className="flex items-center gap-1.5 text-sm text-green-400 font-semibold"><Check className="h-4 w-4" /> Saved!</span>
            : saveReminderMutation.isError
            ? <span className="text-sm text-red-400">Failed — try again</span>
            : <span className="text-xs text-app-text-dim">Runs daily at your chosen time in your timezone</span>}
          <button
            onClick={() => saveReminderMutation.mutate()}
            disabled={saveReminderMutation.isPending || !isSubscribed}
            className="btn-primary flex items-center gap-2 px-4 py-2 text-sm cursor-pointer disabled:opacity-50"
          >
            {saveReminderMutation.isPending
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...</>
              : 'Save time'}
          </button>
        </div>
      </div>

      {/* Alert preferences */}
      <div className="bg-app-panel/80 backdrop-blur-xl border border-app-border rounded-2xl p-5 shadow-lg space-y-4">
        <div>
          <h2 className="text-sm font-bold text-app-text-body">Alert preferences</h2>
          <p className="text-xs text-app-text-secondary mt-0.5">Choose which notifications you want to receive</p>
        </div>

        {prefsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
          </div>
        ) : (
          <div className="space-y-3">
            <PrefRow
              icon={<Clock className="h-4 w-4 text-indigo-400" />}
              label="Daily reminder"
              description="Get a nudge at your chosen time if you haven't checked in on any active goal today."
              checked={currentPrefs.daily_reminder}
              onChange={(v) => handlePrefChange('daily_reminder', v)}
              disabled={!isSubscribed}
            />
            <PrefRow
              icon={<Flame className="h-4 w-4 text-orange-400" />}
              label="Buddy check-in alerts"
              description="Get notified when an accountability buddy logs progress on a shared goal."
              checked={currentPrefs.buddy_checkin}
              onChange={(v) => handlePrefChange('buddy_checkin', v)}
              disabled={!isSubscribed}
            />
            <PrefRow
              icon={<MessageSquare className="h-4 w-4 text-indigo-400" />}
              label="Message alerts"
              description="Get notified when a buddy sends you a message or reaction."
              checked={currentPrefs.messages}
              onChange={(v) => handlePrefChange('messages', v)}
              disabled={!isSubscribed}
            />
            <PrefRow
              icon={<Users className="h-4 w-4 text-purple-400" />}
              label="Buddy requests"
              description="Get notified when someone sends you an accountability buddy request."
              checked={currentPrefs.buddy_checkin}
              onChange={(v) => handlePrefChange('buddy_checkin', v)}
              disabled={!isSubscribed}
            />
            <PrefRow
              icon={<Swords className="h-4 w-4 text-amber-400" />}
              label="Challenge alerts"
              description="Get notified when you receive a challenge, someone accepts yours, or a battle ends."
              checked={currentPrefs.challenges ?? true}
              onChange={(v) => handlePrefChange('challenges', v)}
              disabled={!isSubscribed}
            />
          </div>
        )}

        {!isSubscribed && !prefsLoading && (
          <EmptyState
            variant="no-notifications"
            title="Push notifications not enabled"
            description="Enable push notifications above to configure your alert preferences."
            compact
          />
        )}

        <div className="pt-2 border-t border-app-border flex items-center justify-between">
          {saveSuccess
            ? <span className="flex items-center gap-1.5 text-sm text-green-400 font-semibold"><Check className="h-4 w-4" /> Saved</span>
            : savePrefsError
            ? <span className="text-sm text-red-400">Failed to save — please try again</span>
            : <span />}
          <button
            onClick={handleSave}
            disabled={savePrefsLoading || !isSubscribed || prefsLoading}
            className="btn-primary flex items-center gap-2 px-5 py-2 text-sm cursor-pointer disabled:opacity-50"
          >
            {savePrefsLoading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
              : 'Save preferences'}
          </button>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-app-panel/80 backdrop-blur-xl border border-app-border rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-app-text-body">How notifications work</h2>
        <div className="space-y-2 text-sm text-app-text-secondary leading-relaxed">
          <p>
            StayTrue uses the Web Push API — your browser registers a push endpoint stored
            securely in the database.
          </p>
          <p>
            When a buddy checks in or sends a message, the server delivers a push directly
            to your device — even when the app is closed.
          </p>
          <p>
            The daily reminder fires at <strong className="text-app-text-body">your chosen time in your timezone</strong>.
            It only sends if you haven't checked in on any active goal that day.
          </p>
        </div>
      </div>
    </div>
  );
};
