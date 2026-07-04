import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store/useAuthStore';

// ── VAPID public key from env ─────────────────────────────────────────────────
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface NotificationPrefs {
  daily_reminder: boolean;
  buddy_checkin: boolean;
  messages: boolean;
  challenges: boolean;
}

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

// ── Helper: convert VAPID base64url key to Uint8Array ─────────────────────────
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// ── Register the service worker ───────────────────────────────────────────────
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return reg;
  } catch (err) {
    console.error('[SW] Registration failed:', err);
    return null;
  }
}

// ── Main hook ─────────────────────────────────────────────────────────────────
export function usePushNotifications() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [permission, setPermission] = useState<PushPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [swReg, setSwReg] = useState<ServiceWorkerRegistration | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    !!VAPID_PUBLIC_KEY;

  // ── Init: register SW + check current permission/subscription state ────────
  useEffect(() => {
    if (!isSupported) return;

    setPermission(Notification.permission as PushPermission);

    registerServiceWorker().then(async (reg) => {
      if (!reg) return;
      setSwReg(reg);

      const existingSub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!existingSub);
    });
  }, [isSupported]);

  // ── Fetch notification prefs from DB ─────────────────────────────────────
  const { data: prefs, isLoading: prefsLoading } = useQuery<NotificationPrefs>({
    queryKey: ['notification-prefs', user?.id],
    queryFn: async () => {
      if (!user) return { daily_reminder: true, buddy_checkin: true, messages: true };
      const { data, error } = await supabase
        .from('profiles')
        .select('notification_prefs')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return (data?.notification_prefs ?? {
        daily_reminder: true,
        buddy_checkin: true,
        messages: true,
      }) as NotificationPrefs;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // ── Save prefs ────────────────────────────────────────────────────────────
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

  // ── Request permission + subscribe ────────────────────────────────────────
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !swReg || !user) return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result as PushPermission);
      if (result !== 'granted') return false;

      const sub = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
      });

      const json = sub.toJSON();
      const p256dh = json.keys?.p256dh ?? '';
      const auth   = json.keys?.auth ?? '';

      // Upsert into push_subscriptions
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id:  user.id,
          endpoint: sub.endpoint,
          p256dh,
          auth,
        },
        { onConflict: 'user_id,endpoint' }
      );

      if (error) throw error;
      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('[Push] Subscribe failed:', err);
      return false;
    }
  }, [isSupported, swReg, user]);

  // ── Unsubscribe ───────────────────────────────────────────────────────────
  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!swReg || !user) return;
    try {
      const sub = await swReg.pushManager.getSubscription();
      if (sub) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', user.id)
          .eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
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
    prefs,
    prefsLoading,
    subscribe,
    unsubscribe,
    savePrefs: savePrefsMutation.mutate,
    savePrefsLoading: savePrefsMutation.isPending,
    savePrefsError: savePrefsMutation.isError,
  };
}
