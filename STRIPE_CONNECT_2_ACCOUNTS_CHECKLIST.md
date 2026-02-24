# What You Need to Make Connect Work With 2 Accounts

You already have:
- **Main Stripe account** – receives buy-ins (pk_live_ / sk_live_ in .env and Supabase).
- **stripe-webhook** Edge Function – code is ready; it transfers 10% to a second account when a payment succeeds.

To make the **2-account split** work (main = prize pool, second = your 10% fees), you need to do **3 things** and give the app **2 values**.

---

## 1. Create the “fees” Connect account (in Stripe)

1. Log in to [Stripe Dashboard](https://dashboard.stripe.com) (your main account).
2. Go to **Connect** → **Accounts** → **Add account**.
3. Create a **Standard** or **Express** account (e.g. business name: “BttrTogether Platform Fees”).
4. Finish onboarding.
5. Copy the new account’s ID – it looks like **`acct_1ABC2def3GHI4jkl`**.

**→ You need to provide:** that **`acct_...`** value (we’ll set it as `STRIPE_FEES_ACCOUNT_ID`).

---

## 2. Add the webhook in Stripe

1. In Stripe: **Developers** → **Webhooks** → **Add endpoint**.
2. **Endpoint URL:**  
   `https://xwkgmewbzohylnjirxaw.supabase.co/functions/v1/stripe-webhook`
3. **Events:** select **`payment_intent.succeeded`**.
4. Click **Add endpoint**.
5. Open the new endpoint and click **Reveal** under **Signing secret** – copy the value (starts with **`whsec_`**).

**→ You need to provide:** that **`whsec_...`** value (we’ll set it as `STRIPE_WEBHOOK_SECRET`).

---

## 3. Deploy the webhook and set the two secrets

After you have the two values above, run (replace with your real values):

```bash
npx supabase functions deploy stripe-webhook
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
npx supabase secrets set STRIPE_FEES_ACCOUNT_ID=acct_xxxxxxxxxxxx
```

`STRIPE_SECRET_KEY` is already set in Supabase from earlier.

---

## Summary: what we need from you

| What | Where you get it | Where it goes |
|------|------------------|---------------|
| **Fees account ID** | Connect → Accounts → Add account → copy ID | `STRIPE_FEES_ACCOUNT_ID` (Supabase secret) |
| **Webhook signing secret** | Developers → Webhooks → Add endpoint → Signing secret | `STRIPE_WEBHOOK_SECRET` (Supabase secret) |

Once you have the **`acct_...`** and **`whsec_...`** values, you can set them in Supabase (step 3). After that, the 2-account Connect flow is active: each successful buy-in sends 10% to the fees account and leaves 90% on the main account.
