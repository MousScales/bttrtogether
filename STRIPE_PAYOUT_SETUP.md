# Stripe Payouts – Bank account linking

Winners add a bank account **in the app** (no separate Stripe signup) and then claim winnings. The flow uses **Stripe Connect Custom** so users only enter name, routing number, and account number—like Depop.

## How it works

1. **User pays to join a money challenge**  
   Payments go to **your platform Stripe account** (e.g. via `create-payment-intent`).

2. **Winner opens “Claim winnings” (PayoutScreen)**  
   - **Step 1 – Add bank:** User enters **name on account**, **routing number**, and **account number** in the app. The app calls `process-payout` with `action: "add_bank"`. The function creates (or reuses) a Stripe Connect **Custom** account and attaches the bank account—no browser redirect or Stripe onboarding.  
   - **Step 2 – Claim:** User taps “Claim $X”. The function runs `action: "transfer"` and moves the prize from your platform balance to their connected account. Stripe pays out to their bank (usually within 2 business days).

So: **payments → your Stripe balance; payouts → winner’s bank via Connect Custom.**

---

## 1. Stripe Dashboard – Enable Connect

1. Log in to [Stripe Dashboard](https://dashboard.stripe.com).
2. Go to **Connect** (or **Connect → Settings**).
3. If prompted, complete **Connect onboarding** for your platform.
4. This flow uses **Custom** connected accounts (created by the app when the user adds bank details). No Express onboarding or return URL is required for the main flow.

---

## 2. Database – Tables and columns

The `process-payout` function expects:

- **`stripe_connect_accounts`** – one row per user who has started/complete bank linking (`user_id`, `stripe_account_id`, `onboarding_completed`).
- **`payouts`** – one row per payout (`goal_list_id`, `winner_id`, `payout_amount`, `stripe_transfer_id`, `status`, etc.).
- **`goal_lists`** – columns like `prize_pool_amount`, `platform_fee_amount`, `total_pot`, `payout_status`, `winner_id`, `tie_winner_ids`.

Run the migrations that define these. For example, from your repo:

- **`prize_pool_migration.sql`** – run this in the Supabase SQL Editor. It adds the `goal_lists` columns and creates `stripe_connect_accounts` (and related RLS).  
- Ensure the **`payouts`** table exists (from STRIPE_PAYMENT_SETUP.md or your existing schema) and has at least: `goal_list_id`, `winner_id`, `total_amount`, `payout_amount`, `stripe_transfer_id`, `status`, and optionally `stripe_connect_account_id`.

---

## 3. Supabase Edge Function – Secrets

The **`process-payout`** Edge Function needs your Stripe secret key and Supabase service role key.

1. In Supabase: **Project → Edge Functions → process-payout** (or deploy it if you haven’t).
2. Set **secrets** (Supabase Dashboard → Project Settings → Edge Functions → Secrets, or via CLI):

| Secret                         | Description |
|--------------------------------|-------------|
| `STRIPE_SECRET_KEY`            | Your Stripe **secret** key (e.g. `sk_test_...` or `sk_live_...`). |
| `SUPABASE_SERVICE_ROLE_KEY`     | From Supabase **Project Settings → API**: the `service_role` key (not the anon key). |

- `SUPABASE_URL` is provided by Supabase when the function runs; you don’t need to set it.

CLI example:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxxx
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Redeploy the function after changing secrets:

```bash
supabase functions deploy process-payout
```

---

## 4. Return URL (optional)

The main flow does **not** open Stripe in the browser, so a return URL is not required. If you add an optional browser-based path later, you can host **`invite-page/payout-return.html`** at `/payout-return` on your invite site so it redirects to `bttrtogether://payout`.

---

## 5. Money must reach your Stripe account

Payouts **transfer from your platform’s Stripe balance** to the winner’s Connect account. So:

- When participants pay to join a money challenge, the Payment Intent must be created **on your platform** (using your `STRIPE_SECRET_KEY`), with no `transfer_data` to another account. That way funds land in your balance.
- Your **create-payment-intent** Supabase function (or backend) already does this if it uses `stripe.paymentIntents.create({ amount, currency, metadata })` with no `transfer_data`. Don’t add a destination account there; keep payments going to the platform.

---

## 6. Testing payouts

1. **Use Stripe test mode** (test API keys).
2. In the app, as a **winner** of a money challenge, open the payout/claim screen.
3. Enter **name on account**, **routing number**, and **account number** (use [Stripe test bank details](https://stripe.com/docs/testing#ach-direct-debit)); tap **Add bank account**.
4. Tap **Claim $X** to send the prize. In Stripe Dashboard: **Connect → Accounts** and **Balance → Transfers** to see the Custom account and the transfer.

If something fails, check:

- Edge Function logs (Supabase → Edge Functions → process-payout → Logs).
- Stripe Dashboard → **Developers → Logs** for Connect and Transfer errors.
- That `prize_pool_amount` / `total_pot` for the goal list is set and that the logged-in user is the declared winner (or one of the tied winners).

---

## Summary checklist

- [ ] **Stripe Connect** enabled (Custom accounts are created by the app).
- [ ] **Database**: `stripe_connect_accounts`, `payouts`, and `goal_lists` columns (from `prize_pool_migration.sql` and payouts schema) applied in Supabase.
- [ ] **Secrets** for `process-payout`: `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] **Payments** for challenges go to the platform (no `transfer_data` on Payment Intents).
- [ ] Test in test mode: add bank (test routing/account numbers) → claim winnings.

After this, winners can add a bank account in the app and claim winnings without leaving the app or creating a separate Stripe account.
