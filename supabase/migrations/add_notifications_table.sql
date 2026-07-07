-- ─────────────────────────────────────────────────────────────────────────────
-- NOTIFICATIONS TABLE
-- Replaces the push_subscriptions + VAPID push system.
-- All notification events (messages, check-ins, buddy requests, challenges)
-- are stored here so the user can view them in-app and they are also sent
-- to the user's email via the send-email edge function.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop the old push_subscriptions table if it still exists
DROP TABLE IF EXISTS public.push_subscriptions CASCADE;

-- 2. Remove push-specific columns / defaults from profiles
--    (notification_prefs stays but its keys will be updated)
ALTER TABLE public.profiles
  ALTER COLUMN notification_prefs
  SET DEFAULT '{"daily_reminder":true,"buddy_checkin":true,"messages":true,"challenges":true}'::jsonb;

-- 3. Create the notifications inbox table
CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text        NOT NULL,   -- 'message' | 'checkin' | 'buddy_request' | 'challenge' | 'daily_reminder'
  title       text        NOT NULL,
  body        text        NOT NULL,
  url         text        NOT NULL DEFAULT '/dashboard',
  read        boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast per-user queries (inbox view)
CREATE INDEX IF NOT EXISTS notifications_user_id_idx
  ON public.notifications (user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own notifications
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT WITH CHECK (true);  -- edge functions use service role; client inserts for self

DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;
CREATE POLICY "notifications_delete" ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);
