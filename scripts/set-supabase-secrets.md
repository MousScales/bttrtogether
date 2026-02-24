# Set Supabase secrets (Stripe, etc.)

Run these in your project root. Replace the placeholder values with your real values **after** rotating any exposed keys.

**Rotate your Stripe secret key first:**  
Stripe Dashboard → Developers → API keys → Roll key (then use the new key below).

```bash
# Stripe (required for super-handler, process-payout, stripe-webhook)
npx supabase secrets set STRIPE_SECRET_KEY=sk_live_YOUR_NEW_SECRET_KEY

# Optional: for stripe-webhook (10% to separate account)
# npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
# npx supabase secrets set STRIPE_FEES_ACCOUNT_ID=acct_xxx

# Supabase (usually set automatically when linked; set if missing)
# npx supabase secrets set SUPABASE_URL=https://xwkgmewbzohylnjirxaw.supabase.co
# npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Push notifications
# npx supabase secrets set EXPO_ACCESS_TOKEN=your_expo_token
```

**Local .env:**  
Copy `.env.example` to `.env`, then set `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `STRIPE_SECRET_KEY` (and other vars) with your **new** keys. Never commit `.env`.
