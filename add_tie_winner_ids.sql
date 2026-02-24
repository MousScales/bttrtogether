-- Support tied winners: split prize evenly.
-- Run in Supabase: Dashboard → SQL Editor → New query → paste this → Run.
-- Fixes: "Could not find the 'tie_winner_ids' column of 'goal_lists' in the schema cache"

ALTER TABLE public.goal_lists
  ADD COLUMN IF NOT EXISTS tie_winner_ids uuid[] DEFAULT NULL;

COMMENT ON COLUMN public.goal_lists.tie_winner_ids IS 'When set, multiple winners tied; prize_pool is split evenly. winner_id is null.';
