-- ============================================================
--  Migration: friendships — friend requests & connections
--
--  Status flow: pending → accepted / rejected
--  Unique constraint prevents duplicate requests in either direction.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.friendships (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status      TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_self_friend CHECK (sender_id <> receiver_id)
);

-- Prevent duplicate requests in either direction
CREATE UNIQUE INDEX IF NOT EXISTS idx_friendships_pair
  ON public.friendships (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id));

CREATE INDEX IF NOT EXISTS idx_friendships_sender  ON public.friendships (sender_id);
CREATE INDEX IF NOT EXISTS idx_friendships_receiver ON public.friendships (receiver_id);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Users can see friendships they're part of
CREATE POLICY "friendships_own_read"
  ON public.friendships FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Users can send friend requests (insert as sender)
CREATE POLICY "friendships_send"
  ON public.friendships FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND status = 'pending');

-- Receiver can accept/reject; either party can update
CREATE POLICY "friendships_update"
  ON public.friendships FOR UPDATE
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Either party can delete (unfriend / cancel request)
CREATE POLICY "friendships_delete"
  ON public.friendships FOR DELETE
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);


-- ── Leaderboard view: accuracy-based ranking ───────────────────
-- Ranks all users by prediction accuracy, sorted by volume (most predictions first)

CREATE OR REPLACE VIEW public.leaderboard AS
SELECT
  p.id,
  p.name,
  p.username,
  p.tier,
  COUNT(pos.id)::int                                          AS total_predictions,
  COUNT(pos.id) FILTER (WHERE pos.status = 'won')::int        AS correct_predictions,
  CASE WHEN COUNT(pos.id) > 0
       THEN ROUND(COUNT(pos.id) FILTER (WHERE pos.status = 'won')::numeric / COUNT(pos.id) * 100, 1)
       ELSE 0 END                                             AS accuracy_pct,
  COALESCE(SUM(pos.payout_if_win) FILTER (WHERE pos.status = 'won'), 0)::numeric(12,2) AS total_cobrado
FROM profiles p
LEFT JOIN positions pos ON pos.user_id = p.id AND pos.status IN ('won', 'lost')
WHERE p.is_admin = false
GROUP BY p.id, p.name, p.username, p.tier
HAVING COUNT(pos.id) > 0
ORDER BY COUNT(pos.id) DESC, accuracy_pct DESC;

-- Anyone authenticated can read leaderboard
DROP POLICY IF EXISTS "leaderboard_read" ON public.leaderboard;
-- Views inherit RLS from underlying tables, no policy needed on the view itself.
-- profiles has all_read_profiles, positions needs a read policy for the view:
CREATE POLICY "positions_read_for_leaderboard"
  ON public.positions FOR SELECT
  USING (true);


NOTIFY pgrst, 'reload schema';
