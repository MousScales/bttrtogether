# Supabase CLI Setup Guide

## Step 1: Install Supabase CLI

### Windows (PowerShell):
```powershell
# Using Scoop
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Or using npm
npm install -g supabase
```

### Mac:
```bash
brew install supabase/tap/supabase
```

### Or download directly:
Visit: https://github.com/supabase/cli/releases

## Step 2: Login to Supabase

```bash
supabase login
```

This will open your browser to authenticate.

## Step 3: Link Your Project

```bash
# Get your project reference ID from Supabase Dashboard
# Go to: Settings → General → Reference ID

supabase link --project-ref your-project-ref-id
```

## Step 4: Set the Stripe Secret Key

```bash
# Set the secret key for the Edge Function
supabase secrets set STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
```

## Step 5: Deploy the Function

```bash
# Deploy the create-payment-intent function
supabase functions deploy create-payment-intent
```

## Step 6: Test It (Optional)

```bash
# Test the function locally first
supabase functions serve create-payment-intent

# In another terminal, test it:
curl -X POST http://localhost:54321/functions/v1/create-payment-intent \
  -H "Content-Type: application/json" \
  -d '{"goal_list_id":"test","amount":10,"user_id":"test"}'
```

## That's It! 🎉

Your Edge Function is now deployed and ready to use. The app will automatically call it when users need to make payments.

## Troubleshooting

### Function not found?
Make sure you're in the project root directory and the function exists at:
```
supabase/functions/create-payment-intent/index.ts
```

### Secret key not working?
Verify the secret is set:
```bash
supabase secrets list
```

### Need to update the function?
Just redeploy:
```bash
supabase functions deploy create-payment-intent
```

## Quick Commands Reference

```bash
# Login
supabase login

# Link project
supabase link --project-ref YOUR_PROJECT_REF

# Set secret
supabase secrets set STRIPE_SECRET_KEY=your_key_here

# Deploy function
supabase functions deploy create-payment-intent

# View logs
supabase functions logs create-payment-intent

# List secrets
supabase secrets list
```



