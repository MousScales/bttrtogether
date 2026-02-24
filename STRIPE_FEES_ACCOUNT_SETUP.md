# Stripe: Separate 10% Platform Fee Into Its Own Account

Your app takes a 10% platform fee on each buy-in; the rest goes to the prize pool. This guide sets up **Stripe** so that 10% is automatically sent to a **separate Stripe Connect account**, keeping your cut and user funds clearly separated.

## How it works

1. User pays a buy-in (e.g. $10) → charge is on your **main Stripe account**.
2. **Webhook** runs when the payment succeeds.
3. A **Transfer** of 10% ($1) is sent to your **fees Connect account** (`STRIPE_FEES_ACCOUNT_ID`).
4. Your main account keeps 90% (prize pool); the fees account holds only the 10% cut.

## 1. Create the “fees” Stripe Connect account

The 10% must go to a **Stripe Connect account** linked to your main account (Transfers can only go to Connect accounts). Create one dedicated to platform fees:

1. In your **main** Stripe account (the one that receives buy-ins): open **Connect** → **Accounts**.
2. Click **Add account** → create a **Standard** or **Express** account.
3. Use a business name like **“BttrTogether Platform Fees”** (or a separate business you use only for fees) and complete onboarding.
4. After the account is created, copy its ID: **`acct_xxxxxxxxxxxx`**. This is **STRIPE_FEES_ACCOUNT_ID**.

Result:

- **Main account**: receives 100% of each charge; the webhook transfers 10% out, so it effectively holds the 90% prize pool for payouts.
- **Fees account** (`acct_xxx`): receives only the 10% transfers and can be viewed in Connect → Accounts → [that account].

## 2. Deploy the webhook and set secrets

From your project root:

```bash
npx supabase functions deploy stripe-webhook
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxxx
npx supabase secrets set STRIPE_FEES_ACCOUNT_ID=acct_xxxx
```

- **STRIPE_SECRET_KEY** should already be set (main account’s secret key).
- **STRIPE_WEBHOOK_SECRET** comes from step 3 below.
- **STRIPE_FEES_ACCOUNT_ID** is the `acct_xxx` from step 1.

## 3. Add the webhook in Stripe

1. **Stripe Dashboard** (main account) → **Developers** → **Webhooks** → **Add endpoint**.
2. **Endpoint URL**:  
   `https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`  
   (replace with your Supabase project ref).
3. **Events to send**: select **`payment_intent.succeeded`**.
4. Create the endpoint, then open it and reveal **Signing secret** (starts with `whsec_`).
5. Set that as **STRIPE_WEBHOOK_SECRET** (see step 2).

## 4. Balance and timing

- **Transfers** use your main account’s **available** balance. New charges often sit in **pending** for a couple of days.
- If the transfer fails with “insufficient balance”, the webhook still returns 200 (so Stripe won’t retry forever). You can:
  - Enable **Instant Payouts** (if available) so funds become available sooner, or
  - Wait until funds are available and retry the transfer manually, or
  - Add a small cron that retries failed transfers (e.g. from a `platform_fee_transfers` table).

## Summary

| What                | Where |
|---------------------|--------|
| 90% (prize pool)    | Main Stripe account (used for payouts to winners) |
| 10% (platform fee)  | Fees Connect account (`STRIPE_FEES_ACCOUNT_ID`)   |

After setup, every successful buy-in payment triggers a transfer of the 10% to the fees account so your cut and user money stay in separate Stripe accounts.
