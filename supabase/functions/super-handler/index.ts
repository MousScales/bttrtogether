import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno"

/** Rapyd API signed request (inlined to avoid _shared import at deploy). */
async function rapydFetch(
  method: string,
  path: string,
  body: unknown,
  accessKey: string,
  secretKey: string,
  baseUrl: string
): Promise<Response> {
  const salt = crypto.randomUUID().replace(/-/g, "").slice(0, 16)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const bodyString =
    body == null || (typeof body === "object" && Object.keys(body as object).length === 0)
      ? ""
      : JSON.stringify(body)
  const toSign = method.toLowerCase() + path + salt + timestamp + accessKey + secretKey + bodyString
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(toSign))
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)))
  const url = `${baseUrl.replace(/\/+$/, "")}${path}`
  return fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "access_key": accessKey,
      "salt": salt,
      "timestamp": timestamp,
      "signature": signature,
    },
    body: method !== "GET" && bodyString ? bodyString : undefined,
  })
}

const secretKey = (Deno.env.get("STRIPE_SECRET_KEY") || "").trim()
const rapydAccessKey = (Deno.env.get("RAPYD_ACCESS_KEY") || "").trim()
const rapydSecretKey = (Deno.env.get("RAPYD_SECRET_KEY") || "").trim()
const rapydBaseUrl = (Deno.env.get("RAPYD_BASE_URL") || "https://api.rapyd.net").replace(/\/+$/, "")

if (!secretKey || !secretKey.startsWith("sk_")) {
  console.error("STRIPE_SECRET_KEY is missing or invalid in Supabase Edge Function secrets.")
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

// Base URL for post-payment redirect (user taps "Return to app")
const RAPYD_COMPLETE_BASE = "https://bttrsite.vercel.app/rapyd-complete"

serve(async (req) => {
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

    // --- create_rapyd_checkout: create Rapyd hosted checkout, return redirect_url (used for payments) ---
    if (action === "create_rapyd_checkout") {
      if (!rapydAccessKey || !rapydSecretKey) {
        return json({ error: "Rapyd is not configured. Set RAPYD_ACCESS_KEY and RAPYD_SECRET_KEY in Supabase Edge Function secrets." }, 503)
      }
      if (!goal_list_id || !uuidRegex.test(goal_list_id) || amount == null || amount <= 0) {
        return json({ error: "Missing or invalid goal_list_id or amount" }, 400)
      }
      const amt = Math.round(parseFloat(String(amount)) * 100) / 100
      const PLATFORM_FEE_PERCENT = 0.10
      const platformFeeAmount = Math.round(amt * PLATFORM_FEE_PERCENT * 100) / 100
      const prizePoolAmount = Math.round((amt - platformFeeAmount) * 100) / 100
      const completeUrl = `${RAPYD_COMPLETE_BASE}?goal_list_id=${goal_list_id}&user_id=${user_id}`
      const expiration = Math.floor(Date.now() / 1000) + 3600
      const checkoutBody: Record<string, unknown> = {
        amount: amt.toFixed(2),
        country: "US",
        currency: "USD",
        language: "en",
        complete_payment_url: completeUrl,
        error_payment_url: `${RAPYD_COMPLETE_BASE}?error=1`,
        metadata: { goal_list_id, user_id },
        expiration: String(expiration),
      }
      const res = await rapydFetch("POST", "/v1/checkout", checkoutBody, rapydAccessKey, rapydSecretKey, rapydBaseUrl)
      const data = await res.json()
      if (!res.ok || data?.status?.status === "ERROR") {
        const msg = data?.status?.message || data?.error || "Rapyd checkout failed"
        console.error("Rapyd checkout error:", msg, data)
        return json({ error: msg }, 400)
      }
      const checkoutId = data?.data?.id
      const redirectUrl = data?.data?.redirect_url
      if (!checkoutId || !redirectUrl) {
        return json({ error: "Rapyd did not return checkout URL" }, 500)
      }
      const { error: insErr } = await supabase.from("rapyd_checkouts").insert({
        checkout_id: checkoutId,
        goal_list_id,
        user_id,
        amount: amt,
      })
      if (insErr) {
        console.error("rapyd_checkouts insert error:", insErr)
      }
      return json({
        redirect_url: redirectUrl,
        checkout_id: checkoutId,
        prizePoolContribution: prizePoolAmount,
        platformFeeContribution: platformFeeAmount,
      })
    }

    // --- confirm_rapyd_payment: after user returns from Rapyd, check if payment was recorded (by webhook) ---
    if (action === "confirm_rapyd_payment") {
      if (!goal_list_id || !uuidRegex.test(goal_list_id)) {
        return json({ error: "Missing or invalid goal_list_id" }, 400)
      }
      const { data: payment } = await supabase
        .from("payments")
        .select("id, amount, rapyd_payment_id, created_at")
        .eq("goal_list_id", goal_list_id)
        .eq("user_id", user_id)
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      const recent = payment?.created_at
        ? (Date.now() - new Date(payment.created_at).getTime() < 10 * 60 * 1000)
        : false
      return json({
        success: !!payment && recent,
        payment_id: payment?.id,
        amount: payment?.amount,
      })
    }

    // --- list_payment_methods (Stripe legacy): return saved cards ---
    if (action === "list_payment_methods") {
      if (!secretKey || !secretKey.startsWith("sk_")) {
        return json({ payment_methods: [], stripe_customer_id: null })
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
      const list = await stripe.paymentMethods.list({ customer: customerId, type: "card" })
      const payment_methods = (list.data || []).map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand ?? "card",
        last4: pm.card?.last4 ?? "",
      }))
      return json({ payment_methods, stripe_customer_id: customerId })
    }

    // --- attach_payment_method (Stripe legacy) ---
    if (action === "attach_payment_method") {
      if (!secretKey || !secretKey.startsWith("sk_")) {
        return json({ error: "Stripe is not configured" }, 503)
      }
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

    // --- Create PaymentIntent (Stripe legacy; used when app still uses Stripe) ---
    if (!goal_list_id || amount == null) {
      return json({ error: "Missing required fields: goal_list_id, amount" }, 400)
    }
    if (!secretKey || !secretKey.startsWith("sk_")) {
      return json({ error: "Stripe is not configured. Use Rapyd (create_rapyd_checkout) or set STRIPE_SECRET_KEY." }, 503)
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

