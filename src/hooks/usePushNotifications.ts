import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store/useAuthStore';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface NotificationPrefs {
  daily_reminder: boolean;
  buddy_checkin:  boolean;
  messages:       boolean;
  challenges:     boolean;
}

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

/** Convert a base64url VAPID public key to the Uint8Array that pushManager.subscribe() needs. */
function vapidKeyToUint8Array(b64url: string): Uint8Array {
  const padding = '='.repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
}

/** Wait for a ServiceWorker to reach the 'activated' state. */
function waitForActivation(sw: ServiceWorker): Promise<void> {
  if (sw.state === 'activated') return Promise.resolve();
  return new Promise((resolve) => {
    const handler = () => {
      if (sw.state === 'activated') {
        sw.removeEventListener('statechange', handler);
        resolve();
      }
    };
    sw.addEventListener('statechange', handler);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Register service worker (called once at app boot from AuthProvider)
// ─────────────────────────────────────────────────────────────────────────────

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('[SW] Registered, state:', reg.active?.state ?? 'pending');
    return reg;
  } catch (err) {
    console.error('[SW] Registration failed:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main hook
// ─────────────────────────────────────────────────────────────────────────────

export function usePushNotifications() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [permission, setPermission]   = useState<PushPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [swReg, setSwReg]             = useState<ServiceWorkerRegistration | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    !!VAPID_PUBLIC_KEY;

  // ── Init: register SW + read current browser permission ───────────────────
  useEffect(() => {
    if (!isSupported) return;

    setPermission(Notification.permission as PushPermission);

    (async () => {
      try {
        // Use the already-registered SW if present, otherwise register it
        const existing = await navigator.serviceWorker.getRegistration('/');
        const reg = existing ?? await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (!reg) return;
        setSwReg(reg);

        // Wait for it to be controlling the page
        if (reg.installing) await waitForActivation(reg.installing);
        else if (reg.waiting) await waitForActivation(reg.waiting);

        const sub = await reg.pushManager.getSubscription();
        setIsSubscribed(!!sub);
        console.log('[Push] Subscription status:', sub ? 'subscribed' : 'not subscribed');
      } catch (err) {
        console.error('[Push] Init error:', err);
      }
    })();
  }, [isSupported]);

  // ── Notification preferences ───────────────────────────────────────────────
  const defaultPrefs: NotificationPrefs = {
    daily_reminder: true,
    buddy_checkin:  true,
    messages:       true,
    challenges:     true,
  };

  const { data: prefs, isLoading: prefsLoading } = useQuery<NotificationPrefs>({
    queryKey: ['notification-prefs', user?.id],
    queryFn: async () => {
      if (!user) return defaultPrefs;
      const { data, error } = await supabase
        .from('profiles')
        .select('notification_prefs')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return { ...defaultPrefs, ...(data?.notification_prefs ?? {}) } as NotificationPrefs;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const savePrefsMutation = useMutation({
    mutationFn: async (newPrefs: NotificationPrefs) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('profiles')
        .update({ notification_prefs: newPrefs })
        .eq('id', user.id);
      if (error) throw error;
      return newPrefs;
    },
    onSuccess: (newPrefs) => {
      queryClient.setQueryData(['notification-prefs', user?.id], newPrefs);
    },
  });

  // ── Subscribe ──────────────────────────────────────────────────────────────
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !user) return false;

    try {
      let reg = swReg;

      // Re-register if we don't have a registration yet
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (!reg) { console.error('[Push] SW registration unavailable'); return false; }
        setSwReg(reg);
      }

      // Make sure SW is active before subscribing
      const swToWait = reg.installing ?? reg.waiting;
      if (swToWait) {
        console.log('[Push] Waiting for SW activation...');
        await waitForActivation(swToWait);
      }

      // Request browser permission
      const result = await Notification.requestPermission();
      setPermission(result as PushPermission);
      if (result !== 'granted') {
        console.warn('[Push] Permission denied:', result);
        return false;
      }

      // Unsubscribe any stale subscription first
      const old = await reg.pushManager.getSubscription();
      if (old) await old.unsubscribe();

      // Create new push subscription
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:   true,
        applicationServerKey: vapidKeyToUint8Array(VAPID_PUBLIC_KEY!).buffer as ArrayBuffer,
      });

      console.log('[Push] Subscribed:', sub.endpoint.slice(0, 60) + '...');

      const json    = sub.toJSON();
      const p256dh  = json.keys?.p256dh ?? '';
      const auth    = json.keys?.auth   ?? '';

      if (!p256dh || !auth) {
        console.error('[Push] Subscription keys missing — VAPID key may be malformed');
        return false;
      }

      // Persist to Supabase
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
          { user_id: user.id, endpoint: sub.endpoint, p256dh, auth },
          { onConflict: 'user_id,endpoint' }
        );

      if (error) {
        console.error('[Push] Failed to save subscription:', error.message);
        // Don't return false — the browser subscription exists, DB just didn't save
        // The edge function will get no subs but at least the browser state is correct
        throw error;
      }

      setIsSubscribed(true);
      console.log('[Push] Subscription saved to DB ✓');
      return true;
    } catch (err) {
      console.error('[Push] Subscribe failed:', err);
      return false;
    }
  }, [isSupported, swReg, user]);

  // ── Unsubscribe ────────────────────────────────────────────────────────────
  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!user) return;
    try {
      const reg = swReg ?? await navigator.serviceWorker.getRegistration('/');
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', user.id)
            .eq('endpoint', sub.endpoint);
          await sub.unsubscribe();
          console.log('[Push] Unsubscribed');
        }
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error('[Push] Unsubscribe failed:', err);
    }
  }, [swReg, user]);

  return {
    isSupported,
    permission,
    isSubscribed,
    prefs:            prefs ?? defaultPrefs,
    prefsLoading,
    subscribe,
    unsubscribe,
    savePrefs:        savePrefsMutation.mutate,
    savePrefsLoading: savePrefsMutation.isPending,
    savePrefsError:   savePrefsMutation.isError,
  };
}
