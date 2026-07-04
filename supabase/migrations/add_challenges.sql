-- ─────────────────────────────────────────────────────────────────────────────
-- BUDDY CHALLENGE SYSTEM
-- Run AFTER simplify_buddy_system.sql
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. challenges table
CREATE TABLE IF NOT EXISTS public.challenges (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  opponent_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category         TEXT        NOT NULL,
  duration_days    INT         NOT NULL DEFAULT 7 CHECK (duration_days IN (7, 14, 30)),
  start_date       DATE,
  end_date         DATE,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'active', 'completed', 'declined')),
  challenger_score INT         NOT NULL DEFAULT 0,
  opponent_score   INT         NOT NULL DEFAULT 0,
  winner_id        UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- prevent duplicate active challenges between the same pair
  CONSTRAINT challenges_unique_active
    UNIQUE NULLS NOT DISTINCT (challenger_id, opponent_id, status)
);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

-- Parties can read their own challenges
DROP POLICY IF EXISTS "challenges_select" ON public.challenges;
CREATE POLICY "challenges_select"
  ON public.challenges FOR SELECT
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);

-- Only challenger can create
DROP POLICY IF EXISTS "challenges_insert" ON public.challenges;
CREATE POLICY "challenges_insert"
  ON public.challenges FOR INSERT
  WITH CHECK (auth.uid() = challenger_id);

-- Either party can update (accept/decline/score updates go through the function)
DROP POLICY IF EXISTS "challenges_update" ON public.challenges;
CREATE POLICY "challenges_update"
  ON public.challenges FOR UPDATE
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);

-- Either party can delete a pending challenge
DROP POLICY IF EXISTS "challenges_delete" ON public.challenges;
CREATE POLICY "challenges_delete"
  ON public.challenges FOR DELETE
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);

-- 2. Enable realtime for live score updates
ALTER TABLE public.challenges REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.challenges;

-- 3. Function: respond to a challenge (accept/decline)
CREATE OR REPLACE FUNCTION public.respond_challenge(
  p_challenge_id UUID,
  p_status       TEXT   -- 'active' (accept) or 'declined'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge public.challenges%ROWTYPE;
  v_start     DATE;
  v_end       DATE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_status NOT IN ('active', 'declined') THEN RAISE EXCEPTION 'Invalid status'; END IF;

  SELECT * INTO v_challenge FROM public.challenges
  WHERE id = p_challenge_id AND opponent_id = auth.uid() AND status = 'pending';

  IF NOT FOUND THEN RAISE EXCEPTION 'Challenge not found or not pending'; END IF;

  IF p_status = 'active' THEN
    v_start := CURRENT_DATE;
    v_end   := CURRENT_DATE + v_challenge.duration_days;
    UPDATE public.challenges
    SET status = 'active', start_date = v_start, end_date = v_end
    WHERE id = p_challenge_id;
  ELSE
    UPDATE public.challenges SET status = 'declined' WHERE id = p_challenge_id;
  END IF;

  RETURN json_build_object('ok', TRUE, 'status', p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_challenge(UUID, TEXT) TO authenticated;

-- 4. Function: refresh scores for an active challenge
--    Call this after every check-in to update scores in realtime.
CREATE OR REPLACE FUNCTION public.refresh_challenge_scores(
  p_challenge_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge      public.challenges%ROWTYPE;
  v_challenger_score INT;
  v_opponent_score   INT;
  v_winner_id        UUID;
BEGIN
  SELECT * INTO v_challenge FROM public.challenges
  WHERE id = p_challenge_id AND status = 'active';

  IF NOT FOUND THEN RETURN json_build_object('ok', FALSE, 'reason', 'not active'); END IF;

  -- Count checkins per user in the challenge category during the window
  SELECT COUNT(DISTINCT c.checked_in_at::date) INTO v_challenger_score
  FROM public.checkins c
  JOIN public.goals g ON g.id = c.goal_id
  WHERE c.user_id = v_challenge.challenger_id
    AND g.category = v_challenge.category
    AND c.checked_in_at::date BETWEEN v_challenge.start_date AND v_challenge.end_date;

  SELECT COUNT(DISTINCT c.checked_in_at::date) INTO v_opponent_score
  FROM public.checkins c
  JOIN public.goals g ON g.id = c.goal_id
  WHERE c.user_id = v_challenge.opponent_id
    AND g.category = v_challenge.category
    AND c.checked_in_at::date BETWEEN v_challenge.start_date AND v_challenge.end_date;

  -- Check if challenge period has ended
  IF CURRENT_DATE > v_challenge.end_date THEN
    IF v_challenger_score > v_opponent_score THEN
      v_winner_id := v_challenge.challenger_id;
    ELSIF v_opponent_score > v_challenger_score THEN
      v_winner_id := v_challenge.opponent_id;
    ELSE
      v_winner_id := NULL; -- tie
    END IF;

    UPDATE public.challenges
    SET challenger_score = v_challenger_score,
        opponent_score   = v_opponent_score,
        winner_id        = v_winner_id,
        status           = 'completed'
    WHERE id = p_challenge_id;
  ELSE
    UPDATE public.challenges
    SET challenger_score = v_challenger_score,
        opponent_score   = v_opponent_score
    WHERE id = p_challenge_id;
  END IF;

  RETURN json_build_object('ok', TRUE,
    'challenger_score', v_challenger_score,
    'opponent_score', v_opponent_score
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_challenge_scores(UUID) TO authenticated;
