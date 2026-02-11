# Setup Edge Function via Dashboard (No CLI!)

## Super Simple - Just Copy/Paste in Browser

### Step 1: Go to Supabase Dashboard
1. Open https://supabase.com/dashboard
2. Select your project
3. Click **"Edge Functions"** in the left sidebar

### Step 2: Create New Function
1. Click **"Create a new function"**
2. Name it: `create-payment-intent`
3. Click **"Create function"**

### Step 3: Paste This Code
Delete everything in the editor and paste this:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
})

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    })
  }

  try {
    const { goal_list_id, amount, user_id } = await req.json()

    if (!goal_list_id || !amount || !user_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: goal_list_id, amount, user_id" }),
        { 
          status: 400, 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          } 
        }
      )
    }

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
      { 
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        } 
      }
    )
  } catch (error) {
    console.error("Error creating payment intent:", error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        } 
      }
    )
  }
})
```

### Step 4: Set Secret Key
1. Click **"Secrets"** tab (or go to Settings → Edge Functions → Secrets)
2. Click **"Add secret"**
3. Name: `STRIPE_SECRET_KEY`
4. Value: `sk_test_your_stripe_secret_key_here`
5. Click **"Save"**

### Step 5: Deploy
1. Click **"Deploy"** button (top right)
2. Wait for it to deploy (usually 10-30 seconds)

## Done! 🎉

That's it! No CLI, no terminal, just copy/paste in the browser. The app will automatically use this function.

