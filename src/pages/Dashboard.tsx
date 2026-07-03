import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store/useAuthStore';
import type { Profile } from '../store/useAuthStore';
import { CreateGoalModal } from '../components/CreateGoalModal';
import { GoalCard } from '../components/GoalCard';
import { BuddyRequestsInbox } from '../components/BuddyRequestsInbox';
import { BuddyManager } from '../components/BuddyManager';
import { SkeletonGoalCard } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { useBuddyRequests } from '../hooks/useBuddies';
import type { Goal } from '../types/goal';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  User as UserIcon, Mail, Globe, Calendar, Loader2, Check,
  Plus, Search, ChevronLeft, ChevronRight,
  Settings, ShieldAlert, Users, Target, Bell,
} from 'lucide-react';

const profileSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  timezone: z.string().min(1, 'Timezone is required'),
});
type ProfileFormValues = z.infer<typeof profileSchema>;

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago',
  'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Kolkata', 'Asia/Singapore', 'Australia/Sydney',
];

export const Dashboard: React.FC = () => {
  const { user, setProfile } = useAuthStore();
  const queryClient = useQueryClient();

  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get('tab') as 'goals' | 'buddies' | 'profile' | null;
  const [activeTab, setActiveTab] = useState<'goals' | 'buddies' | 'profile'>(urlTab ?? 'goals');
  const [selectedBuddyGoalId, setSelectedBuddyGoalId] = useState('');
  const { data: pendingRequests = [] } = useBuddyRequests();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sync tab when URL param changes (e.g. bottom nav deep-link)
  useEffect(() => {
    if (urlTab && ['goals', 'buddies', 'profile'].includes(urlTab)) {
      setActiveTab(urlTab);
    }
  }, [urlTab]);

  // Profile
  const { data: profile } = useQuery<Profile | null>({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { register, handleSubmit, formState: { errors: profileErrors } } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    values: { fullName: profile?.full_name || '', timezone: profile?.timezone || 'UTC' },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (values: ProfileFormValues) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase.from('profiles')
        .update({ full_name: values.fullName, timezone: values.timezone })
        .eq('id', user.id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      setProfile(data);
      setSuccessMsg('Profile updated!');
      setTimeout(() => setSuccessMsg(null), 3000);
    },
  });

  // Goals
  const { data: goalsData, isLoading: goalsLoading, error: goalsError } = useQuery<{ data: Goal[]; count: number }>({
    queryKey: ['goals', user?.id, filter, search, page],
    queryFn: async () => {
      if (!user) return { data: [], count: 0 };
      let q = supabase.from('goals').select('*', { count: 'exact' })
        .eq('user_id', user.id).order('created_at', { ascending: false });
      if (filter === 'active') q = q.eq('status', 'active');
      if (filter === 'completed') q = q.eq('status', 'completed');
      if (search.trim()) q = q.ilike('title', `%${search}%`);
      const from = (page - 1) * 10;
      q = q.range(from, from + 9);
      const { data, error, count } = await q;
      if (error) throw error;
      return { data: (data || []) as Goal[], count: count || 0 };
    },
    enabled: !!user,
  });

  const { data: allActiveGoals = [] } = useQuery<Goal[]>({
    queryKey: ['goals-all', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from('goals')
        .select('id, title, status').eq('user_id', user.id).order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Goal[];
    },
    enabled: !!user,
  });

  const updateGoalStatus = useMutation({
    mutationFn: async ({ goalId, newStatus }: { goalId: string; newStatus: Goal['status'] }) => {
      const { data, error } = await supabase.from('goals').update({ status: newStatus })
        .eq('id', goalId).select().single();
      if (error) throw error;
      return data;
    },
    onMutate: async ({ goalId, newStatus }) => {
      await queryClient.cancelQueries({ queryKey: ['goals', user?.id] });
      const prev = queryClient.getQueryData(['goals', user?.id, filter, search, page]);
      queryClient.setQueryData(['goals', user?.id, filter, search, page], (old: any) =>
        old ? { ...old, data: old.data.map((g: Goal) => g.id === goalId ? { ...g, status: newStatus } : g) } : old
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) queryClient.setQueryData(['goals', user?.id, filter, search, page], ctx.prev); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['goals', user?.id] }); },
  });

  const deleteGoal = useMutation({
    mutationFn: async (goalId: string) => {
      const { error } = await supabase.from('goals').delete().eq('id', goalId);
      if (error) throw error;
    },
    onMutate: async (goalId) => {
      await queryClient.cancelQueries({ queryKey: ['goals', user?.id] });
      const prev = queryClient.getQueryData(['goals', user?.id, filter, search, page]);
      queryClient.setQueryData(['goals', user?.id, filter, search, page], (old: any) =>
        old ? { ...old, data: old.data.filter((g: Goal) => g.id !== goalId), count: Math.max(0, (old.count || 0) - 1) } : old
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) queryClient.setQueryData(['goals', user?.id, filter, search, page], ctx.prev); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['goals', user?.id] }); },
  });

  const getDaysMeta = (d: string | null) => {
    if (!d) return { text: 'No deadline', color: 'text-app-text-secondary' };
    const diff = Math.ceil((new Date(d).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000);
    if (diff < 0) return { text: 'Overdue', color: 'text-red-400 font-semibold' };
    if (diff === 0) return { text: 'Due today', color: 'text-amber-400 font-semibold' };
    if (diff === 1) return { text: '1 day left', color: 'text-emerald-400' };
    return { text: `${diff} days left`, color: 'text-emerald-400' };
  };

  const totalPages = goalsData ? Math.ceil(goalsData.count / 10) : 1;

  const tabs = [
    { id: 'goals',   label: 'Goals',   icon: Target,    badge: 0                      },
    { id: 'buddies', label: 'Buddies', icon: Users,     badge: pendingRequests.length },
    { id: 'profile', label: 'Profile', icon: Settings,  badge: 0                      },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-text-body" style={{ fontFamily: 'var(--font-display)' }}>
            Dashboard
          </h1>
          <p className="text-sm text-app-text-secondary mt-0.5">Track your goals and stay accountable</p>
        </div>

        {/* Tabs — hidden on mobile (bottom nav handles switching) */}
        <div className="hidden sm:flex bg-app-panel border border-app-border rounded-xl p-1 gap-0.5">
          {tabs.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setActiveTab(id)}
              style={{ minHeight: '44px' }}
              className={`relative flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium cursor-pointer outline-none focus:outline-none focus:shadow-none transition-colors ${
                activeTab === id
                  ? 'bg-app-accent-bg text-app-text-primary border border-app-border-active/30'
                  : 'text-app-text-secondary hover:text-app-text-body border border-transparent'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {!!badge && badge > 0 && (
                <span className="badge" style={{ fontSize: '9px', padding: '0 5px', lineHeight: '16px', height: '16px' }}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Goals tab ────────────────────────────────────────────────────── */}
      {activeTab === 'goals' && (
        <div className="space-y-5">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center bg-app-panel border border-app-border rounded-xl p-4">
            {/* Filter pills */}
            <div className="flex bg-app-bg rounded-lg p-1 gap-0.5">
              {(['all', 'active', 'completed'] as const).map((f) => (
                <button
                  key={f}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setFilter(f); setPage(1); }}
                  style={{ minHeight: '44px' }}
                  className={`px-4 py-2.5 rounded-md text-sm font-medium cursor-pointer capitalize outline-none focus:outline-none focus:shadow-none transition-colors ${
                    filter === f ? 'bg-app-panel text-app-text-body border border-app-border' : 'text-app-text-secondary hover:text-app-text-body border border-transparent'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative flex-1 w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-app-text-dim" />
              <input
                type="text" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search goals..."
                className="input-field w-full pl-9 pr-4 py-3 text-sm"
                style={{ minHeight: '44px' }}
              />
            </div>

            <button
              onClick={() => setIsCreateOpen(true)}
              style={{ minHeight: '44px' }}
              className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm cursor-pointer shrink-0 w-full sm:w-auto justify-center"
            >
              <Plus className="h-4 w-4" />
              New goal
            </button>
          </div>

          {/* Goal list */}
          {goalsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <SkeletonGoalCard key={i} />)}
            </div>
          ) : goalsError ? (
            <div className="bg-app-panel border border-red-500/30 rounded-xl p-6 text-center max-w-lg mx-auto">
              <ShieldAlert className="h-8 w-8 text-red-400 mx-auto mb-3" />
              <p className="text-sm text-red-400">{(goalsError as Error).message}</p>
            </div>
          ) : goalsData?.data.length === 0 ? (
            <EmptyState
              variant="no-goals"
              title={search.trim() ? 'No goals match your search' : undefined}
              description={search.trim() ? 'Try a different search term or clear the filter.' : undefined}
              action={!search.trim() ? {
                label: 'Create your first goal',
                onClick: () => setIsCreateOpen(true),
                icon: <Plus className="h-4 w-4" />,
              } : undefined}
            />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3">
                {goalsData?.data.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    daysMeta={getDaysMeta(goal.target_date)}
                    onStatusToggle={(g) => updateGoalStatus.mutate({ goalId: g.id, newStatus: g.status === 'completed' ? 'active' : 'completed' })}
                    onPauseToggle={(g) => updateGoalStatus.mutate({ goalId: g.id, newStatus: g.status === 'paused' ? 'active' : 'paused' })}
                    onDelete={(id) => { if (confirm('Delete this goal?')) deleteGoal.mutate(id); }}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between bg-app-panel border border-app-border rounded-xl px-5 py-3">
                  <button
                    disabled={page === 1} onClick={() => setPage((p) => p - 1)}
                    className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-sm cursor-pointer disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </button>
                  <span className="text-sm text-app-text-secondary">Page {page} of {totalPages}</span>
                  <button
                    disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}
                    className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-sm cursor-pointer disabled:opacity-40"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Buddies tab ───────────────────────────────────────────────────── */}
      {activeTab === 'buddies' && (
        <div className="space-y-5">
          <div className="bg-app-panel border border-app-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="h-4 w-4 text-app-text-primary" />
              <h2 className="text-sm font-semibold text-app-text-body">Incoming requests</h2>
            </div>
            <BuddyRequestsInbox />
          </div>

          <div className="bg-app-panel border border-app-border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-app-text-primary" />
              <h2 className="text-sm font-semibold text-app-text-body">Invite a buddy</h2>
            </div>

            <div>
              <label className="block text-sm font-medium text-app-text-body mb-1.5">Select a goal</label>
              <select
                value={selectedBuddyGoalId}
                onChange={(e) => setSelectedBuddyGoalId(e.target.value)}
                className="input-field w-full px-4 py-2.5 text-sm"
              >
                <option value="">Choose a goal...</option>
                {allActiveGoals.map((g) => (
                  <option key={g.id} value={g.id}>[{g.status}] {g.title}</option>
                ))}
              </select>
            </div>

            {selectedBuddyGoalId ? (
              <BuddyManager goalId={selectedBuddyGoalId} />
            ) : (
              <div className="border border-app-border border-dashed rounded-xl p-8 text-center">
                <p className="text-sm text-app-text-secondary">Select a goal above to manage buddies</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Profile tab ───────────────────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Profile card */}
          <div className="bg-app-panel border border-app-border rounded-xl p-6 flex flex-col items-center text-center gap-4">
            <div className="h-20 w-20 rounded-full bg-app-accent-bg border-2 border-app-border-active/30 flex items-center justify-center overflow-hidden">
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                : <UserIcon className="h-8 w-8 text-app-text-primary" />}
            </div>
            <div>
              <p className="font-semibold text-app-text-body">{profile?.full_name || 'User'}</p>
              <p className="text-sm text-app-text-secondary mt-0.5">{user?.email}</p>
            </div>
            <div className="w-full pt-4 border-t border-app-border text-left space-y-2.5">
              {[
                { icon: Globe,    label: 'Timezone', value: profile?.timezone },
                { icon: Calendar, label: 'Joined',   value: profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A' },
                { icon: Mail,     label: 'Email',    value: user?.email },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-2.5 text-sm">
                  <Icon className="h-3.5 w-3.5 text-app-text-dim shrink-0" />
                  <span className="text-app-text-secondary">{label}:</span>
                  <span className="text-app-text-body font-medium truncate">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Edit form */}
          <div className="lg:col-span-2 bg-app-panel border border-app-border rounded-xl p-6">
            <h2 className="text-base font-semibold text-app-text-body mb-5" style={{ fontFamily: 'var(--font-display)' }}>
              Edit profile
            </h2>
            <form onSubmit={handleSubmit((v) => updateProfileMutation.mutate(v))} className="space-y-5">
              {successMsg && (
                <div className="flex items-center gap-2 p-3.5 rounded-lg bg-green-500/10 border border-green-500/30 text-sm text-green-400">
                  <Check className="h-4 w-4" /> {successMsg}
                </div>
              )}
              {updateProfileMutation.isError && (
                <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
                  {updateProfileMutation.error.message}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-app-text-body mb-1.5">Full name</label>
                  <input type="text" {...register('fullName')}
                    className={`input-field w-full px-4 py-2.5 text-sm ${profileErrors.fullName ? 'border-red-500/60' : ''}`}
                    placeholder="Jane Doe" />
                  {profileErrors.fullName && <p className="mt-1 text-xs text-red-400">{profileErrors.fullName.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-app-text-body mb-1.5">Timezone</label>
                  <select {...register('timezone')}
                    className={`input-field w-full px-4 py-2.5 text-sm ${profileErrors.timezone ? 'border-red-500/60' : ''}`}>
                    {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                  {profileErrors.timezone && <p className="mt-1 text-xs text-red-400">{profileErrors.timezone.message}</p>}
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-app-border">
                <button type="submit" disabled={updateProfileMutation.isPending}
                  className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm cursor-pointer disabled:opacity-50">
                  {updateProfileMutation.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                    : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CreateGoalModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
};
