-- Rapyd: payments (checkout), payouts (beneficiary)
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS rapyd_checkout_id text,
  ADD COLUMN IF NOT EXISTS rapyd_payment_id text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rapyd_beneficiary_id text;

ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS rapyd_payout_id text;

-- Track checkouts so webhook can match payment to goal_list/user
CREATE TABLE IF NOT EXISTS public.rapyd_checkouts (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  checkout_id   text NOT NULL UNIQUE,
  goal_list_id  uuid REFERENCES public.goal_lists(id) ON DELETE CASCADE NOT NULL,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount        numeric NOT NULL,
  rapyd_payment_id text,
  created_at    timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.rapyd_checkouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own rapyd checkouts" ON public.rapyd_checkouts;
CREATE POLICY "Users can view own rapyd checkouts"
  ON public.rapyd_checkouts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own rapyd checkouts" ON public.rapyd_checkouts;
CREATE POLICY "Users can insert own rapyd checkouts"
  ON public.rapyd_checkouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.rapyd_checkouts IS 'Maps Rapyd checkout_id to goal_list/user for webhook payment recording.';
