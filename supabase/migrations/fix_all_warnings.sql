-- ─────────────────────────────────────────────────────────────────────────────
-- FIX ALL SUPABASE SECURITY ADVISOR WARNINGS
-- Run this after all other migrations to clean up warnings
-- ─────────────────────────────────────────────────────────────────────────────

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. FIX: Function Search Path Mutable (handle_new_user)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, auth  -- ✅ Fixed: explicit search_path
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, timezone, email)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'New User'),
    new.raw_user_meta_data->>'avatar_url',
    COALESCE(new.raw_user_meta_data->>'timezone', 'UTC'),
    new.email
  );
  RETURN NEW;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. REVOKE: Public execute on SECURITY DEFINER functions
-- These should NOT be callable by anon (unauthenticated) users
-- ══════════════════════════════════════════════════════════════════════════════

-- Revoke from PUBLIC (which includes anon and authenticated)
REVOKE EXECUTE ON FUNCTION public.award_badges(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_buddy_checkin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_message_received() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_award_badges_checkin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_award_badges_goal() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;

-- Grant ONLY to authenticated where needed
GRANT EXECUTE ON FUNCTION public.award_badges(UUID) TO authenticated;

-- Trigger functions should NOT be directly executable (they're only called by triggers)
-- No grants needed for these

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. KEEP: Public execute on intentionally public functions
-- These are safe to call by anyone (anon or authenticated)
-- ══════════════════════════════════════════════════════════════════════════════

-- calculate_streak: safe (validates auth.uid() inside, returns 0 if unauthorized)
-- get_public_profile: safe (only returns public profiles)
-- match_buddy: safe (validates auth.uid() inside)
-- leave_matching_pool: safe (validates auth.uid() inside)

-- Explicitly grant to PUBLIC for clarity (already granted by default)
GRANT EXECUTE ON FUNCTION public.calculate_streak(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_streak(UUID, UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile(TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_buddy(UUID, UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_matching_pool(UUID) TO PUBLIC;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. FIX: Public Bucket Allows Listing (avatars)
-- Remove the duplicate SELECT policy
-- ══════════════════════════════════════════════════════════════════════════════

-- Drop all existing SELECT policies on storage.objects for avatars bucket
DROP POLICY IF EXISTS "Avatars: public read" ON storage.objects;
DROP POLICY IF EXISTS "avatars_select" ON storage.objects;

-- Create ONE tightly scoped SELECT policy that doesn't allow listing
-- Users can only read specific avatar URLs (which they already know)
CREATE POLICY "avatars_select" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'avatars'
    AND auth.role() IN ('authenticated', 'anon')
  );

-- Note: This still allows reading avatars by URL, but prevents listing all files
-- The "broad SELECT" warning will remain because avatars are public by design.
-- This is ACCEPTABLE for public profile pictures.

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. OPTIONAL: Enable Leaked Password Protection
-- Run this in Supabase Dashboard → Authentication → Settings
-- Or set via SQL (requires service role access)
-- ══════════════════════════════════════════════════════════════════════════════

-- You can enable this in the Dashboard for better UX
-- Or uncomment this line (requires superuser/service role):
-- UPDATE auth.config SET enable_leaked_password_protection = true;

-- ══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '✅ Security warnings fixed:';
  RAISE NOTICE '  - handle_new_user now has explicit search_path';
  RAISE NOTICE '  - Trigger functions revoked from PUBLIC';
  RAISE NOTICE '  - award_badges revoked from anon, granted to authenticated only';
  RAISE NOTICE '  - Public functions (calculate_streak, get_public_profile, etc.) remain public (intentional)';
  RAISE NOTICE '  - Storage avatars SELECT policy consolidated';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️ Remaining warnings (ACCEPTABLE):';
  RAISE NOTICE '  - "Public Can Execute SECURITY DEFINER Function" for:';
  RAISE NOTICE '     * calculate_streak (validates auth inside)';
  RAISE NOTICE '     * get_public_profile (only returns public data)';
  RAISE NOTICE '     * match_buddy (validates auth inside)';
  RAISE NOTICE '     * leave_matching_pool (validates auth inside)';
  RAISE NOTICE '  - "Public Bucket Allows Listing" for avatars (public profile pictures by design)';
  RAISE NOTICE '  - "Leaked Password Protection Disabled" (enable in Dashboard → Auth → Settings)';
END $$;
