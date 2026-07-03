import React, { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store/useAuthStore';
import { registerServiceWorker } from '../hooks/usePushNotifications';
import { Loader2 } from 'lucide-react';

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const { setUser, setSession, setProfile, fetchProfile, setLoading, loading } = useAuthStore();

  useEffect(() => {
    let mounted = true;

    // Check active session on mount
    const initSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted) {
          if (session) {
            setSession(session);
            setUser(session.user);
            await fetchProfile(session.user.id);
          } else {
            setSession(null);
            setUser(null);
            setProfile(null);
          }
        }
      } catch (error) {
        console.error('Error initializing session:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initSession();

    // Register service worker for push notifications (best-effort, non-blocking)
    registerServiceWorker().catch(() => {});

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;
        
        setLoading(true);
        if (session) {
          setSession(session);
          setUser(session.user);
          await fetchProfile(session.user.id);
        } else {
          setSession(null);
          setUser(null);
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [setUser, setSession, setProfile, fetchProfile, setLoading]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg">
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-app-text-primary" />
          <p className="text-sm text-app-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
