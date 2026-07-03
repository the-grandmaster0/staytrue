import React, { useRef, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  User as UserIcon, Camera, Check, Loader2, Globe,
  AtSign, FileText, Eye, EyeOff, ExternalLink, Trash2, Bell, AlertTriangle, LogOut, X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { sanitize, sanitizeTrunc } from '../lib/sanitize';
import { useAuthStore } from '../store/useAuthStore';
import type { Profile } from '../store/useAuthStore';
import { getBadgeMeta } from '../types/badge';
import type { Badge } from '../types/badge';

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago',
  'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Kolkata',
  'Asia/Singapore', 'Australia/Sydney',
];

const profileSchema = z.object({
  full_name:     z.string().min(2, 'Name must be at least 2 characters'),
  username:      z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Max 30 characters')
    .regex(/^[a-z0-9_-]+$/, 'Only lowercase letters, numbers, hyphens and underscores')
    .optional()
    .or(z.literal('')),
  bio:           z.string().max(160, 'Max 160 characters').optional(),
  timezone:      z.string().min(1, 'Required'),
  reminder_time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format').optional(),
  is_public:     z.boolean(),
});
type FormValues = z.infer<typeof profileSchema>;

export const EditProfile: React.FC = () => {
  const { user, setProfile, signOut } = useAuthStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDeleteBox, setShowDeleteBox] = useState(false);

  type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'same';
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');

  // Fetch full profile
  const { data: profile, isLoading } = useQuery<Profile | null>({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (error) throw error;
      return data as Profile;
    },
    enabled: !!user,
  });

  // Fetch badges
  const { data: badges = [] } = useQuery<Badge[]>({
    queryKey: ['badges', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('badges').select('badge_key, earned_at').eq('user_id', user.id).order('earned_at');
      if (error) throw error;
      return data as Badge[];
    },
    enabled: !!user,
  });

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(profileSchema),
    values: {
      full_name:     profile?.full_name ?? '',
      username:      profile?.username ?? '',
      bio:           profile?.bio ?? '',
      timezone:      profile?.timezone ?? 'UTC',
      reminder_time: profile?.reminder_time ?? '08:00',
      is_public:     profile?.is_public ?? true,
    },
  });

  // Delete account
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      // Delete profile — cascades to all user data via FK ON DELETE CASCADE
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id);
      if (error) throw error;
      // Sign out after deletion
      await supabase.auth.signOut();
    },
    onSuccess: () => {
      queryClient.clear();
      navigate('/');
    },
  });

  const bioVal = watch('bio') ?? '';
  const isPublic = watch('is_public');
  const usernameVal = watch('username') ?? '';

  // ── Realtime username availability check ──────────────────────────────────
  useEffect(() => {
    const raw = usernameVal.trim().toLowerCase();

    // Empty or too short — reset without querying
    if (!raw || raw.length < 3) {
      setUsernameStatus('idle');
      return;
    }

    // Same as the current saved username — no need to check
    if (profile?.username && raw === profile.username.toLowerCase()) {
      setUsernameStatus('same');
      return;
    }

    // Debounce: wait 400ms after the user stops typing before hitting Supabase
    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id')
          .ilike('username', raw)
          .limit(1)
          .maybeSingle();

        if (error) {
          setUsernameStatus('idle');
          return;
        }

        // If a row came back and it's NOT the current user, it's taken
        if (data && data.id !== user?.id) {
          setUsernameStatus('taken');
        } else {
          setUsernameStatus('available');
        }
      } catch {
        setUsernameStatus('idle');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [usernameVal, profile?.username, user?.id]);

  // Save profile
  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name:     sanitizeTrunc(values.full_name, 80),
          username:      values.username ? sanitize(values.username).toLowerCase() : null,
          bio:           values.bio ? sanitizeTrunc(values.bio, 160) : null,
          timezone:      values.timezone,
          reminder_time: values.reminder_time || '08:00',
          is_public:     values.is_public,
        })
        .eq('id', user.id)
        .select()
        .single();
      if (error) throw error;
      return data as Profile;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['profile', user?.id], data);
      setProfile(data);
      setSuccessMsg('Profile saved!');
      setTimeout(() => setSuccessMsg(null), 3000);
    },
  });

  // Avatar upload
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Strict MIME type whitelist — no generic image/* check
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const MIME_TO_EXT: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png':  'png',
      'image/webp': 'webp',
    };
    if (!ALLOWED_TYPES.includes(file.type)) {
      alert('Only JPEG, PNG, and WebP images are allowed.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be under 2 MB.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    // Use MIME-derived extension — never trust user-provided filename
    const ext = MIME_TO_EXT[file.type];
    const path = `${user.id}/avatar.${ext}`;

    setAvatarUploading(true);
    try {

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

      const { data, error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id)
        .select()
        .single();

      if (updateError) throw updateError;
      queryClient.setQueryData(['profile', user?.id], data);
      setProfile(data as Profile);
    } catch (err) {
      console.error('Avatar upload failed:', err);
      alert('Upload failed. Please try again.');
    } finally {
      setAvatarUploading(false);
      // Reset input so the same file can be re-selected
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Avatar remove
  const handleAvatarRemove = async () => {
    if (!user || !profile?.avatar_url) return;
    setAvatarUploading(true);
    try {
      // Extract storage path from the public URL (everything after /avatars/)
      const url = new URL(profile.avatar_url);
      const storagePath = url.pathname.split('/avatars/')[1];
      if (storagePath) {
        await supabase.storage.from('avatars').remove([storagePath]);
      }

      const { data, error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;
      queryClient.setQueryData(['profile', user?.id], data);
      setProfile(data as Profile);
    } catch (err) {
      console.error('Avatar remove failed:', err);
    } finally {
      setAvatarUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-app-text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-app-text-body" style={{ fontFamily: 'var(--font-display)' }}>
            Edit Profile
          </h1>
          <p className="text-sm text-app-text-secondary mt-0.5">
            Manage your public presence and preferences
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sign out — only shown on mobile (desktop has it in sidebar) */}
          <button
            onClick={handleSignOut}
            className="md:hidden flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer uppercase tracking-wider"
            style={{ clipPath: 'polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px))', fontFamily: 'var(--font-display)' }}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
          {profile?.username && (
            <Link
              to={`/u/${profile.username}`}
              target="_blank"
              className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-sm cursor-pointer"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">View profile</span>
            </Link>
          )}
        </div>
      </div>

      {/* Avatar */}
      <div className="bg-app-panel border border-app-border rounded-xl p-6 flex items-center gap-5">
        <div className="relative shrink-0">
          <div className="h-20 w-20 rounded-full bg-app-accent-bg border-2 border-app-border flex items-center justify-center overflow-hidden">
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              : <UserIcon className="h-8 w-8 text-app-text-primary" />}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>
        <div>
          <p className="text-sm font-semibold text-app-text-body">{profile?.full_name || 'Your name'}</p>
          {profile?.username && (
            <p className="text-sm text-app-text-secondary">@{profile.username}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={avatarUploading}
              className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5" />
              {profile?.avatar_url ? 'Change photo' : 'Upload photo'}
            </button>
            {profile?.avatar_url && (
              <button
                type="button"
                onClick={handleAvatarRemove}
                disabled={avatarUploading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all cursor-pointer disabled:opacity-50"
              >
                {avatarUploading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Trash2 className="h-3.5 w-3.5" />}
                Remove
              </button>
            )}
          </div>
          <p className="text-xs text-app-text-dim mt-1">JPG, PNG or WebP · max 2MB</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit((v) => saveMutation.mutate(v))} className="space-y-5">
        <div className="bg-app-panel border border-app-border rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-app-text-body">Basic info</h2>

          {successMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-sm text-green-400">
              <Check className="h-4 w-4" /> {successMsg}
            </div>
          )}
          {saveMutation.isError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
              {(saveMutation.error as Error).message}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Full name */}
            <div>
              <label className="block text-sm font-medium text-app-text-body mb-1.5">
                <span className="flex items-center gap-1.5"><UserIcon className="h-3.5 w-3.5" /> Full name</span>
              </label>
              <input type="text" {...register('full_name')} placeholder="Jane Doe"
                className={`input-field w-full px-4 py-2.5 text-sm ${errors.full_name ? 'border-red-500/60' : ''}`} />
              {errors.full_name && <p className="mt-1 text-xs text-red-400">{errors.full_name.message}</p>}
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-app-text-body mb-1.5">
                <span className="flex items-center gap-1.5"><AtSign className="h-3.5 w-3.5" /> Username</span>
              </label>
              <div className="relative">
                <input type="text" {...register('username')} placeholder="jane_doe"
                  className={`input-field w-full px-4 py-2.5 text-sm pr-9 ${
                    errors.username ? 'border-red-500/60' :
                    usernameStatus === 'taken' ? 'border-red-500/60' :
                    usernameStatus === 'available' ? 'border-green-500/60' : ''
                  }`} />
                {/* Status icon */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameStatus === 'checking' && (
                    <Loader2 className="h-4 w-4 text-app-text-dim animate-spin" />
                  )}
                  {usernameStatus === 'available' && (
                    <Check className="h-4 w-4 text-green-400" />
                  )}
                  {usernameStatus === 'taken' && (
                    <X className="h-4 w-4 text-red-400" />
                  )}
                </div>
              </div>
              {/* Status message */}
              {errors.username ? (
                <p className="mt-1 text-xs text-red-400">{errors.username.message}</p>
              ) : usernameStatus === 'available' ? (
                <p className="mt-1 text-xs text-green-400 font-mono">// username available</p>
              ) : usernameStatus === 'taken' ? (
                <p className="mt-1 text-xs text-red-400 font-mono">// username already taken</p>
              ) : usernameStatus === 'same' ? (
                <p className="mt-1 text-xs text-app-text-dim font-mono">// current username</p>
              ) : (
                <p className="mt-1 text-xs text-app-text-dim">Your public URL: /u/username</p>
              )}
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-app-text-body mb-1.5">
              <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Bio</span>
            </label>
            <textarea {...register('bio')} rows={3} placeholder="Tell people what you're working toward…"
              className={`input-field w-full px-4 py-2.5 text-sm resize-none ${errors.bio ? 'border-red-500/60' : ''}`} />
            <div className="flex justify-between mt-1">
              {errors.bio ? <p className="text-xs text-red-400">{errors.bio.message}</p> : <span />}
              <p className={`text-xs ${bioVal.length > 140 ? 'text-amber-400' : 'text-app-text-dim'}`}>
                {bioVal.length}/160
              </p>
            </div>
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium text-app-text-body mb-1.5">
              <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> Timezone</span>
            </label>
            <select {...register('timezone')} className="input-field w-full px-4 py-2.5 text-sm">
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>

          {/* Reminder time */}
          <div>
            <label className="block text-sm font-medium text-app-text-body mb-1.5">
              <span className="flex items-center gap-1.5"><Bell className="h-3.5 w-3.5" /> Daily reminder time</span>
            </label>
            <input
              type="time"
              {...register('reminder_time')}
              className={`input-field w-full px-4 py-2.5 text-sm ${errors.reminder_time ? 'border-red-500/60' : ''}`}
            />
            {errors.reminder_time ? (
              <p className="mt-1 text-xs text-red-400">{errors.reminder_time.message}</p>
            ) : (
              <p className="mt-1 text-xs text-app-text-dim">
                When to remind you to check in (in your timezone)
              </p>
            )}
          </div>

          {/* Public toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-app-border bg-app-bg">
            <div className="flex items-center gap-3">
              {isPublic
                ? <Eye className="h-4 w-4 text-app-text-primary" />
                : <EyeOff className="h-4 w-4 text-app-text-secondary" />}
              <div>
                <p className="text-sm font-medium text-app-text-body">Public profile</p>
                <p className="text-xs text-app-text-secondary">
                  {isPublic ? 'Anyone can view your profile at /u/username' : 'Your profile is hidden from public view'}
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isPublic}
              onClick={() => setValue('is_public', !isPublic)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${isPublic ? 'bg-app-accent' : 'bg-app-border'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isPublic ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saveMutation.isPending || usernameStatus === 'taken' || usernameStatus === 'checking'}
            className="btn-primary flex items-center gap-2 px-6 py-2.5 text-sm font-semibold cursor-pointer disabled:opacity-50">
            {saveMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : 'Save changes'}
          </button>
        </div>
      </form>

      {/* Badges earned */}
      {badges.length > 0 && (
        <div className="bg-app-panel border border-app-border rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-app-text-body">Your badges</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {badges.map((b) => {
              const meta = getBadgeMeta(b.badge_key);
              return (
                <div key={b.badge_key} className={`flex items-center gap-3 p-3 rounded-xl border ${meta.color}`}>
                  <span className="text-2xl leading-none">{meta.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{meta.label}</p>
                    <p className="text-[10px] opacity-70 truncate">{meta.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Danger zone — delete account */}
      <div className="bg-app-panel border border-red-500/20 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
          <div>
            <h2 className="text-sm font-bold text-red-400 uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)' }}>
              DANGER ZONE
            </h2>
            <p className="text-xs text-app-text-secondary mt-0.5">
              Permanently delete your account and all associated data
            </p>
          </div>
        </div>

        {!showDeleteBox ? (
          <button
            type="button"
            onClick={() => setShowDeleteBox(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/60 transition-colors cursor-pointer rounded-sm uppercase tracking-wider"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <Trash2 className="h-4 w-4" />
            Delete my account
          </button>
        ) : (
          <div className="space-y-4 border border-red-500/30 rounded-lg p-4 bg-red-500/5">
            <div className="space-y-1">
              <p className="text-sm font-bold text-red-400">This action is irreversible.</p>
              <p className="text-xs text-app-text-secondary leading-relaxed">
                All your goals, check-ins, streaks, messages, badges, and account data will be
                permanently deleted. This cannot be undone.
              </p>
            </div>
            <div>
              <label className="block text-xs font-mono text-app-text-secondary mb-2 uppercase tracking-wider">
                Type <span className="text-red-400 font-bold">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                className="input-field w-full px-4 py-2.5 text-sm border-red-500/30 focus:border-red-500"
              />
            </div>
            {deleteMutation.isError && (
              <p className="text-xs text-red-400">
                {(deleteMutation.error as Error).message}
              </p>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setShowDeleteBox(false); setDeleteConfirm(''); }}
                className="btn-ghost px-4 py-2 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteConfirm !== 'DELETE' || deleteMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white border border-red-500 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed rounded-sm uppercase tracking-wider"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {deleteMutation.isPending
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Deleting...</>
                  : <><Trash2 className="h-3.5 w-3.5" /> Permanently delete</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
