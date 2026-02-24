# Apple Pay & Cash App Pay Setup

## What was fixed in code

1. **Apple Pay**  
   The app now uses Stripe’s **Platform Pay** API (`confirmPlatformPayPayment`) instead of `confirmPayment` with `ApplePay`. That’s the supported way to run Apple Pay in React Native and fixes “payment is not supported yet”.

2. **Cash App “No such payment_intent”**  
   The backend no longer uses a hardcoded **Payment Method Configuration** ID. PaymentIntents are created with `automatic_payment_methods: { enabled: true }` so they work with Card, Apple Pay, and Cash App using your Stripe account’s default configuration.

3. **Key mismatch**  
   “No such payment_intent” usually means the **publishable key** in the app and the **secret key** in the backend are from different Stripe accounts or modes (test vs live). They must match.

---

## Checklist

### 1. Use the same Stripe account and mode

- **App** (e.g. `.env`): `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...` or `pk_live_...`
- **Supabase** (Edge Function secrets): `STRIPE_SECRET_KEY=sk_test_...` or `sk_live_...`

Rule:  
- If the app uses `pk_test_...`, the function must use `sk_test_...` from the **same** Stripe account.  
- If the app uses `pk_live_...`, the function must use `sk_live_...` from the **same** Stripe account.

### 2. Enable Apple Pay (Stripe Dashboard)

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → **Settings** → **Payment methods**.
2. Enable **Apple Pay**.
3. Add your **Apple Pay merchant ID** (e.g. `merchant.com.mousscales.bttrtogether`) in the Apple Pay settings.  
   This must match the `merchantIdentifier` in your app (e.g. in `App.js`: `merchantIdentifier="merchant.com.mousscales.bttrtogether"`).
4. Complete any domain/verification steps Stripe shows for Apple Pay.

### 3. Enable Cash App Pay (Stripe Dashboard)

1. In the same **Payment methods** section, enable **Cash App Pay**.
2. Cash App Pay is US-only and has eligibility requirements; if it’s available for your account, it will appear there.

### 4. Apple Pay on device/simulator

- **Real device**: Add a card in **Settings → Wallet & Apple Pay** so Apple Pay is available.
- **Simulator**: In **Wallet**, add a test card. Apple Pay in the simulator can still show “not supported” until the merchant ID and Stripe Apple Pay setup are correct.

### 5. Redeploy Supabase function (after backend change)

If you changed the Edge Function (e.g. `super-handler`), redeploy so the backend uses the updated code:

```bash
supabase functions deploy super-handler
```

Set the secret if needed:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_your_key_here
```

---

## Quick test

1. **Card**: Use test card `4242 4242 4242 4242` (test mode).
2. **Apple Pay**: Use a device with Wallet set up and the same Stripe account + merchant ID configured as above.
3. **Cash App**: Ensure app and backend use the **same** Stripe keys (same account, same mode); then try Cash App Pay when enabled for your account.

If you still see “No such payment_intent” for Cash App, double-check that the publishable key in the app and the secret key in the Supabase function are from the same Stripe account and both test or both live.
