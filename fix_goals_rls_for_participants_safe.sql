-- ============================================
-- Fix RLS for goals table (safe to run multiple times)
-- ============================================
-- Run this in Supabase SQL Editor. Drops existing policies first.
-- ============================================

-- 1) Drop existing INSERT policies (exact and truncated name)
DROP POLICY IF EXISTS "Users can insert their own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can insert their own goals or owners can insert for participants" ON public.goals;
DROP POLICY IF EXISTS "Users can insert their own goals or owners can insert for parti" ON public.goals;

-- 2) Create INSERT policy
CREATE POLICY "Users can insert their own goals or owners can insert for participants" ON public.goals
  FOR INSERT 
  WITH CHECK (
    auth.uid() = user_id OR 
    auth.uid() IN (SELECT user_id FROM public.goal_lists WHERE id = goal_list_id)
  );

-- 3) Drop existing SELECT policies
DROP POLICY IF EXISTS "Users can view their own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can view goals in their goal lists" ON public.goals;

-- 4) Create helper function
CREATE OR REPLACE FUNCTION public.user_can_view_goals(goal_list_uuid uuid, goal_user_uuid uuid, current_user_uuid uuid)
RETURNS boolean AS $$
BEGIN
  RETURN (
    goal_user_uuid = current_user_uuid OR
    current_user_uuid IN (SELECT user_id FROM public.goal_lists WHERE id = goal_list_uuid) OR
    EXISTS (
      SELECT 1 
      FROM public.group_goal_participants 
      WHERE goal_list_id = goal_list_uuid 
        AND user_id = current_user_uuid
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5) Create SELECT policy
CREATE POLICY "Users can view goals in their goal lists" ON public.goals
  FOR SELECT USING (
    public.user_can_view_goals(goal_list_id, user_id, auth.uid())
  );

-- Done.
