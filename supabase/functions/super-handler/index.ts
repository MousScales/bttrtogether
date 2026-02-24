import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno"

const stripe = new Stripe((Deno.env.get("STRIPE_SECRET_KEY") || "").trim(), {
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
    // Parse the request body
    // We're not requiring JWT validation - we'll validate user_id from the request body
    // This allows the function to work with just the anon key
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

    // Basic validation - ensure user_id is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(user_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid user_id format" }),
        { 
          status: 400, 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          } 
        }
      )
    }

    // --- Fee split (10% platform fee, 90% prize pool) ---
    const PLATFORM_FEE_PERCENT = 0.10;
    const platformFeeAmount = Math.round(amount * PLATFORM_FEE_PERCENT * 100) / 100; // dollars
    const prizePoolAmount    = Math.round((amount - platformFeeAmount) * 100) / 100;  // dollars

    // Create PaymentIntent with specific payment configuration
    // When using payment_method_configuration you must enable automatic_payment_methods
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      payment_method_configuration: 'pmc_1SzSj4RwOzsJN1cm5UV9euv1',
      metadata: {
        goal_list_id,
        user_id,
        prize_pool_contribution:   String(prizePoolAmount),
        platform_fee_contribution: String(platformFeeAmount),
      },
    })

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        prizePoolContribution:   prizePoolAmount,
        platformFeeContribution: platformFeeAmount,
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

