-- ─────────────────────────────────────────────────────────────────────────────
-- CHALLENGE NOTIFICATIONS
-- Run AFTER add_challenges.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add 'challenges' key to notification_prefs default and existing rows
ALTER TABLE public.profiles
  ALTER COLUMN notification_prefs
  SET DEFAULT '{"daily_reminder":true,"buddy_checkin":true,"messages":true,"challenges":true}'::jsonb;

-- Back-fill existing rows that don't have the challenges key yet
UPDATE public.profiles
SET notification_prefs = notification_prefs || '{"challenges":true}'::jsonb
WHERE NOT (notification_prefs ? 'challenges');

-- 2. Database webhook — fires notify-challenge edge function on INSERT/UPDATE
--    Create this via the Supabase Dashboard → Database → Webhooks:
--
--    Name:   notify-challenge
--    Table:  public.challenges
--    Events: INSERT, UPDATE
--    URL:    https://<your-project-ref>.supabase.co/functions/v1/notify-challenge
--    Headers:
--      Authorization: Bearer <service_role_key>
--      Content-Type:  application/json
--
-- NOTE: Supabase does not support creating webhooks via SQL in the free tier.
-- Use the Dashboard UI as described above.
-- The function is deployed alongside daily-reminder and send-push.
