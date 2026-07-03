-- accountability-app — full Supabase schema
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
DROP POLICY IF EXISTS "Allow individual read access" ON public.profiles;
DROP POLICY IF EXISTS "Allow individual update access" ON public.profiles;
DROP POLICY IF EXISTS "Allow individual insert access" ON public.profiles;

CREATE POLICY "Allow individual read access"
  ON public.profiles 
  FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Allow individual update access"
  ON public.profiles 
  FOR UPDATE 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow individual insert access"
  ON public.profiles 
  FOR INSERT 
  WITH CHECK (auth.uid() = id);

-- Create a function to handle new signup and create profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, timezone)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'New User'),
    new.raw_user_meta_data->>'avatar_url',
    COALESCE(new.raw_user_meta_data->>'timezone', 'UTC')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user creation
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create goals table
CREATE TABLE IF NOT EXISTS public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title VARCHAR(80) NOT NULL,
  description VARCHAR(300),
  category TEXT NOT NULL CHECK (category IN ('fitness', 'learning', 'mindfulness', 'finance', 'career', 'other')),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'three_per_week', 'weekly')),
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on goals
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

-- Create policies for goals
DROP POLICY IF EXISTS "Allow users to read their own goals" ON public.goals;
DROP POLICY IF EXISTS "Allow users to insert their own goals" ON public.goals;
DROP POLICY IF EXISTS "Allow users to update their own goals" ON public.goals;
DROP POLICY IF EXISTS "Allow users to delete their own goals" ON public.goals;

CREATE POLICY "Allow users to read their own goals"
  ON public.goals
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Allow users to insert their own goals"
  ON public.goals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to update their own goals"
  ON public.goals
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to delete their own goals"
  ON public.goals
  FOR DELETE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────
-- CHECKINS TABLE
-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checkin_date DATE GENERATED ALWAYS AS ((checked_in_at AT TIME ZONE 'UTC')::date) STORED,
  note TEXT CHECK (char_length(note) <= 200),
  CONSTRAINT checkins_goal_user_date_unique UNIQUE (goal_id, user_id, checkin_date)
);

-- Migrate existing checkins table (if created before checkin_date column was added)
ALTER TABLE public.checkins
  ADD COLUMN IF NOT EXISTS checkin_date DATE
  GENERATED ALWAYS AS ((checked_in_at AT TIME ZONE 'UTC')::date) STORED;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'checkins_goal_user_date_unique'
      AND conrelid = 'public.checkins'::regclass
  ) THEN
    ALTER TABLE public.checkins
      ADD CONSTRAINT checkins_goal_user_date_unique UNIQUE (goal_id, user_id, checkin_date);
  END IF;
END $$;

-- Enable RLS on checkins
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;

-- Checkin Policies
DROP POLICY IF EXISTS "Allow users to read their own checkins" ON public.checkins;
DROP POLICY IF EXISTS "Allow users to insert their own checkins" ON public.checkins;
DROP POLICY IF EXISTS "Allow users to delete their own checkins" ON public.checkins;

CREATE POLICY "Allow users to read their own checkins"
  ON public.checkins
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Allow users to insert their own checkins"
  ON public.checkins
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to delete their own checkins"
  ON public.checkins
  FOR DELETE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────
