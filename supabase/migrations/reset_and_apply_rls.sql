-- ─────────────────────────────────────────────────────────────────────────────
-- CLEAN SLATE: Drop and recreate the goal_buddies view with security fix
-- Run this if you get "policy already exists" errors when re-running supabase_setup.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the view first (it might have dependencies)
DROP VIEW IF EXISTS public.goal_buddies CASCADE;

-- Recreate with security_invoker
CREATE OR REPLACE VIEW public.goal_buddies
  WITH (security_invoker = on)
AS
SELECT goal_id, sender_id AS user_id, receiver_id AS buddy_id
FROM public.buddy_requests
WHERE status = 'accepted'
UNION
SELECT goal_id, receiver_id AS user_id, sender_id AS buddy_id
FROM public.buddy_requests
WHERE status = 'accepted';

-- Grant access only to authenticated users
GRANT SELECT ON public.goal_buddies TO authenticated;
REVOKE SELECT ON public.goal_buddies FROM anon, public;

-- ✅ Done! The CRITICAL security warning should now be resolved.
-- Re-run your full supabase_setup.sql if you need to apply other changes.
