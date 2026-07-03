import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2, User as UserIcon, Target, CheckSquare,
  Flame, Lock, Share2, Check, Zap, ArrowLeft,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getBadgeMeta } from '../types/badge';
import type { Badge } from '../types/badge';
import { ThemeToggle } from '../components/ThemeToggle';

interface PublicProfileData {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  timezone: string;
  created_at: string;
  is_public: boolean;
  is_private?: boolean;
  active_goals: number;
  total_checkins: number;
  longest_streak: number;
  badges: Badge[] | null;
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="bg-app-panel border border-app-border rounded-xl p-4 text-center">
      <div className="flex justify-center mb-2 text-app-text-primary">{icon}</div>
      <p className="text-2xl font-bold text-app-text-body" style={{ fontFamily: 'var(--font-display)' }}>
        {value}
      </p>
      <p className="text-xs text-app-text-secondary mt-0.5">{label}</p>
    </div>
  );
}

export const PublicProfile: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error } = useQuery<PublicProfileData | null>({
    queryKey: ['public-profile', username],
    queryFn: async () => {
      if (!username) return null;
      const { data, error } = await supabase.rpc('get_public_profile', { p_username: username });
      if (error) throw error;
      return data as PublicProfileData | null;
    },
    enabled: !!username,
    staleTime: 60_000,
  });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Shared nav bar for all states
  const NavBar = () => (
    <header className="sticky top-0 z-40 border-b border-app-border bg-app-panel/80 backdrop-blur-md">
      <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="h-7 w-7 rounded-lg bg-app-accent flex items-center justify-center">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-app-text-body" style={{ fontFamily: 'var(--font-display)' }}>StayTrue</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-app-bg">
        <NavBar />
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-app-text-primary" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-app-bg">
        <NavBar />
        <div className="max-w-md mx-auto px-6 py-24 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-app-panel border border-app-border mb-6">
            <UserIcon className="h-7 w-7 text-app-text-dim" />
          </div>
          <h1 className="text-2xl font-bold text-app-text-body mb-2" style={{ fontFamily: 'var(--font-display)' }}>
            Profile not found
          </h1>
          <p className="text-app-text-secondary mb-6">
            No user with the username <strong>@{username}</strong> exists.
          </p>
          <Link to="/" className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (data.is_private) {
    return (
      <div className="min-h-screen bg-app-bg">
        <NavBar />
        <div className="max-w-md mx-auto px-6 py-24 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-app-panel border border-app-border mb-6">
            <Lock className="h-7 w-7 text-app-text-dim" />
          </div>
          <h1 className="text-2xl font-bold text-app-text-body mb-2" style={{ fontFamily: 'var(--font-display)' }}>
            This profile is private
          </h1>
          <p className="text-app-text-secondary mb-6">
            <strong>@{username}</strong> has set their profile to private.
          </p>
          <Link to="/" className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
        </div>
      </div>
    );
  }

  const badges = data.badges ?? [];
  const joinDate = new Date(data.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-app-bg">
      <NavBar />

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {/* Profile header */}
        <div className="bg-app-panel border border-app-border rounded-2xl p-8 flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Avatar */}
          <div className="h-24 w-24 rounded-full bg-app-accent-bg border-2 border-app-border flex items-center justify-center overflow-hidden shrink-0">
            {data.avatar_url
              ? <img src={data.avatar_url} alt={data.full_name || data.username} className="h-full w-full object-cover" />
              : <UserIcon className="h-10 w-10 text-app-text-primary" />}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <h1 className="text-2xl font-bold text-app-text-body" style={{ fontFamily: 'var(--font-display)' }}>
              {data.full_name || `@${data.username}`}
            </h1>
            <p className="text-app-text-secondary text-sm mt-0.5">@{data.username}</p>

            {data.bio && (
              <p className="text-app-text-body text-sm mt-3 leading-relaxed">{data.bio}</p>
            )}

            <div className="flex items-center justify-center sm:justify-start gap-4 mt-3 text-xs text-app-text-dim">
              <span>{data.timezone}</span>
              <span>·</span>
              <span>Joined {joinDate}</span>
            </div>
          </div>

          {/* Share button */}
          <button
            onClick={handleCopy}
            className="btn-ghost flex items-center gap-2 px-4 py-2 text-sm cursor-pointer shrink-0"
          >
            {copied ? <><Check className="h-4 w-4 text-green-400" /> Copied!</> : <><Share2 className="h-4 w-4" /> Share</>}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard icon={<Target className="h-5 w-5" />}   label="Active goals"    value={data.active_goals} />
          <StatCard icon={<CheckSquare className="h-5 w-5" />} label="Total check-ins" value={data.total_checkins} />
          <StatCard icon={<Flame className="h-5 w-5 text-orange-400" />} label="Longest streak" value={`${data.longest_streak}d`} />
        </div>

        {/* Badges */}
        {badges.length > 0 && (
          <div className="bg-app-panel border border-app-border rounded-xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-app-text-body">Badges</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {badges.map((b) => {
                const meta = getBadgeMeta(b.badge_key);
                return (
                  <div key={b.badge_key} className={`flex items-center gap-3 p-3 rounded-xl border ${meta.color}`}>
                    <span className="text-2xl leading-none">{meta.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{meta.label}</p>
                      <p className="text-[10px] opacity-70 truncate">
                        {new Date(b.earned_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {badges.length === 0 && (
          <div className="bg-app-panel border border-app-border border-dashed rounded-xl p-8 text-center">
            <p className="text-sm text-app-text-secondary">No badges earned yet — keep going! 🚀</p>
          </div>
        )}
      </main>
    </div>
  );
};
