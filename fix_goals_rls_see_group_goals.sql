-- ============================================
-- FIX: Participants can see group goals (not just personal)
-- ============================================
-- Run this entire script in Supabase: SQL Editor → New query → paste → Run.
-- Without this, the SELECT policy only lets you see your own goals, so
-- creator's group goals are hidden from participants.
-- ============================================

-- 0) INSERT policy: creator inserts group goals; users insert own personal goals
DROP POLICY IF EXISTS "Users can insert their own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can insert their own goals or owners can insert for participants" ON public.goals;
DROP POLICY IF EXISTS "Users can insert their own goals or owners can insert for parti" ON public.goals;
CREATE POLICY "Users can insert their own goals or owners can insert for participants"
  ON public.goals FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR auth.uid() IN (SELECT user_id FROM public.goal_lists WHERE id = goal_list_id)
  );

-- 1) Drop every possible SELECT policy on goals (names can be truncated in UI)
DROP POLICY IF EXISTS "Users can view their own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can view goals in their goal lists" ON public.goals;

-- 2) Helper: can this user view goals in this list? (owner, creator, or participant)
CREATE OR REPLACE FUNCTION public.user_can_view_goals(
  goal_list_uuid uuid,
  goal_user_uuid uuid,
  current_user_uuid uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    -- You can view your own goals
    goal_user_uuid = current_user_uuid
    OR
    -- You own this goal list (creator)
    current_user_uuid IN (SELECT user_id FROM public.goal_lists WHERE id = goal_list_uuid)
    OR
    -- You are a participant on this list (so you can see creator's group goals)
    EXISTS (
      SELECT 1
      FROM public.group_goal_participants
      WHERE goal_list_id = goal_list_uuid
        AND user_id = current_user_uuid
    )
  );
END;
$$;

-- 3) SELECT policy: allow viewing goals in lists you own or participate in
CREATE POLICY "Users can view goals in their goal lists"
  ON public.goals
  FOR SELECT
  USING (public.user_can_view_goals(goal_list_id, user_id, auth.uid()));

-- Done. Participants should now see creator's group goals + their personal goals.
