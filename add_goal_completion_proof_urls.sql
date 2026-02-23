-- Multiple proof images/videos per completion + ensure rows can be saved
-- Run in Supabase Dashboard → SQL Editor. Then create the "goal-proofs" bucket in Storage if you haven't.

-- 1) Add array of proof URLs (keep proof_url for backward compatibility)
ALTER TABLE public.goal_completions
  ADD COLUMN IF NOT EXISTS proof_urls jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.goal_completions.proof_urls IS 'Array of public URLs for proof images/videos, e.g. ["https://...", "https://..."]';

-- 2) Allow users to INSERT their own completions (required so Share saves to DB)
DROP POLICY IF EXISTS "Users can insert their own completions" ON public.goal_completions;
CREATE POLICY "Users can insert their own completions"
  ON public.goal_completions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 3) If proof_url is null on existing rows, backfill from proof_urls
-- UPDATE public.goal_completions SET proof_url = (proof_urls->>0) WHERE proof_url IS NULL AND jsonb_array_length(proof_urls) > 0;
