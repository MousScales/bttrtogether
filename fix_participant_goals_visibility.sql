-- ============================================================
-- Fix: participants can see group goals, goal_lists, and completions
-- Run this ENTIRE script in Supabase SQL Editor.
-- Safe to run multiple times.
-- ============================================================

-- ── 1. goal_lists ──────────────────────────────────────────
-- Allow participants (not just creators) to SELECT their group lists.
DROP POLICY IF EXISTS "Users can view their own goal lists" ON public.goal_lists;
DROP POLICY IF EXISTS "Users can view goal lists they participate in" ON public.goal_lists;

CREATE POLICY "Users can view goal lists they participate in"
  ON public.goal_lists
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.group_goal_participants
      WHERE goal_list_id = public.goal_lists.id
        AND user_id = auth.uid()
    )
  );

-- ── 2. goals ───────────────────────────────────────────────
-- Replace any old "own goals only" SELECT policy with one that lets
-- participants see all goals in lists they belong to.

DROP POLICY IF EXISTS "Users can view their own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can view goals in their goal lists" ON public.goals;

-- Helper function (idempotent)
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
    -- Your own goal
    goal_user_uuid = current_user_uuid
    OR
    -- You own the goal list
    current_user_uuid IN (
      SELECT user_id FROM public.goal_lists WHERE id = goal_list_uuid
    )
    OR
    -- You are a participant on the list
    EXISTS (
      SELECT 1
      FROM public.group_goal_participants
      WHERE goal_list_id = goal_list_uuid
        AND user_id = current_user_uuid
    )
  );
END;
$$;

CREATE POLICY "Users can view goals in their goal lists"
  ON public.goals
  FOR SELECT
  USING (public.user_can_view_goals(goal_list_id, user_id, auth.uid()));

-- INSERT: owner can insert group goals; users can insert own goals
DROP POLICY IF EXISTS "Users can insert their own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can insert their own goals or owners can insert for participants" ON public.goals;
DROP POLICY IF EXISTS "Users can insert their own goals or owners can insert for parti" ON public.goals;

CREATE POLICY "Users can insert their own goals or owners can insert for participants"
  ON public.goals
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR auth.uid() IN (
      SELECT user_id FROM public.goal_lists WHERE id = goal_list_id
    )
  );

-- ── 3. goal_completions ────────────────────────────────────
-- Allow participants to see all completions for goals in their lists
-- (needed to show everyone's progress rings).
DROP POLICY IF EXISTS "Users can view their own completions" ON public.goal_completions;
DROP POLICY IF EXISTS "Users can view completions in their goal lists" ON public.goal_completions;

CREATE POLICY "Users can view completions in their goal lists"
  ON public.goal_completions
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.goals g
      WHERE g.id = goal_id
        AND public.user_can_view_goals(g.goal_list_id, g.user_id, auth.uid())
    )
  );

-- ── Done ───────────────────────────────────────────────────
-- Participants can now see group goals, the goal list itself,
-- and everyone's completions.
