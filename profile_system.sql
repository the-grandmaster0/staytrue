-- ─────────────────────────────────────────────────────────────────────────────
-- PROFILE SYSTEM
-- Run AFTER supabase_setup.sql
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Extend profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username       TEXT,
  ADD COLUMN IF NOT EXISTS bio            TEXT CHECK (char_length(bio) <= 160),
  ADD COLUMN IF NOT EXISTS is_public      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB
    NOT NULL DEFAULT '{"daily_reminder":true,"buddy_checkin":true,"messages":true}'::jsonb;

-- Unique constraint on username (case-insensitive via lower())
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- 2. Avatars storage bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage RLS: anyone can read, owner can upload/delete
DROP POLICY IF EXISTS "Avatars: public read"   ON storage.objects;
DROP POLICY IF EXISTS "Avatars: owner upload"  ON storage.objects;
DROP POLICY IF EXISTS "Avatars: owner delete"  ON storage.objects;

CREATE POLICY "Avatars: public read"
  ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Avatars: owner upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Avatars: owner delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 3. badges table
CREATE TABLE IF NOT EXISTS public.badges (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_key  TEXT        NOT NULL,
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT badges_user_key_unique UNIQUE (user_id, badge_key)
);

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Badges: public read"  ON public.badges;
DROP POLICY IF EXISTS "Badges: system insert" ON public.badges;

-- Anyone can read badges (shown on public profiles)
CREATE POLICY "Badges: public read"
  ON public.badges FOR SELECT USING (true);

