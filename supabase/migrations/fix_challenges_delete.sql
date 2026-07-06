-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: Challenge delete policy + clean up orphaned challenges
-- Run this in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Re-apply the delete policy so both parties can always delete a challenge
DROP POLICY IF EXISTS "challenges_delete" ON public.challenges;
CREATE POLICY "challenges_delete"
  ON public.challenges FOR DELETE
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);

-- 2. Delete all challenges where either participant is no longer an accepted buddy
--    This cleans up any challenges left behind from previously removed buddies.
DELETE FROM public.challenges c
WHERE NOT EXISTS (
  SELECT 1 FROM public.buddy_requests br
  WHERE br.status = 'accepted'
    AND (
      (br.sender_id   = c.challenger_id AND br.receiver_id = c.opponent_id)
      OR
      (br.sender_id   = c.opponent_id   AND br.receiver_id = c.challenger_id)
    )
);
