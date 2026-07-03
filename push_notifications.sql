-- ─────────────────────────────────────────────────────────────────────────────
-- PUSH NOTIFICATIONS SYSTEM
-- Run AFTER supabase_setup.sql and messages.sql
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. push_subscriptions table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint   TEXT        NOT NULL,
  p256dh     TEXT        NOT NULL,
  auth       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT push_subscriptions_user_endpoint_unique UNIQUE (user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Push: users manage own subscriptions select" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Push: users manage own subscriptions insert" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Push: users manage own subscriptions update" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Push: users manage own subscriptions delete" ON public.push_subscriptions;

CREATE POLICY "Push: users manage own subscriptions select"
  ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Push: users manage own subscriptions insert"
  ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Push: users manage own subscriptions update"
  ON public.push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Push: users manage own subscriptions delete"
  ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. notification_prefs JSONB column on profiles
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB
  NOT NULL DEFAULT '{"daily_reminder":true,"buddy_checkin":true,"messages":true}'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. notify_buddy_checkin trigger
--    Only fires net.http_post if app.supabase_url is configured.
--    If not configured, the insert still succeeds — push is skipped silently.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_buddy_checkin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_goal_title   TEXT;
  v_sender_name  TEXT;
  v_buddy_id     UUID;
  v_supabase_url TEXT;
  v_service_key  TEXT;
BEGIN
  -- Resolve URL and key — bail out silently if not configured
  BEGIN
    SELECT decrypted_secret INTO v_supabase_url
      FROM vault.decrypted_secrets WHERE name = 'supabase_url';
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := current_setting('app.supabase_url', true);
  END;

  -- If URL is null or empty, skip push and let the insert succeed
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    RETURN NEW;
  END IF;

  v_service_key := current_setting('app.service_role_key', true);
  IF v_service_key IS NULL OR v_service_key = '' THEN
    RETURN NEW;
  END IF;

  SELECT title INTO v_goal_title FROM public.goals WHERE id = NEW.goal_id;
  SELECT COALESCE(full_name, email, 'Your buddy') INTO v_sender_name
    FROM public.profiles WHERE id = NEW.user_id;

  FOR v_buddy_id IN
    SELECT CASE WHEN br.sender_id = NEW.user_id
                THEN br.receiver_id ELSE br.sender_id END
    FROM public.buddy_requests br
    WHERE br.goal_id = NEW.goal_id
      AND br.status  = 'accepted'
      AND (br.sender_id = NEW.user_id OR br.receiver_id = NEW.user_id)
  LOOP
    PERFORM net.http_post(
      url     := v_supabase_url || '/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := jsonb_build_object(
        'user_id',  v_buddy_id,
        'title',    v_sender_name || ' checked in!',
        'body',     'They logged progress on "' || v_goal_title || '"',
        'url',      '/dashboard/goals/' || NEW.goal_id,
        'pref_key', 'buddy_checkin'
      )
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let push errors block the main insert
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_checkin_inserted ON public.checkins;
CREATE TRIGGER on_checkin_inserted
  AFTER INSERT ON public.checkins
  FOR EACH ROW EXECUTE FUNCTION public.notify_buddy_checkin();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. notify_message_received trigger
--    Same guard: skip push silently if URL/key not configured.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_message_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_name  TEXT;
  v_goal_title   TEXT;
  v_supabase_url TEXT;
  v_service_key  TEXT;
BEGIN
  -- Bail out silently if push is not configured
  BEGIN
    SELECT decrypted_secret INTO v_supabase_url
      FROM vault.decrypted_secrets WHERE name = 'supabase_url';
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := current_setting('app.supabase_url', true);
  END;

  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    RETURN NEW;
  END IF;

  v_service_key := current_setting('app.service_role_key', true);
  IF v_service_key IS NULL OR v_service_key = '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, email, 'Someone') INTO v_sender_name
    FROM public.profiles WHERE id = NEW.sender_id;
  SELECT title INTO v_goal_title FROM public.goals WHERE id = NEW.goal_id;

  PERFORM net.http_post(
    url     := v_supabase_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := jsonb_build_object(
      'user_id',  NEW.receiver_id,
      'title',    'New message from ' || v_sender_name,
      'body',     LEFT(NEW.content, 80),
      'url',      '/dashboard/goals/' || NEW.goal_id,
      'pref_key', 'messages'
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let push errors block the message insert
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_inserted ON public.messages;
CREATE TRIGGER on_message_inserted
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_message_received();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. pg_cron hourly reminder — checks each hour for users whose reminder_time
--    matches the current hour in their timezone.
--    Uncomment after enabling pg_cron extension and setting app settings.
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT cron.schedule(
--   'hourly-push-reminder',
--   '0 * * * *',           -- every hour on the hour
--   $$
--   SELECT net.http_post(
--     url     := current_setting('app.supabase_url') || '/functions/v1/daily-reminder',
--     headers := jsonb_build_object(
--       'Content-Type',  'application/json',
--       'Authorization', 'Bearer ' || current_setting('app.service_role_key')
--     ),
--     body    := '{}'::jsonb
--   );
--   $$
-- );
