-- ─────────────────────────────────────────────────────────────────────────────
-- BUDDY-BASED MESSAGING
-- Makes messages.goal_id nullable so messages can exist without a goal context.
-- Messages are now conversations between buddies, not tied to a specific goal.
--
-- Run ONCE in Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Make goal_id nullable (messages no longer require a goal context)
ALTER TABLE public.messages
  ALTER COLUMN goal_id DROP NOT NULL;

-- 2. Drop the foreign key constraint on goal_id if it exists, so null is allowed
-- (Supabase allows FK columns to be NULL by default, but drop & recreate as nullable)
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_goal_id_fkey;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_goal_id_fkey
    FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;

-- 3. Update RLS SELECT policy: a user can read messages where they are sender or receiver
--    (previously also joined via goal_id — now purely user-to-user)
DROP POLICY IF EXISTS "messages_select" ON public.messages;
CREATE POLICY "messages_select"
  ON public.messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- 4. Update RLS INSERT policy: sender must be the authenticated user,
--    and receiver must be an accepted buddy of the sender
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_insert"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.buddy_requests br
      WHERE br.status = 'accepted'
        AND (
          (br.sender_id   = auth.uid() AND br.receiver_id = messages.receiver_id)
          OR
          (br.receiver_id = auth.uid() AND br.sender_id   = messages.receiver_id)
        )
    )
  );

-- 5. Allow receiver to mark messages as read (update read_at)
DROP POLICY IF EXISTS "messages_update" ON public.messages;
CREATE POLICY "messages_update"
  ON public.messages FOR UPDATE
  USING (auth.uid() = receiver_id);
