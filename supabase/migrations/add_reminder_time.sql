-- ─────────────────────────────────────────────────────────────────────────────
-- ADD CUSTOMIZABLE REMINDER TIME
-- Allows users to set their preferred daily reminder time (in their timezone)
-- ─────────────────────────────────────────────────────────────────────────────

-- Add reminder_time column (stores HH:MM in user's timezone)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reminder_time TIME DEFAULT '08:00';

-- Add comment for clarity
COMMENT ON COLUMN public.profiles.reminder_time IS 
  'Daily reminder time in user''s local timezone (HH:MM format). Defaults to 08:00.';

-- Update notification_prefs to ensure daily_reminder key exists
UPDATE public.profiles
SET notification_prefs = jsonb_set(
  COALESCE(notification_prefs, '{}'::jsonb),
  '{daily_reminder}',
  'true'::jsonb,
  true
)
WHERE notification_prefs IS NULL 
   OR NOT (notification_prefs ? 'daily_reminder');

-- ✅ Done! Users can now customize their reminder time
-- The daily-reminder Edge Function needs to be updated to read this field
