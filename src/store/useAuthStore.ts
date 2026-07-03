import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  timezone: string;
  reminder_time: string | null;
  is_public: boolean;
  notification_prefs: {
    daily_reminder: boolean;
    buddy_checkin: boolean;
    messages: boolean;
  };
  created_at: string;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  fetchProfile: (userId: string) => Promise<Profile | null>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  profile: null,
  loading: true,

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),

  fetchProfile: async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) { console.error('Error fetching profile:', error); return null; }
      set({ profile: data });
      return data;
    } catch (err) {
      console.error('Unexpected error fetching profile:', err);
      return null;
    }
  },

  signOut: async () => {
    set({ loading: true });
    try {
      await supabase.auth.signOut();
      set({ user: null, session: null, profile: null });
    } catch (err) {
      console.error('Error signing out:', err);
    } finally {
      set({ loading: false });
    }
  },
}));