-- STREAK CALCULATION FUNCTION
-- ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calculate_streak(goal_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_frequency TEXT;
  v_current_streak INT := 0;
  v_longest_streak INT := 0;
  v_temp_streak INT := 0;
  v_last_checkin_date DATE := NULL;
  v_prev_date DATE := NULL;
  v_curr_date DATE;
  v_curr_week TEXT;
  v_prev_week TEXT;
  v_checkin_record RECORD;
  v_week_checkins INT := 0;
  v_is_current BOOLEAN := TRUE;
  v_weeks_consecutive BOOLEAN;
  v_prev_year INT;
  v_prev_wk INT;
  v_curr_year INT;
  v_curr_wk INT;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.goals g WHERE g.id = goal_id AND g.user_id = auth.uid()
  ) THEN
    RETURN json_build_object(
      'current_streak', 0,
      'longest_streak', 0,
      'last_checkin_date', NULL
    );
  END IF;

  SELECT frequency INTO v_frequency
  FROM public.goals
  WHERE id = goal_id;

  IF v_frequency IS NULL THEN
    RETURN json_build_object(
      'current_streak', 0,
      'longest_streak', 0,
      'last_checkin_date', NULL
    );
  END IF;

  -- ── DAILY: consecutive day-by-day ──────────────────
  IF v_frequency = 'daily' THEN
    v_is_current := TRUE;
    FOR v_checkin_record IN
      SELECT DISTINCT DATE(checked_in_at AT TIME ZONE 'UTC') AS checkin_date
      FROM public.checkins
      WHERE goal_id = calculate_streak.goal_id
      ORDER BY checkin_date DESC
    LOOP
      v_curr_date := v_checkin_record.checkin_date;
      IF v_last_checkin_date IS NULL THEN
        v_last_checkin_date := v_curr_date;
        v_temp_streak := 1;
        IF v_curr_date < (CURRENT_DATE - INTERVAL '1 day') THEN
          v_is_current := FALSE;
        END IF;
      ELSIF v_prev_date - v_curr_date = 1 THEN
        v_temp_streak := v_temp_streak + 1;
      ELSE
        IF v_is_current THEN
          v_current_streak := v_temp_streak;
          v_is_current := FALSE;
        END IF;
        IF v_temp_streak > v_longest_streak THEN
          v_longest_streak := v_temp_streak;
        END IF;
        v_temp_streak := 1;
      END IF;
      v_prev_date := v_curr_date;
    END LOOP;

    IF v_temp_streak > v_longest_streak THEN
      v_longest_streak := v_temp_streak;
    END IF;
    IF v_is_current THEN
      v_current_streak := v_temp_streak;
    END IF;

  -- ── WEEKLY: one check-in per ISO week ──────────────
  ELSIF v_frequency = 'weekly' THEN
    v_is_current := TRUE;
    FOR v_checkin_record IN
      SELECT DISTINCT TO_CHAR(DATE(checked_in_at AT TIME ZONE 'UTC'), 'IYYY-IW') AS iso_week,
             MAX(DATE(checked_in_at AT TIME ZONE 'UTC')) AS week_date
      FROM public.checkins
      WHERE goal_id = calculate_streak.goal_id
      GROUP BY 1
      ORDER BY 1 DESC
    LOOP
      v_curr_week := v_checkin_record.iso_week;
      v_curr_date := v_checkin_record.week_date;
      IF v_last_checkin_date IS NULL THEN
        v_last_checkin_date := v_curr_date;
        v_temp_streak := 1;
        IF v_curr_week < TO_CHAR(CURRENT_DATE - INTERVAL '7 days', 'IYYY-IW') THEN
          v_is_current := FALSE;
        END IF;
      ELSIF v_prev_week IS NOT NULL THEN
        v_prev_year := SPLIT_PART(v_prev_week, '-', 1)::INT;
        v_prev_wk   := SPLIT_PART(v_prev_week, '-', 2)::INT;
        v_curr_year := SPLIT_PART(v_curr_week, '-', 1)::INT;
        v_curr_wk   := SPLIT_PART(v_curr_week, '-', 2)::INT;
        v_weeks_consecutive := (v_prev_year = v_curr_year AND v_prev_wk - v_curr_wk = 1)
          OR (v_prev_year - v_curr_year = 1 AND v_prev_wk = 1 AND v_curr_wk >= 52);

        IF v_weeks_consecutive THEN
          v_temp_streak := v_temp_streak + 1;
        ELSE
          IF v_is_current THEN
            v_current_streak := v_temp_streak;
            v_is_current := FALSE;
          END IF;
          IF v_temp_streak > v_longest_streak THEN
            v_longest_streak := v_temp_streak;
          END IF;
          v_temp_streak := 1;
        END IF;
      END IF;
      v_prev_week := v_curr_week;
    END LOOP;

    IF v_temp_streak > v_longest_streak THEN v_longest_streak := v_temp_streak; END IF;
    IF v_is_current THEN v_current_streak := v_temp_streak; END IF;

  -- ── THREE_PER_WEEK: 3+ check-ins per consecutive calendar week ─
  ELSE
    v_is_current := TRUE;
    FOR v_checkin_record IN
      SELECT TO_CHAR(DATE(checked_in_at AT TIME ZONE 'UTC'), 'IYYY-IW') AS iso_week,
             COUNT(*) AS cnt,
             MAX(DATE(checked_in_at AT TIME ZONE 'UTC')) AS week_date
      FROM public.checkins
      WHERE goal_id = calculate_streak.goal_id
      GROUP BY 1
      ORDER BY 1 DESC
    LOOP
      v_curr_week := v_checkin_record.iso_week;
      v_curr_date := v_checkin_record.week_date;
      v_week_checkins := v_checkin_record.cnt;

      IF v_last_checkin_date IS NULL THEN
        v_last_checkin_date := v_curr_date;
        IF v_curr_week < TO_CHAR(CURRENT_DATE - INTERVAL '7 days', 'IYYY-IW') THEN
          v_is_current := FALSE;
        END IF;
      END IF;

      IF v_prev_week IS NOT NULL THEN
        v_prev_year := SPLIT_PART(v_prev_week, '-', 1)::INT;
        v_prev_wk   := SPLIT_PART(v_prev_week, '-', 2)::INT;
        v_curr_year := SPLIT_PART(v_curr_week, '-', 1)::INT;
        v_curr_wk   := SPLIT_PART(v_curr_week, '-', 2)::INT;
        v_weeks_consecutive := (v_prev_year = v_curr_year AND v_prev_wk - v_curr_wk = 1)
          OR (v_prev_year - v_curr_year = 1 AND v_prev_wk = 1 AND v_curr_wk >= 52);

        IF NOT v_weeks_consecutive THEN
          IF v_is_current THEN
            v_current_streak := v_temp_streak;
            v_is_current := FALSE;
          END IF;
          IF v_temp_streak > v_longest_streak THEN
            v_longest_streak := v_temp_streak;
          END IF;
          v_temp_streak := 0;
        END IF;
      END IF;

      IF v_week_checkins >= 3 THEN
        v_temp_streak := v_temp_streak + 1;
      ELSIF v_curr_week = TO_CHAR(CURRENT_DATE, 'IYYY-IW') AND v_is_current THEN
        NULL;
      ELSE
        IF v_is_current THEN
          v_current_streak := v_temp_streak;
          v_is_current := FALSE;
        END IF;
        IF v_temp_streak > v_longest_streak THEN
          v_longest_streak := v_temp_streak;
        END IF;
        v_temp_streak := 0;
      END IF;

      v_prev_week := v_curr_week;
    END LOOP;

    IF v_temp_streak > v_longest_streak THEN v_longest_streak := v_temp_streak; END IF;
    IF v_is_current THEN v_current_streak := v_temp_streak; END IF;
  END IF;

  RETURN json_build_object(
    'current_streak', v_current_streak,
    'longest_streak', v_longest_streak,
    'last_checkin_date', v_last_checkin_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_streak(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────
-- BUDDY SYSTEM DATABASE SETUP
-- ─────────────────────────────────────────────────────

-- 1. Alter profiles to support email search
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Update existing profiles with email from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- Update handle_new_user trigger function to include email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update profiles RLS policy to allow reading other profiles for search and details
DROP POLICY IF EXISTS "Allow individual read access" ON public.profiles;
CREATE POLICY "Allow read access to all profiles"
  ON public.profiles
  FOR SELECT
  USING (true);

-- 2. Create buddy_requests table
CREATE TABLE IF NOT EXISTS public.buddy_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT buddy_requests_goal_sender_receiver_unique UNIQUE (goal_id, sender_id, receiver_id)
);

-- Enable RLS on buddy_requests
ALTER TABLE public.buddy_requests ENABLE ROW LEVEL SECURITY;

-- Create policies for buddy_requests
DROP POLICY IF EXISTS "Allow users to read their own requests" ON public.buddy_requests;
DROP POLICY IF EXISTS "Allow senders to insert requests" ON public.buddy_requests;
DROP POLICY IF EXISTS "Allow receivers to update requests" ON public.buddy_requests;
DROP POLICY IF EXISTS "Allow users to delete requests" ON public.buddy_requests;

CREATE POLICY "Allow users to read their own requests"
  ON public.buddy_requests
  FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Allow senders to insert requests"
  ON public.buddy_requests
  FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Allow receivers to update requests"
  ON public.buddy_requests
  FOR UPDATE
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

CREATE POLICY "Allow users to delete requests"
  ON public.buddy_requests
  FOR DELETE
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- 3. Create goal_buddies view (with security_invoker to respect RLS)
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

-- 4. Update goals read policies for buddies
DROP POLICY IF EXISTS "Allow users to read their own goals" ON public.goals;
CREATE POLICY "Allow users to read goals"
  ON public.goals
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.buddy_requests br
      WHERE br.goal_id = id
        AND br.status = 'accepted'
        AND (br.sender_id = auth.uid() OR br.receiver_id = auth.uid())
    )
  );

