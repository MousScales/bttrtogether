# Simple Payment Setup - No Webhooks!

## ✅ What You Need to Do

### Step 1: Run Database Schema
Run the SQL from `STRIPE_PAYMENT_SETUP.md` (Steps 1-4) in Supabase SQL Editor.

### Step 2: Create ONE Simple Endpoint

**Choose ONE option:**

#### Option A: Supabase Edge Function (Easiest - Recommended)
1. Go to Supabase Dashboard → Edge Functions
2. Create function: `create-payment-intent`
3. Copy code from `SIMPLE_BACKEND_SETUP.md`
4. Add secret: `STRIPE_SECRET_KEY` = your secret key
5. Deploy

**Done!** The app will automatically use it.

#### Option B: Simple Backend
1. Create a simple Node.js server (see `SIMPLE_BACKEND_SETUP.md`)
2. Update `GroupGoalPaymentScreen.js` line 30 to use your backend URL

### Step 3: Test It!

1. Create a group goal with bet amount
2. Add friends
3. Friend joins and pays
4. Payment is saved to database automatically
5. No webhooks needed!

## How It Works

1. **Payment Intent Creation**: App calls your simple endpoint to create payment
2. **Stripe Payment Sheet**: User pays via Stripe's secure payment sheet
3. **Direct Database Update**: After payment succeeds, app updates Supabase directly
4. **No Webhooks**: Everything happens in real-time in the app

## What Gets Updated Automatically

- ✅ `payments` table - Payment record saved
- ✅ `group_goal_participants` - Payment status updated to 'paid'
- ✅ `goal_lists.total_pot` - Total pot increased
- ✅ `goal_lists.all_paid` - Set to true when everyone pays

## That's It!

No webhooks, no complex backend, no extra setup. Just one simple endpoint and you're done! 🎉





