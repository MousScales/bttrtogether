-- ============================================================
-- Prize Pool & Stripe Connect Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── 1. Create payments table if it doesn't exist yet ─────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id                         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_list_id               uuid REFERENCES public.goal_lists(id) ON DELETE CASCADE NOT NULL,
  user_id                    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount                     numeric NOT NULL,
  stripe_payment_intent_id   text UNIQUE,
  status                     text DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  prize_pool_contribution    numeric DEFAULT 0,
  platform_fee_contribution  numeric DEFAULT 0,
  created_at                 timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at                 timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own payments" ON public.payments;
CREATE POLICY "Users can view their own payments"
  ON public.payments FOR SELECT
  USING (
    auth.uid() = user_id OR
    auth.uid() IN (SELECT user_id FROM public.goal_lists WHERE id = goal_list_id)
  );

DROP POLICY IF EXISTS "Users can create their own payments" ON public.payments;
CREATE POLICY "Users can create their own payments"
  ON public.payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own payments" ON public.payments;
CREATE POLICY "Users can update their own payments"
  ON public.payments FOR UPDATE
  USING (auth.uid() = user_id);

-- ── 2. Create payouts table if it doesn't exist yet ──────────────────────
CREATE TABLE IF NOT EXISTS public.payouts (
  id                         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_list_id               uuid REFERENCES public.goal_lists(id) ON DELETE CASCADE NOT NULL,
  winner_id                  uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  total_amount               numeric NOT NULL,
  payout_amount              numeric DEFAULT 0,
  stripe_payout_id           text,
  stripe_transfer_id         text,
  stripe_connect_account_id  text,
  status                     text DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at                 timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  completed_at               timestamp with time zone
);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view payouts for their goal lists" ON public.payouts;
CREATE POLICY "Users can view payouts for their goal lists"
  ON public.payouts FOR SELECT
  USING (
    auth.uid() = winner_id OR
    auth.uid() IN (SELECT user_id FROM public.goal_lists WHERE id = goal_list_id)
  );

DROP POLICY IF EXISTS "Users can create payouts for their goal lists" ON public.payouts;
CREATE POLICY "Users can create payouts for their goal lists"
  ON public.payouts FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT user_id FROM public.goal_lists WHERE id = goal_list_id)
  );

-- ── 3. Add new columns to payments (safe if already created above) ────────
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS prize_pool_contribution   numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_contribution numeric DEFAULT 0;

-- ── 4. Add new columns to payouts (safe if already created above) ─────────
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS payout_amount             numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_transfer_id        text,
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text;

-- ── 5. Add prize pool / fee tracking + winner columns to goal_lists ───────
ALTER TABLE public.goal_lists
  ADD COLUMN IF NOT EXISTS prize_pool_amount   numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS winner_id           uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS payout_status       text DEFAULT 'pending'
    CHECK (payout_status IN ('pending', 'processing', 'completed'));

-- ── 6. Create stripe_connect_accounts table ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.stripe_connect_accounts (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  stripe_account_id     text NOT NULL,
  onboarding_completed  boolean DEFAULT false,
  created_at            timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at            timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.stripe_connect_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own connect account" ON public.stripe_connect_accounts;
CREATE POLICY "Users can view their own connect account"
  ON public.stripe_connect_accounts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own connect account" ON public.stripe_connect_accounts;
CREATE POLICY "Users can insert their own connect account"
  ON public.stripe_connect_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own connect account" ON public.stripe_connect_accounts;
CREATE POLICY "Users can update their own connect account"
  ON public.stripe_connect_accounts FOR UPDATE
  USING (auth.uid() = user_id);

-- ── 7. Add total_pot column to goal_lists if it doesn't exist ────────────
ALTER TABLE public.goal_lists
  ADD COLUMN IF NOT EXISTS total_pot        numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS all_paid         boolean DEFAULT false;
