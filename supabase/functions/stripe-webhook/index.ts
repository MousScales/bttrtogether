/**
 * stripe-webhook — Stripe webhook handler (Supabase Edge Function).
 *
 * Listens for payment_intent.succeeded. When a buy-in payment succeeds,
 * transfers the 10% platform fee to a dedicated Stripe Connect account
 * (STRIPE_FEES_ACCOUNT_ID) so your cut and user funds are separated.
 *
 * Secrets:
 *   STRIPE_SECRET_KEY       — Platform Stripe secret key
 *   STRIPE_WEBHOOK_SECRET   — Webhook signing secret (from Stripe Dashboard)
 *   STRIPE_FEES_ACCOUNT_ID  — Connect account id (acct_xxx) that receives the 10%
 *
 * In Stripe Dashboard: Developers → Webhooks → Add endpoint → URL = this function,
 * Event: payment_intent.succeeded. Use the signing secret as STRIPE_WEBHOOK_SECRET.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno"

const stripe = new Stripe((Deno.env.get("STRIPE_SECRET_KEY") || "").trim(), {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
})

serve(async (req) => {
  if (req.method === "POST" && req.headers.get("content-type")?.includes("application/json")) {
    // Stripe requires the raw body for signature verification; do not parse as JSON first
    const rawBody = await req.text()
    const sig = req.headers.get("stripe-signature")
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")

    if (!sig || !webhookSecret) {
      return new Response(JSON.stringify({ error: "Missing Stripe signature or STRIPE_WEBHOOK_SECRET" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message)
      return new Response(JSON.stringify({ error: `Webhook Error: ${err.message}` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      const meta = paymentIntent.metadata || {}
      const platformFeeDollars = meta.platform_fee_contribution

      if (platformFeeDollars != null && platformFeeDollars !== "") {
        const feeCents = Math.round(parseFloat(platformFeeDollars) * 100)
        const feesAccountId = Deno.env.get("STRIPE_FEES_ACCOUNT_ID")?.trim()

        if (feeCents > 0 && feesAccountId) {
          try {
            await stripe.transfers.create({
              amount: feeCents,
              currency: (paymentIntent.currency as string) || "usd",
              destination: feesAccountId,
              description: `Platform fee · PI ${paymentIntent.id}`,
              metadata: {
                payment_intent_id: paymentIntent.id,
                goal_list_id: meta.goal_list_id || "",
                user_id: meta.user_id || "",
              },
            })
          } catch (transferErr) {
            // e.g. insufficient available balance (funds may still be pending)
            console.error("Transfer to fees account failed:", transferErr.message)
            // Still return 200 so Stripe doesn't retry forever; log for manual/cron retry
          }
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  })
})
