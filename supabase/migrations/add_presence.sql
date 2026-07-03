-- ─────────────────────────────────────────────────────────────────────────────
-- PRESENCE / AVAILABILITY SYSTEM
-- Adds last_seen_at to profiles for persistent "last seen" display.
-- The live "online now" layer uses Supabase Presence (no extra table needed).
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add last_seen_at column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- 2. Index for fast "who's been online recently?" queries
CREATE INDEX IF NOT EXISTS profiles_last_seen_at_idx
  ON public.profiles (last_seen_at DESC NULLS LAST);

-- 3. Enable profiles table for realtime (so presence dots update live)
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- 4. RLS: users can update only their own last_seen_at
-- (profiles table should already have RLS enabled from profile_system.sql)
DROP POLICY IF EXISTS "Users can update own last_seen_at" ON public.profiles;
CREATE POLICY "Users can update own last_seen_at"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
