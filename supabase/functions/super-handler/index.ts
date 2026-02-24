import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno"

const secretKey = (Deno.env.get("STRIPE_SECRET_KEY") || "").trim()
if (!secretKey || !secretKey.startsWith("sk_")) {
  console.error("STRIPE_SECRET_KEY is missing or invalid in Supabase Edge Function secrets. Set it in Dashboard → Project Settings → Edge Functions → Secrets. Use the secret key from the SAME Stripe account as your app's EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY.")
}

const stripe = new Stripe(secretKey || "sk_missing", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
)

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS })
}

serve(async (req) => {
  if (!secretKey || !secretKey.startsWith("sk_")) {
    return json({
      error: "Stripe is not configured. In Supabase Dashboard → Project Settings → Edge Functions → Secrets, set STRIPE_SECRET_KEY to your Stripe secret key (use sk_live_... for live). Same Stripe account as your app's publishable key. Then run: npx supabase functions deploy super-handler",
    }, 503)
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    })
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  try {
    const body = await req.json()
    const { action, goal_list_id, amount, user_id, payment_method_id, stripe_customer_id: bodyCustomerId } = body

    if (!user_id || !uuidRegex.test(user_id)) {
      return json({ error: "Missing or invalid user_id" }, 400)
    }

    // --- list_payment_methods: return saved cards for paying (used in Settings and payment screen) ---
    if (action === "list_payment_methods") {
      let customerId = bodyCustomerId
      if (!customerId) {
        const { data: profile } = await supabase.from("profiles").select("stripe_customer_id").eq("id", user_id).single()
        customerId = profile?.stripe_customer_id ?? null
      }
      if (!customerId) {
        const customer = await stripe.customers.create({ metadata: { user_id } })
        customerId = customer.id
        await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user_id)
      }
      const list = await stripe.paymentMethods.list({ customer: customerId, type: "card" })
      const payment_methods = (list.data || []).map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand ?? "card",
        last4: pm.card?.last4 ?? "",
      }))
      return json({ payment_methods, stripe_customer_id: customerId })
    }

    // --- attach_payment_method: save a card for future payments (and show in Settings) ---
    if (action === "attach_payment_method") {
      const pmId = typeof body.payment_method_id === "string" ? body.payment_method_id.trim() : ""
      if (!pmId || !pmId.startsWith("pm_")) {
        return json({ error: "Missing or invalid payment_method_id" }, 400)
      }
      let customerId = bodyCustomerId
      if (!customerId) {
        const { data: profile } = await supabase.from("profiles").select("stripe_customer_id").eq("id", user_id).single()
        customerId = profile?.stripe_customer_id ?? null
      }
      if (!customerId) {
        const customer = await stripe.customers.create({ metadata: { user_id } })
        customerId = customer.id
        await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user_id)
      }
      await stripe.paymentMethods.attach(pmId, { customer: customerId })
      return json({ success: true, stripe_customer_id: customerId })
    }

    // --- Create PaymentIntent (default: goal_list_id, amount, user_id; optional stripe_customer_id for saved cards) ---
    if (!goal_list_id || amount == null) {
      return json({ error: "Missing required fields: goal_list_id, amount" }, 400)
    }

    const PLATFORM_FEE_PERCENT = 0.10
    const platformFeeAmount = Math.round(amount * PLATFORM_FEE_PERCENT * 100) / 100
    const prizePoolAmount = Math.round((amount - platformFeeAmount) * 100) / 100

    let customerId = bodyCustomerId
    if (!customerId) {
      const { data: profile } = await supabase.from("profiles").select("stripe_customer_id").eq("id", user_id).single()
      customerId = profile?.stripe_customer_id ?? null
    }

    const piParams: Stripe.PaymentIntentCreateParams = {
      amount: Math.round(amount * 100),
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        goal_list_id,
        user_id,
        prize_pool_contribution: String(prizePoolAmount),
        platform_fee_contribution: String(platformFeeAmount),
      },
    }
    if (customerId) {
      piParams.customer = customerId
    }

    const paymentIntent = await stripe.paymentIntents.create(piParams)

    return json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      prizePoolContribution: prizePoolAmount,
      platformFeeContribution: platformFeeAmount,
      stripe_customer_id: customerId ?? undefined,
    })
  } catch (error) {
    console.error("super-handler error:", error)
    return json({ error: (error as Error).message }, 400)
  }
})

