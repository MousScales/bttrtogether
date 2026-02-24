# Supabase CLI – setup and check commands

Your project is **linked** and the CLI is ready. Here’s what was checked and how to fix the Stripe secret.

---

## What’s already done

- **Supabase CLI:** installed (v2.53.6)
- **Project linked:** `xwkgmewbzohylnjirxaw` (MousScales's Project)
- **Edge Functions:** `super-handler`, `process-payout`, and others are deployed and ACTIVE
- **Secrets:** `STRIPE_SECRET_KEY` exists, but its **value is wrong** (not a real Stripe `sk_live_...` key), so the function returns "Stripe is not configured"

---

## Fix Stripe secret (required for payments)

Set the correct Stripe secret in Supabase. Use the **exact same** value as in your `.env` (the line that starts with `STRIPE_SECRET_KEY=sk_live_...`).

**Option A – Using the CLI (run from project root):**

```bash
cd /Users/phill/Documents/bttrTogether/bttrtogether
supabase secrets set STRIPE_SECRET_KEY='YOUR_FULL_sk_live_OR_sk_test_KEY_HERE'
```

Replace `YOUR_FULL_sk_live_OR_sk_test_KEY_HERE` with your **full** secret key from `.env` (copy the whole value after `STRIPE_SECRET_KEY=`). Use single quotes so the shell doesn’t break on special characters.

**Option B – Using the Dashboard:**

1. Open: https://supabase.com/dashboard/project/xwkgmewbzohylnjirxaw/settings/functions  
2. Under **Edge Function Secrets**, edit **STRIPE_SECRET_KEY**  
3. Paste your full Stripe secret key (starts with `sk_live_` or `sk_test_`)  
4. Save  

No need to redeploy the function; it will use the new secret on the next request.

---

## Useful CLI commands (from project root)

```bash
cd /Users/phill/Documents/bttrTogether/bttrtogether
```

| What | Command |
|------|--------|
| Link project (if needed) | `supabase link --project-ref xwkgmewbzohylnjirxaw` |
| List secret names (not values) | `supabase secrets list` |
| Set a secret | `supabase secrets set NAME='value'` |
| List deployed functions | `supabase functions list` |
| Deploy super-handler | `supabase functions deploy super-handler` |
| Deploy all functions | `supabase functions deploy` |
| List projects | `supabase projects list` |
| Supabase login | `supabase login` |

---

## After fixing STRIPE_SECRET_KEY

1. Run one of the “Fix Stripe secret” options above.  
2. Try a payment again in the app (Card, Apple Pay, or Cash App).  
3. If you still see “Stripe is not configured”, double-check that the pasted key starts with `sk_live_` or `sk_test_` and has no extra spaces or line breaks.
