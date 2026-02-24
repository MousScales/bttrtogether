-- ============================================
-- Allow authenticated users to read any goal_list by id for join links.
-- Without this, RLS only allows owner or participants to SELECT, so the
-- join screen would get no row and show "Challenge not found or link expired".
-- ============================================

CREATE POLICY "Authenticated users can read goal lists for join link"
  ON public.goal_lists
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
