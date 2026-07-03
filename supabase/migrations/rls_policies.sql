-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Comprehensive least-privilege security for production deployment
-- ─────────────────────────────────────────────────────────────────────────────

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. PROFILES TABLE
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;

-- SELECT: anyone can read profiles (public profiles + their own)
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT
  USING (true);

-- INSERT: users can create their own profile on signup (auto-trigger)
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- UPDATE: users can only update their own profile
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- DELETE: users can delete their own profile
CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE
  USING (auth.uid() = id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. GOALS TABLE
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goals_select" ON public.goals;
DROP POLICY IF EXISTS "goals_insert" ON public.goals;
DROP POLICY IF EXISTS "goals_update" ON public.goals;
DROP POLICY IF EXISTS "goals_delete" ON public.goals;

-- SELECT: users can read their own goals + goals of accepted buddies
CREATE POLICY "goals_select" ON public.goals
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR
    EXISTS (
      SELECT 1
      FROM public.buddy_requests br
      WHERE br.goal_id = goals.id
        AND br.status = 'accepted'
        AND (br.sender_id = auth.uid() OR br.receiver_id = auth.uid())
    )
  );

-- INSERT: users can create goals for themselves only
CREATE POLICY "goals_insert" ON public.goals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: users can only update their own goals
CREATE POLICY "goals_update" ON public.goals
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: users can only delete their own goals
CREATE POLICY "goals_delete" ON public.goals
  FOR DELETE
  USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. CHECKINS TABLE
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checkins_select" ON public.checkins;
DROP POLICY IF EXISTS "checkins_insert" ON public.checkins;
DROP POLICY IF EXISTS "checkins_update" ON public.checkins;
DROP POLICY IF EXISTS "checkins_delete" ON public.checkins;

-- SELECT: users can read their own checkins + checkins of accepted buddies on shared goals
CREATE POLICY "checkins_select" ON public.checkins
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR
    EXISTS (
      SELECT 1
      FROM public.buddy_requests br
      WHERE br.goal_id = checkins.goal_id
        AND br.status = 'accepted'
        AND (br.sender_id = auth.uid() OR br.receiver_id = auth.uid())
    )
  );

-- INSERT: users can create checkins for themselves only, on their own goals
CREATE POLICY "checkins_insert" ON public.checkins
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND
    EXISTS (
      SELECT 1
      FROM public.goals g
      WHERE g.id = checkins.goal_id AND g.user_id = auth.uid()
    )
  );

-- UPDATE: users can only update their own checkins
CREATE POLICY "checkins_update" ON public.checkins
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: users can only delete their own checkins
CREATE POLICY "checkins_delete" ON public.checkins
  FOR DELETE
  USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. BUDDY_REQUESTS TABLE
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.buddy_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "buddy_requests_select" ON public.buddy_requests;
DROP POLICY IF EXISTS "buddy_requests_insert" ON public.buddy_requests;
DROP POLICY IF EXISTS "buddy_requests_update" ON public.buddy_requests;
DROP POLICY IF EXISTS "buddy_requests_delete" ON public.buddy_requests;

-- SELECT: users can read requests where they are sender or receiver
CREATE POLICY "buddy_requests_select" ON public.buddy_requests
  FOR SELECT
  USING (
    auth.uid() = sender_id
    OR
    auth.uid() = receiver_id
  );

-- INSERT: users can create requests where they are the sender, on their own goals
CREATE POLICY "buddy_requests_insert" ON public.buddy_requests
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND
    EXISTS (
      SELECT 1
      FROM public.goals g
      WHERE g.id = buddy_requests.goal_id AND g.user_id = auth.uid()
    )
  );