-- Only SECURITY DEFINER functions can insert (users can't self-award)
CREATE POLICY "Badges: system insert"
  ON public.badges FOR INSERT WITH CHECK (false);

-- 4. award_badges function
CREATE OR REPLACE FUNCTION public.award_badges(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_goal_count      INT;
  v_completed_count INT;
  v_buddy_count     INT;
  v_max_streak      INT;
BEGIN
  -- First Goal: has at least one goal
  SELECT COUNT(*) INTO v_goal_count
    FROM public.goals WHERE user_id = p_user_id;
  IF v_goal_count >= 1 THEN
    INSERT INTO public.badges (user_id, badge_key)
    VALUES (p_user_id, 'first_goal')
    ON CONFLICT (user_id, badge_key) DO NOTHING;
  END IF;

  -- Goal Crusher: first completed goal
  SELECT COUNT(*) INTO v_completed_count
    FROM public.goals WHERE user_id = p_user_id AND status = 'completed';
  IF v_completed_count >= 1 THEN
    INSERT INTO public.badges (user_id, badge_key)
    VALUES (p_user_id, 'goal_crusher')
    ON CONFLICT (user_id, badge_key) DO NOTHING;
  END IF;

  -- Buddy Up: at least one accepted buddy request
  SELECT COUNT(*) INTO v_buddy_count
    FROM public.buddy_requests
    WHERE (sender_id = p_user_id OR receiver_id = p_user_id)
      AND status = 'accepted';
  IF v_buddy_count >= 1 THEN
    INSERT INTO public.badges (user_id, badge_key)
    VALUES (p_user_id, 'buddy_up')
    ON CONFLICT (user_id, badge_key) DO NOTHING;
  END IF;

  -- Social Butterfly: 3+ distinct accepted buddies
  SELECT COUNT(DISTINCT
    CASE WHEN sender_id = p_user_id THEN receiver_id ELSE sender_id END
  ) INTO v_buddy_count
    FROM public.buddy_requests
    WHERE (sender_id = p_user_id OR receiver_id = p_user_id)
      AND status = 'accepted';
  IF v_buddy_count >= 3 THEN
    INSERT INTO public.badges (user_id, badge_key)
    VALUES (p_user_id, 'social_butterfly')
    ON CONFLICT (user_id, badge_key) DO NOTHING;
  END IF;

  -- Check-In Streak 7 & Marathoner (30): check longest daily streak across all goals
  SELECT COALESCE(MAX(streak_len), 0) INTO v_max_streak
  FROM (
    SELECT
      goal_id,
      checkin_date,
      checkin_date - (ROW_NUMBER() OVER (
        PARTITION BY goal_id ORDER BY checkin_date
      ) * INTERVAL '1 day') AS grp
    FROM (
      SELECT DISTINCT goal_id, checkin_date
      FROM public.checkins
      WHERE user_id = p_user_id
    ) t
  ) grouped
  GROUP BY goal_id, grp
  HAVING COUNT(*) = (
    SELECT COUNT(DISTINCT checkin_date)
    FROM public.checkins
    WHERE user_id = p_user_id
      AND goal_id = grouped.goal_id
      AND checkin_date - (ROW_NUMBER() OVER (
            PARTITION BY goal_id ORDER BY checkin_date
          ) * INTERVAL '1 day') = grp
  );

  -- Simpler approach: count max consecutive days globally
  SELECT COALESCE(MAX(cnt), 0) INTO v_max_streak
  FROM (
    SELECT COUNT(*) AS cnt
    FROM (
      SELECT
        checkin_date,
        checkin_date - (ROW_NUMBER() OVER (ORDER BY checkin_date) * INTERVAL '1 day') AS grp
      FROM (
        SELECT DISTINCT checkin_date
        FROM public.checkins
        WHERE user_id = p_user_id
      ) d
    ) g
    GROUP BY grp
  ) streaks;

  IF v_max_streak >= 7 THEN
    INSERT INTO public.badges (user_id, badge_key)
    VALUES (p_user_id, 'streak_7')
    ON CONFLICT (user_id, badge_key) DO NOTHING;
  END IF;

  IF v_max_streak >= 30 THEN
    INSERT INTO public.badges (user_id, badge_key)
    VALUES (p_user_id, 'marathoner')
    ON CONFLICT (user_id, badge_key) DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_badges(UUID) TO authenticated;

-- 5. Trigger: award badges after checkin insert
CREATE OR REPLACE FUNCTION public.trigger_award_badges_checkin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.award_badges(NEW.user_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_checkin_award_badges ON public.checkins;
CREATE TRIGGER on_checkin_award_badges
  AFTER INSERT ON public.checkins
  FOR EACH ROW EXECUTE FUNCTION public.trigger_award_badges_checkin();

-- 6. Trigger: award badges after goal status update
CREATE OR REPLACE FUNCTION public.trigger_award_badges_goal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.award_badges(NEW.user_id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_goal_update_award_badges ON public.goals;
CREATE TRIGGER on_goal_update_award_badges
  AFTER UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.trigger_award_badges_goal();

-- 7. Helper: public profile view (used by /u/:username)
CREATE OR REPLACE FUNCTION public.get_public_profile(p_username TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile  public.profiles%ROWTYPE;
  v_result   JSON;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE lower(username) = lower(p_username)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT v_profile.is_public THEN
    RETURN json_build_object('is_private', true, 'id', v_profile.id);
  END IF;

  SELECT json_build_object(
    'id',            v_profile.id,
    'username',      v_profile.username,
    'full_name',     v_profile.full_name,
    'avatar_url',    v_profile.avatar_url,
    'bio',           v_profile.bio,
    'timezone',      v_profile.timezone,
    'created_at',    v_profile.created_at,
    'is_public',     v_profile.is_public,
    'active_goals',  (SELECT COUNT(*) FROM public.goals
                       WHERE user_id = v_profile.id AND status = 'active'),
    'total_checkins',(SELECT COUNT(*) FROM public.checkins
                       WHERE user_id = v_profile.id),
    'longest_streak',(
      SELECT COALESCE(MAX(cnt), 0)
      FROM (
        SELECT COUNT(*) AS cnt
        FROM (
          SELECT checkin_date,
                 checkin_date - (ROW_NUMBER() OVER (ORDER BY checkin_date) * INTERVAL '1 day') AS grp
          FROM (SELECT DISTINCT checkin_date FROM public.checkins WHERE user_id = v_profile.id) d
        ) g GROUP BY grp
      ) s
    ),
    'badges', (
      SELECT json_agg(json_build_object('badge_key', badge_key, 'earned_at', earned_at)
                      ORDER BY earned_at ASC)
      FROM public.badges WHERE user_id = v_profile.id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profile(TEXT) TO anon, authenticated;