-- 5. Update checkins read policies for buddies
DROP POLICY IF EXISTS "Allow users to read their own checkins" ON public.checkins;
CREATE POLICY "Allow users to read checkins"
  ON public.checkins
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.buddy_requests br
      WHERE br.goal_id = goal_id
        AND br.status = 'accepted'
        AND (br.sender_id = auth.uid() OR br.receiver_id = auth.uid())
    )
  );

-- 6. Update calculate_streak function to support filtering by user_id
CREATE OR REPLACE FUNCTION public.calculate_streak(goal_id UUID, user_id UUID DEFAULT auth.uid())
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_frequency TEXT;
  v_current_streak INT := 0;
  v_longest_streak INT := 0;
  v_temp_streak INT := 0;
  v_last_checkin_date DATE := NULL;
  v_prev_date DATE := NULL;
  v_curr_date DATE;
  v_curr_week TEXT;
  v_prev_week TEXT;
  v_checkin_record RECORD;
  v_week_checkins INT := 0;
  v_is_current BOOLEAN := TRUE;
  v_weeks_consecutive BOOLEAN;
  v_prev_year INT;
  v_prev_wk INT;
  v_curr_year INT;
  v_curr_wk INT;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.goals g 
    WHERE g.id = goal_id 
      AND (
        g.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.buddy_requests br
          WHERE br.goal_id = goal_id
            AND br.status = 'accepted'
            AND (br.sender_id = auth.uid() OR br.receiver_id = auth.uid())
        )
      )
  ) THEN
    RETURN json_build_object(
      'current_streak', 0,
      'longest_streak', 0,
      'last_checkin_date', NULL
    );
  END IF;

  SELECT frequency INTO v_frequency
  FROM public.goals
  WHERE id = goal_id;

  IF v_frequency IS NULL THEN
    RETURN json_build_object(
      'current_streak', 0,
      'longest_streak', 0,
      'last_checkin_date', NULL
    );
  END IF;

  -- ── DAILY: consecutive day-by-day ──────────────────
  IF v_frequency = 'daily' THEN
    v_is_current := TRUE;
    FOR v_checkin_record IN
      SELECT DISTINCT DATE(checked_in_at AT TIME ZONE 'UTC') AS checkin_date
      FROM public.checkins
      WHERE goal_id = calculate_streak.goal_id
        AND user_id = calculate_streak.user_id
      ORDER BY checkin_date DESC
    LOOP
      v_curr_date := v_checkin_record.checkin_date;
      IF v_last_checkin_date IS NULL THEN
        v_last_checkin_date := v_curr_date;
        v_temp_streak := 1;
        IF v_curr_date < (CURRENT_DATE - INTERVAL '1 day') THEN
          v_is_current := FALSE;
        END IF;
      ELSIF v_prev_date - v_curr_date = 1 THEN
        v_temp_streak := v_temp_streak + 1;
      ELSE
        IF v_is_current THEN
          v_current_streak := v_temp_streak;
          v_is_current := FALSE;
        END IF;
        IF v_temp_streak > v_longest_streak THEN
          v_longest_streak := v_temp_streak;
        END IF;
        v_temp_streak := 1;
      END IF;
      v_prev_date := v_curr_date;
    END LOOP;

    IF v_temp_streak > v_longest_streak THEN
      v_longest_streak := v_temp_streak;
    END IF;
    IF v_is_current THEN
      v_current_streak := v_temp_streak;
    END IF;

  -- ── WEEKLY: one check-in per ISO week ──────────────
  ELSIF v_frequency = 'weekly' THEN
    v_is_current := TRUE;
    FOR v_checkin_record IN
      SELECT DISTINCT TO_CHAR(DATE(checked_in_at AT TIME ZONE 'UTC'), 'IYYY-IW') AS iso_week,
             MAX(DATE(checked_in_at AT TIME ZONE 'UTC')) AS week_date
      FROM public.checkins
      WHERE goal_id = calculate_streak.goal_id
        AND user_id = calculate_streak.user_id
      GROUP BY 1
      ORDER BY 1 DESC
    LOOP
      v_curr_week := v_checkin_record.iso_week;
      v_curr_date := v_checkin_record.week_date;
      IF v_last_checkin_date IS NULL THEN
        v_last_checkin_date := v_curr_date;
        v_temp_streak := 1;
        IF v_curr_week < TO_CHAR(CURRENT_DATE - INTERVAL '7 days', 'IYYY-IW') THEN
          v_is_current := FALSE;
        END IF;
      ELSIF v_prev_week IS NOT NULL THEN
        v_prev_year := SPLIT_PART(v_prev_week, '-', 1)::INT;
        v_prev_wk   := SPLIT_PART(v_prev_week, '-', 2)::INT;
        v_curr_year := SPLIT_PART(v_curr_week, '-', 1)::INT;
        v_curr_wk   := SPLIT_PART(v_curr_week, '-', 2)::INT;
        v_weeks_consecutive := (v_prev_year = v_curr_year AND v_prev_wk - v_curr_wk = 1)
          OR (v_prev_year - v_curr_year = 1 AND v_prev_wk = 1 AND v_curr_wk >= 52);

        IF v_weeks_consecutive THEN
          v_temp_streak := v_temp_streak + 1;
        ELSE
          IF v_is_current THEN
            v_current_streak := v_temp_streak;
            v_is_current := FALSE;
          END IF;
          IF v_temp_streak > v_longest_streak THEN
            v_longest_streak := v_temp_streak;
          END IF;
          v_temp_streak := 1;
        END IF;
      END IF;
      v_prev_week := v_curr_week;
    END LOOP;

    IF v_temp_streak > v_longest_streak THEN v_longest_streak := v_temp_streak; END IF;
    IF v_is_current THEN v_current_streak := v_temp_streak; END IF;

  -- ── THREE_PER_WEEK: 3+ check-ins per consecutive calendar week ─
  ELSE
    v_is_current := TRUE;
    FOR v_checkin_record IN
      SELECT TO_CHAR(DATE(checked_in_at AT TIME ZONE 'UTC'), 'IYYY-IW') AS iso_week,
             COUNT(*) AS cnt,
             MAX(DATE(checked_in_at AT TIME ZONE 'UTC')) AS week_date
      FROM public.checkins
      WHERE goal_id = calculate_streak.goal_id
        AND user_id = calculate_streak.user_id
      GROUP BY 1
      ORDER BY 1 DESC
    LOOP
      v_curr_week := v_checkin_record.iso_week;
      v_curr_date := v_checkin_record.week_date;
      v_week_checkins := v_checkin_record.cnt;

      IF v_last_checkin_date IS NULL THEN
        v_last_checkin_date := v_curr_date;
        IF v_curr_week < TO_CHAR(CURRENT_DATE - INTERVAL '7 days', 'IYYY-IW') THEN
          v_is_current := FALSE;
        END IF;
      END IF;

      IF v_prev_week IS NOT NULL THEN
        v_prev_year := SPLIT_PART(v_prev_week, '-', 1)::INT;
        v_prev_wk   := SPLIT_PART(v_prev_week, '-', 2)::INT;
        v_curr_year := SPLIT_PART(v_curr_week, '-', 1)::INT;
        v_curr_wk   := SPLIT_PART(v_curr_week, '-', 2)::INT;
        v_weeks_consecutive := (v_prev_year = v_curr_year AND v_prev_wk - v_curr_wk = 1)
          OR (v_prev_year - v_curr_year = 1 AND v_prev_wk = 1 AND v_curr_wk >= 52);

        IF NOT v_weeks_consecutive THEN
          IF v_is_current THEN
            v_current_streak := v_temp_streak;
            v_is_current := FALSE;
          END IF;
          IF v_temp_streak > v_longest_streak THEN
            v_longest_streak := v_temp_streak;
          END IF;
          v_temp_streak := 0;
        END IF;
      END IF;

      IF v_week_checkins >= 3 THEN
        v_temp_streak := v_temp_streak + 1;
      ELSIF v_curr_week = TO_CHAR(CURRENT_DATE, 'IYYY-IW') AND v_is_current THEN
        NULL;
      ELSE
        IF v_is_current THEN
          v_current_streak := v_temp_streak;
          v_is_current := FALSE;
        END IF;
        IF v_temp_streak > v_longest_streak THEN
          v_longest_streak := v_temp_streak;
        END IF;
        v_temp_streak := 0;
      END IF;

      v_prev_week := v_curr_week;
    END LOOP;

    IF v_temp_streak > v_longest_streak THEN v_longest_streak := v_temp_streak; END IF;
    IF v_is_current THEN v_current_streak := v_temp_streak; END IF;
  END IF;

  RETURN json_build_object(
    'current_streak', v_current_streak,
    'longest_streak', v_longest_streak,
    'last_checkin_date', v_last_checkin_date
  );
END;
$$;
