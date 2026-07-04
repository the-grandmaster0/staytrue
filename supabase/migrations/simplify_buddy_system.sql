-- ─────────────────────────────────────────────────────────────────────────────
-- SIMPLIFY BUDDY SYSTEM
-- Makes buddy_requests user-to-user (removes goal_id coupling).
--
-- Run this ONCE in Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 1: Drop everything that depends on buddy_requests.goal_id ───────────
-- (must happen before the column drop)

-- View
DROP VIEW IF EXISTS public.goal_buddies CASCADE;

-- Policies on buddy_requests that reference goal_id
DROP POLICY IF EXISTS "buddy_requests_insert"                   ON public.buddy_requests;
DROP POLICY IF EXISTS "Buddy requests: sender can insert"       ON public.buddy_requests;
DROP POLICY IF EXISTS "Buddy requests: parties can view"        ON public.buddy_requests;
DROP POLICY IF EXISTS "Buddy requests: receiver can update"     ON public.buddy_requests;
DROP POLICY IF EXISTS "Buddy requests: parties can delete"      ON public.buddy_requests;

-- Policies on goals that reference buddy_requests.goal_id
DROP POLICY IF EXISTS "Allow users to read goals"               ON public.goals;
DROP POLICY IF EXISTS "goals_select"                            ON public.goals;

-- Policies on checkins that reference buddy_requests.goal_id
DROP POLICY IF EXISTS "Allow users to read checkins"            ON public.checkins;
DROP POLICY IF EXISTS "checkins_select"                         ON public.checkins;

-- ── Step 2: Drop old constraints and the goal_id column ──────────────────────

ALTER TABLE public.buddy_requests
  DROP CONSTRAINT IF EXISTS buddy_requests_goal_sender_receiver_unique;

ALTER TABLE public.buddy_requests
  DROP CONSTRAINT IF EXISTS buddy_requests_goal_id_fkey;

-- Now safe to drop — all dependents are gone
ALTER TABLE public.buddy_requests
  DROP COLUMN IF EXISTS goal_id;

-- ── Step 3: Add new unique constraint (sender, receiver) ─────────────────────

ALTER TABLE public.buddy_requests
  DROP CONSTRAINT IF EXISTS buddy_requests_sender_receiver_unique;

ALTER TABLE public.buddy_requests
  ADD CONSTRAINT buddy_requests_sender_receiver_unique
  UNIQUE (sender_id, receiver_id);

-- ── Step 4: Recreate buddy_requests RLS policies (no goal_id) ────────────────

CREATE POLICY "buddy_requests_insert"
  ON public.buddy_requests FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Buddy requests: parties can view"
  ON public.buddy_requests FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Buddy requests: receiver can update"
  ON public.buddy_requests FOR UPDATE
  USING (auth.uid() = receiver_id);

CREATE POLICY "Buddy requests: parties can delete"
  ON public.buddy_requests FOR DELETE
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- ── Step 5: Recreate goals SELECT policy ────────────────────────────────────
-- A user can read a goal if they own it OR if they are an accepted buddy
-- of the goal owner (user-to-user relationship, no goal_id needed).

CREATE POLICY "goals_select"
  ON public.goals FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.buddy_requests br
      WHERE br.status = 'accepted'
        AND (
          (br.sender_id   = auth.uid() AND br.receiver_id = goals.user_id)
          OR
          (br.receiver_id = auth.uid() AND br.sender_id   = goals.user_id)
        )
    )
  );

-- ── Step 6: Recreate checkins SELECT policy ──────────────────────────────────
-- A user can read checkins for a goal if they own the goal OR are an accepted buddy.

CREATE POLICY "checkins_select"
  ON public.checkins FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.goals g
      WHERE g.id = checkins.goal_id
        AND EXISTS (
          SELECT 1 FROM public.buddy_requests br
          WHERE br.status = 'accepted'
            AND (
              (br.sender_id   = auth.uid() AND br.receiver_id = g.user_id)
              OR
              (br.receiver_id = auth.uid() AND br.sender_id   = g.user_id)
            )
        )
    )
  );

-- ── Step 7: Recreate goal_buddies view (no goal_id) ──────────────────────────

CREATE VIEW public.goal_buddies
  WITH (security_invoker = on)
AS
SELECT sender_id AS user_id, receiver_id AS buddy_id
FROM public.buddy_requests
WHERE status = 'accepted'
UNION
SELECT receiver_id AS user_id, sender_id AS buddy_id
FROM public.buddy_requests
WHERE status = 'accepted';

GRANT SELECT ON public.goal_buddies TO authenticated;
REVOKE SELECT ON public.goal_buddies FROM anon, public;

-- ── Step 8: Update match_buddy function (single-row insert, no goal_id) ──────

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
  v_category          TEXT;
  v_match_row         public.matching_pool%ROWTYPE;
  v_buddy_profile     JSON;
  v_existing_sender   UUID;
  v_existing_receiver UUID;
BEGIN
  -- Auth guard
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Resolve category from caller's goal
  SELECT category INTO v_category
  FROM public.goals
  WHERE id = p_goal_id AND user_id = p_user_id;

  IF v_category IS NULL THEN
    RAISE EXCEPTION 'Goal not found or does not belong to user';
  END IF;

  -- Already buddies with someone?
  SELECT sender_id, receiver_id INTO v_existing_sender, v_existing_receiver
  FROM public.buddy_requests
  WHERE status = 'accepted'
    AND (sender_id = p_user_id OR receiver_id = p_user_id)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing_sender = p_user_id THEN
      SELECT row_to_json(p) INTO v_buddy_profile
      FROM public.profiles p WHERE p.id = v_existing_receiver;
    ELSE
      SELECT row_to_json(p) INTO v_buddy_profile
      FROM public.profiles p WHERE p.id = v_existing_sender;
    END IF;
    RETURN json_build_object('matched', TRUE, 'buddy', v_buddy_profile);
  END IF;

  -- Find oldest waiting pool entry in same category
  SELECT * INTO v_match_row
  FROM public.matching_pool
  WHERE category   = v_category
    AND is_matched = FALSE
    AND user_id   <> p_user_id
  ORDER BY joined_at ASC
  LIMIT 1;

  IF FOUND THEN
    -- Single row insert — no goal_id
    INSERT INTO public.buddy_requests (sender_id, receiver_id, status)
    VALUES (p_user_id, v_match_row.user_id, 'accepted')
    ON CONFLICT (sender_id, receiver_id) DO UPDATE SET status = 'accepted';

    UPDATE public.matching_pool SET is_matched = TRUE WHERE id = v_match_row.id;
    DELETE FROM public.matching_pool WHERE user_id = p_user_id;

    SELECT row_to_json(p) INTO v_buddy_profile
    FROM public.profiles p WHERE p.id = v_match_row.user_id;

    RETURN json_build_object('matched', TRUE, 'buddy', v_buddy_profile);
  END IF;

  -- No partner yet — join the pool (pool still tracks goal_id for category lookup)
  INSERT INTO public.matching_pool (user_id, goal_id, category, is_matched)
  VALUES (p_user_id, p_goal_id, v_category, FALSE)
  ON CONFLICT (user_id) DO UPDATE
    SET goal_id    = EXCLUDED.goal_id,
        category   = EXCLUDED.category,
        joined_at  = NOW(),
        is_matched = FALSE;

  RETURN json_build_object('matched', FALSE, 'buddy', NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_buddy(UUID, UUID) TO authenticated;
