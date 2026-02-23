-- Add caption/description to goal_completions for post description
ALTER TABLE public.goal_completions
  ADD COLUMN IF NOT EXISTS caption text;

COMMENT ON COLUMN public.goal_completions.caption IS 'User description/caption for the completion post';

-- Allow users to update their own completions (e.g. add proof_url/caption after first save)
CREATE POLICY "Users can update their own completions" ON public.goal_completions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Allow list participants to view completions (so they can see proof/caption and validate)
CREATE POLICY "Users can view completions in their goal lists" ON public.goal_completions
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.goals g
      WHERE g.id = goal_completions.goal_id
      AND (
        g.user_id = auth.uid()
        OR auth.uid() IN (SELECT user_id FROM public.goal_lists WHERE id = g.goal_list_id)
        OR EXISTS (
          SELECT 1 FROM public.group_goal_participants ggp
          WHERE ggp.goal_list_id = g.goal_list_id AND ggp.user_id = auth.uid()
        )
      )
    )
  );

-- Storage: Create a bucket "goal-proofs" in Supabase Dashboard > Storage (public read, authenticated insert/update)
-- so proof images uploaded from GoalPostScreen can be stored and displayed.
