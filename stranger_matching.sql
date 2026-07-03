-- ─────────────────────────────────────────────────────────────────────────────
-- STRANGER MATCHING SYSTEM  (v2 — fixes cross-goal buddy visibility)
-- Run AFTER supabase_setup.sql
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. matching_pool table
CREATE TABLE IF NOT EXISTS public.matching_pool (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  goal_id    UUID        NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  category   TEXT        NOT NULL,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_matched BOOLEAN     NOT NULL DEFAULT FALSE
);

ALTER TABLE public.matching_pool ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pool: users can select own entry"  ON public.matching_pool;
DROP POLICY IF EXISTS "Pool: users can insert own entry"  ON public.matching_pool;
DROP POLICY IF EXISTS "Pool: users can update own entry"  ON public.matching_pool;
DROP POLICY IF EXISTS "Pool: users can delete own entry"  ON public.matching_pool;

CREATE POLICY "Pool: users can select own entry"
  ON public.matching_pool FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Pool: users can insert own entry"
  ON public.matching_pool FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Pool: users can update own entry"
  ON public.matching_pool FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Pool: users can delete own entry"
  ON public.matching_pool FOR DELETE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. match_buddy function  (v2)
--
-- KEY FIX: When a match is found, we now create TWO buddy_requests:
--   (a) goal_id = p_goal_id    (caller's goal)   — so caller can see buddy
--   (b) goal_id = matched_goal_id (partner's goal) — so partner can see buddy
--
-- Both are inserted as status = 'accepted' so no manual approval is needed.
-- The buddy_requests unique constraint is (goal_id, sender_id, receiver_id),
-- so these two rows are distinct.
--
-- Returns JSON:
--   matched  BOOLEAN — true = instant match, false = queued
--   buddy    JSONB   — matched user's profile (null when queued)
--   goal_id  UUID    — the goal_id used for the match (caller's goal)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_buddy(
  p_user_id UUID,
  p_goal_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category        TEXT;
  v_match_row       public.matching_pool%ROWTYPE;
  v_buddy_profile   JSON;
  v_existing_match  public.buddy_requests%ROWTYPE;
BEGIN
  -- ── Auth guard ────────────────────────────────────────────────────────────
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- ── Resolve category from caller's goal ───────────────────────────────────
  SELECT category INTO v_category
  FROM public.goals
  WHERE id = p_goal_id AND user_id = p_user_id;

  IF v_category IS NULL THEN
    RAISE EXCEPTION 'Goal not found or does not belong to user';
  END IF;

  -- ── (1) Already matched on this goal? Return existing buddy ───────────────
  SELECT * INTO v_existing_match
  FROM public.buddy_requests
  WHERE goal_id = p_goal_id
    AND status  = 'accepted'
    AND (sender_id = p_user_id OR receiver_id = p_user_id)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing_match.sender_id = p_user_id THEN
      SELECT row_to_json(p) INTO v_buddy_profile
      FROM public.profiles p WHERE p.id = v_existing_match.receiver_id;
    ELSE
      SELECT row_to_json(p) INTO v_buddy_profile
      FROM public.profiles p WHERE p.id = v_existing_match.sender_id;
    END IF;

    RETURN json_build_object('matched', TRUE, 'buddy', v_buddy_profile);
  END IF;

  -- ── (2) Find oldest waiting pool entry in same category ───────────────────
  SELECT * INTO v_match_row
  FROM public.matching_pool
  WHERE category   = v_category
    AND is_matched = FALSE
    AND user_id   <> p_user_id
  ORDER BY joined_at ASC
  LIMIT 1;

  IF FOUND THEN
    -- ── (3a) Instant match ────────────────────────────────────────────────
    --  Row A: on caller's goal — caller is sender, partner is receiver
    INSERT INTO public.buddy_requests (goal_id, sender_id, receiver_id, status)
    VALUES (p_goal_id, p_user_id, v_match_row.user_id, 'accepted')
    ON CONFLICT (goal_id, sender_id, receiver_id) DO UPDATE SET status = 'accepted';

    --  Row B: on partner's goal — partner is sender, caller is receiver
    --  This lets the partner see the buddy on THEIR goal page
    INSERT INTO public.buddy_requests (goal_id, sender_id, receiver_id, status)
    VALUES (v_match_row.goal_id, v_match_row.user_id, p_user_id, 'accepted')
    ON CONFLICT (goal_id, sender_id, receiver_id) DO UPDATE SET status = 'accepted';

    -- Mark partner's pool entry as matched and remove caller from pool
    UPDATE public.matching_pool SET is_matched = TRUE WHERE id = v_match_row.id;
    DELETE FROM public.matching_pool WHERE user_id = p_user_id;

    -- Return partner's profile
    SELECT row_to_json(p) INTO v_buddy_profile
    FROM public.profiles p WHERE p.id = v_match_row.user_id;

    RETURN json_build_object('matched', TRUE, 'buddy', v_buddy_profile);
  END IF;

  -- ── (3b) No partner yet — join the pool ───────────────────────────────────
  INSERT INTO public.matching_pool (user_id, goal_id, category, is_matched)
  VALUES (p_user_id, p_goal_id, v_category, FALSE)
  ON CONFLICT (user_id) DO UPDATE
    SET goal_id   = EXCLUDED.goal_id,
        category  = EXCLUDED.category,
        joined_at = NOW(),
        is_matched = FALSE;

  RETURN json_build_object('matched', FALSE, 'buddy', NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_buddy(UUID, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. leave_matching_pool
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.leave_matching_pool(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  DELETE FROM public.matching_pool WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_matching_pool(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Also update the goals SELECT policy to allow buddy reads on BOTH goals
--    (the existing policy in supabase_setup.sql already does this via
--    buddy_requests, so both rows created above will grant access correctly)
-- ─────────────────────────────────────────────────────────────────────────────
