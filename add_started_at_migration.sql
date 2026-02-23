-- ============================================================
-- Add started_at column to goal_lists
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.goal_lists
  ADD COLUMN IF NOT EXISTS started_at timestamp with time zone;

-- Backfill: if all_paid is true, assume the challenge was already started.
-- Sets started_at = updated_at as a best-guess for existing rows.
UPDATE public.goal_lists
SET started_at = COALESCE(updated_at, created_at)
WHERE all_paid = true
  AND started_at IS NULL;