-- UPDATE: sender can update (cancel), receiver can update (accept/reject)
CREATE POLICY "buddy_requests_update" ON public.buddy_requests
  FOR UPDATE
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- DELETE: sender can delete their own request
CREATE POLICY "buddy_requests_delete" ON public.buddy_requests
  FOR DELETE
  USING (auth.uid() = sender_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. MATCHING_POOL TABLE
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.matching_pool ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "matching_pool_select" ON public.matching_pool;
DROP POLICY IF EXISTS "matching_pool_insert" ON public.matching_pool;
DROP POLICY IF EXISTS "matching_pool_update" ON public.matching_pool;
DROP POLICY IF EXISTS "matching_pool_delete" ON public.matching_pool;

-- SELECT: users can only read their own matching pool entry
CREATE POLICY "matching_pool_select" ON public.matching_pool
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: users can only insert their own entry
CREATE POLICY "matching_pool_insert" ON public.matching_pool
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: users can only update their own entry
CREATE POLICY "matching_pool_update" ON public.matching_pool
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: users can only delete their own entry
CREATE POLICY "matching_pool_delete" ON public.matching_pool
  FOR DELETE
  USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. MESSAGES TABLE
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Required for Supabase Realtime to broadcast rows to the correct subscribers
ALTER TABLE public.messages REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_update" ON public.messages;
DROP POLICY IF EXISTS "messages_delete" ON public.messages;

-- SELECT: sender or receiver can read the message
CREATE POLICY "messages_select" ON public.messages
  FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- INSERT: sender must have an accepted buddy_request with the receiver
-- (checks ANY goal, not just messages.goal_id — fixes cross-goal stranger match)
CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND
    EXISTS (
      SELECT 1
      FROM public.buddy_requests br
      WHERE br.status = 'accepted'
        AND (
          (br.sender_id = auth.uid() AND br.receiver_id = messages.receiver_id)
          OR
          (br.receiver_id = auth.uid() AND br.sender_id = messages.receiver_id)
        )
    )
  );

-- UPDATE: only receiver can update (mark as read)
CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- DELETE: sender can delete their own messages
CREATE POLICY "messages_delete" ON public.messages
  FOR DELETE
  USING (auth.uid() = sender_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. PUSH_SUBSCRIPTIONS TABLE
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions_select" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_insert" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_update" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_delete" ON public.push_subscriptions;

-- SELECT: users can read their own subscriptions
CREATE POLICY "push_subscriptions_select" ON public.push_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: users can create their own subscriptions
CREATE POLICY "push_subscriptions_insert" ON public.push_subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: users can update their own subscriptions
CREATE POLICY "push_subscriptions_update" ON public.push_subscriptions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: users can delete their own subscriptions
CREATE POLICY "push_subscriptions_delete" ON public.push_subscriptions
  FOR DELETE
  USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. BADGES TABLE
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "badges_select" ON public.badges;
DROP POLICY IF EXISTS "badges_insert" ON public.badges;
DROP POLICY IF EXISTS "badges_update" ON public.badges;
DROP POLICY IF EXISTS "badges_delete" ON public.badges;

-- SELECT: anyone can read badges (displayed on public profiles)
CREATE POLICY "badges_select" ON public.badges
  FOR SELECT
  USING (true);

-- INSERT: ONLY service role (SECURITY DEFINER functions) can insert
-- Users cannot self-award badges
CREATE POLICY "badges_insert" ON public.badges
  FOR INSERT
  WITH CHECK (false);

-- UPDATE: no one can update badges (immutable)
CREATE POLICY "badges_update" ON public.badges
  FOR UPDATE
  USING (false);

-- DELETE: service role only (for admin cleanup if needed)
CREATE POLICY "badges_delete" ON public.badges
  FOR DELETE
  USING (false);

-- ══════════════════════════════════════════════════════════════════════════════
-- 9. STORAGE BUCKET POLICIES (avatars)
-- ══════════════════════════════════════════════════════════════════════════════

-- Ensure the avatars bucket exists and is public for reading
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "avatars_select" ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete" ON storage.objects;

-- SELECT: anyone can read avatars (public bucket)
CREATE POLICY "avatars_select" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- INSERT: authenticated users can upload to avatars/{user_id}/* only
-- File type and size validation happens on client before upload
CREATE POLICY "avatars_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND auth.role() = 'authenticated'
  );

-- UPDATE: users can update (replace) their own avatar files
CREATE POLICY "avatars_update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND auth.role() = 'authenticated'
  );

-- DELETE: users can delete their own avatar files
CREATE POLICY "avatars_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND auth.role() = 'authenticated'
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION CHECKLIST
-- ══════════════════════════════════════════════════════════════════════════════
-- ✅ All 8 tables have RLS ENABLED
-- ✅ All tables have separate SELECT/INSERT/UPDATE/DELETE policies
-- ✅ profiles: users own their data
-- ✅ goals: users + accepted buddies can read
-- ✅ checkins: users + accepted buddies can read
-- ✅ buddy_requests: sender + receiver only
-- ✅ matching_pool: users own their entry
-- ✅ messages: INSERT requires accepted buddy_request subquery (ANY goal)
-- ✅ push_subscriptions: users own their subscriptions
-- ✅ badges: public read, INSERT restricted to service role (via false check)
-- ✅ Storage avatars: authenticated users can only upload to avatars/{user_id}/*
-- ══════════════════════════════════════════════════════════════════════════════
