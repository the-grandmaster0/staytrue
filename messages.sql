-- ─────────────────────────────────────────────────────────────────────────────
-- MESSAGING SYSTEM
-- Paste this entire file into Supabase SQL Editor and click Run.
-- Safe to re-run — uses IF NOT EXISTS and DROP POLICY IF EXISTS throughout.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id       UUID        NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  sender_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content       TEXT        NOT NULL CHECK (char_length(content) <= 150),
  message_type  TEXT        NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'reaction')),
  reaction_key  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at       TIMESTAMPTZ
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS messages_goal_id_created_at_idx
  ON public.messages (goal_id, created_at ASC);

CREATE INDEX IF NOT EXISTS messages_receiver_read_at_idx
  ON public.messages (receiver_id, read_at)
  WHERE read_at IS NULL;

-- 3. Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Required for Supabase Realtime to broadcast rows to the correct subscribers
-- when RLS is enabled. Without FULL, the receiver never gets the realtime event.
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- 4. Drop old policies so re-runs don't error
DROP POLICY IF EXISTS "Messages: sender or receiver can read"          ON public.messages;
DROP POLICY IF EXISTS "Messages: confirmed buddy can insert as sender"  ON public.messages;
DROP POLICY IF EXISTS "Messages: receiver can mark as read"            ON public.messages;

-- 5. SELECT: only sender or receiver can read their messages
CREATE POLICY "Messages: sender or receiver can read"
  ON public.messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- 6. INSERT: must be the sender, and must have an accepted buddy relationship
--    with the receiver on ANY goal (not restricted to messages.goal_id).
--    This fixes stranger-match where each user's buddy_request is on their own goal.
CREATE POLICY "Messages: confirmed buddy can insert as sender"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1
      FROM public.buddy_requests br
      WHERE br.status = 'accepted'
        AND (
          (br.sender_id   = auth.uid() AND br.receiver_id = messages.receiver_id)
          OR
          (br.receiver_id = auth.uid() AND br.sender_id   = messages.receiver_id)
        )
    )
  );

-- 7. UPDATE: only the receiver can set read_at
CREATE POLICY "Messages: receiver can mark as read"
  ON public.messages FOR UPDATE
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- 8. Enable Realtime on the messages table
--    Wrapped in DO block so it's safe to re-run (won't error if already added).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- already in publication, nothing to do
END;
$$;
