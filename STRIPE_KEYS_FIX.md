# Fix "No such payment_intent" – Stripe keys must match

The error **"No such payment_intent: 'pi_...'"** means:

- The **PaymentIntent** was created by your **Supabase Edge Function** (using `STRIPE_SECRET_KEY`).
- The **app** is using a **different** Stripe key (`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`).
- Stripe only finds a PaymentIntent in the **same** account as the key used to confirm it. So if the keys are from different accounts (or one test / one live), you get "No such payment_intent".

---

## Fix in 3 steps

### 1. Get the correct secret key from Stripe

1. Open [Stripe Dashboard](https://dashboard.stripe.com) and sign in.
2. Make sure you’re in **Test** or **Live** mode to match your app (toggle in the top right).
3. Go to **Developers → API keys**.
4. Copy the **Secret key** (`sk_test_...` or `sk_live_...`).  
   Use the key from the **same** Stripe account (and same mode) as the **Publishable key** in your app’s `.env`.

### 2. Set the secret in Supabase

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **Project Settings** (gear) → **Edge Functions**.
3. Under **Secrets**, add or edit:
   - **Name:** `STRIPE_SECRET_KEY`
   - **Value:** the secret key you copied (`sk_test_...` or `sk_live_...`).
4. Save.

### 3. Redeploy the function

From your project root (where `supabase` is configured):

```bash
cd bttrtogether
supabase functions deploy super-handler
```

If you use a different Supabase project or CLI setup, run the deploy command that applies to you.

---

## Check that keys match

- **App** (e.g. in `.env`):  
  `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...` or `pk_live_...`
- **Supabase** (Edge Function secret):  
  `STRIPE_SECRET_KEY=sk_test_...` or `sk_live_...`

Rule:

- If the app uses **`pk_test_...`** → Supabase must use **`sk_test_...`** from the **same** Stripe account.
- If the app uses **`pk_live_...`** → Supabase must use **`sk_live_...`** from the **same** Stripe account.

You can confirm they’re from the same account in Stripe Dashboard → Developers → API keys: the publishable and secret keys listed there are the pair to use.

---

## After fixing

1. Restart the app (or reload).
2. Try the payment again (Card, Apple Pay, or Cash App).

If the keys are from the same account and mode, "No such payment_intent" will go away and Apple Pay / Cash App can work.
