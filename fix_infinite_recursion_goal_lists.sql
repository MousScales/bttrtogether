-- ============================================================
-- URGENT FIX: removes infinite-recursion on goal_lists policy
-- Run this ENTIRE script in Supabase SQL Editor immediately.
-- ============================================================

-- 1. Drop the broken inline policy (added by fix_participant_goals_visibility.sql)
DROP POLICY IF EXISTS "Users can view goal lists they participate in" ON public.goal_lists;

-- 2. Make sure the SECURITY DEFINER helper function exists.
--    SECURITY DEFINER bypasses RLS inside the function, preventing recursion.
CREATE OR REPLACE FUNCTION public.user_is_participant(goal_list_uuid uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.group_goal_participants
    WHERE goal_list_id = goal_list_uuid
      AND user_id = user_uuid
  );
END;
$$;

-- 3. Drop any existing goal_lists SELECT policies and recreate with the safe function
DROP POLICY IF EXISTS "Users can view their own goal lists" ON public.goal_lists;
DROP POLICY IF EXISTS "Users can view their own goal lists or ones they participate in" ON public.goal_lists;

CREATE POLICY "Users can view their own goal lists or ones they participate in"
  ON public.goal_lists
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.user_is_participant(id, auth.uid())
  );

-- ── goals SELECT policy (already correct, just re-applying for safety) ──────
DROP POLICY IF EXISTS "Users can view their own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can view goals in their goal lists" ON public.goals;

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
    goal_user_uuid = current_user_uuid
    OR public.user_is_participant(goal_list_uuid, current_user_uuid)
    OR EXISTS (
      SELECT 1 FROM public.goal_lists
      WHERE id = goal_list_uuid AND user_id = current_user_uuid
    )
  );
END;
$$;

CREATE POLICY "Users can view goals in their goal lists"
  ON public.goals
  FOR SELECT
  USING (public.user_can_view_goals(goal_list_id, user_id, auth.uid()));

-- ── goal_completions SELECT policy ─────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view their own completions" ON public.goal_completions;
DROP POLICY IF EXISTS "Users can view completions in their goal lists" ON public.goal_completions;

CREATE POLICY "Users can view completions in their goal lists"
  ON public.goal_completions
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.goals g
      WHERE g.id = goal_id
        AND public.user_can_view_goals(g.goal_list_id, g.user_id, auth.uid())
    )
  );

-- ── Done ──────────────────────────────────────────────────────────────────
-- Creating goal lists and viewing group goals both work again.
