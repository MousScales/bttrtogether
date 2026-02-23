-- Shared group goals: allow multiple participants to complete the same goal on the same day.
-- Run in Supabase SQL Editor. Required for "group goals any participant can complete" redesign.

-- Drop old unique if it was (goal_id, completed_at). If your constraint has a different name, drop it in Dashboard first.
ALTER TABLE public.goal_completions
  DROP CONSTRAINT IF EXISTS goal_completions_goal_id_completed_at_key;

-- One row per user per goal per day (so many users can complete the same group goal)
ALTER TABLE public.goal_completions
  DROP CONSTRAINT IF EXISTS goal_completions_goal_id_user_id_completed_at_key;

ALTER TABLE public.goal_completions
  ADD CONSTRAINT goal_completions_goal_id_user_id_completed_at_key
  UNIQUE (goal_id, user_id, completed_at);
