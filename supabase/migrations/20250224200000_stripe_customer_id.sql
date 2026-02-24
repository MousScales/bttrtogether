-- Store Stripe Customer id per user so we can list/attach payment methods for in-app payments
-- and use the same saved cards in Settings/Payout and when paying for challenges.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS stripe_customer_id text;

COMMENT ON COLUMN public.profiles.stripe_customer_id IS 'Stripe Customer id (cus_xxx) for saved payment methods used when paying for challenges.';
