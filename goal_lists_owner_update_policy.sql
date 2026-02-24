-- Allow goal list owner to update their list (e.g. set winner_id for declare winner).
-- Run in Supabase SQL Editor if declare winner from the app fails with RLS.

DROP POLICY IF EXISTS "Goal list owners can update their own list" ON public.goal_lists;
CREATE POLICY "Goal list owners can update their own list"
  ON public.goal_lists
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
