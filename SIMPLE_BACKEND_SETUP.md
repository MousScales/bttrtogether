# Simple Backend Setup (No Webhooks!)

You only need **ONE simple endpoint** to create payment intents. Everything else is handled in the app!

## Option 1: Supabase Edge Function (Recommended - Easiest)

### Step 1: Create Edge Function

1. Go to Supabase Dashboard → Edge Functions
2. Click "Create a new function"
3. Name it: `create-payment-intent`
4. Paste this code:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
})

serve(async (req) => {
  try {
    const { goal_list_id, amount, user_id } = await req.json()

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: "usd",
      metadata: {
        goal_list_id,
        user_id,
      },
    })

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      }),
      { headers: { "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )
  }
})
```

### Step 2: Set Secret Key

1. Go to Edge Functions → Settings
2. Add secret: `STRIPE_SECRET_KEY` = `sk_test_your_stripe_secret_key_here`
3. Deploy the function

**That's it!** The app will automatically call this function.

---

## Option 2: Simple Node.js/Express Backend (Alternative)

If you prefer a separate backend, create just this one file:

### `server.js`

```javascript
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ONLY ONE ENDPOINT NEEDED!
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { goal_list_id, amount, user_id } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        goal_list_id,
        user_id,
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### Install dependencies:
```bash
npm install express stripe cors
```

### Set environment variable:
```bash
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
```

### Update the app:
If using Option 2, update `GroupGoalPaymentScreen.js` line 30 to use your backend URL instead of Supabase function.

---

## That's It!

- ✅ No webhooks needed
- ✅ No complex backend
- ✅ Payment confirmation happens directly in the app
- ✅ Database updates happen automatically after payment succeeds

The app handles everything else!

