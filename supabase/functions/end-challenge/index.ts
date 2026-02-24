/**
 * end-challenge — Refund all participants and reset the challenge.
 * Only the goal list owner can call this. Refunds each succeeded payment via Stripe,
 * marks payments as refunded, resets goal_list totals/winner, and sets participants back to unpaid.
 *
 * POST body: { goal_list_id, user_id }
 * Secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno"

const stripe = new Stripe((Deno.env.get("STRIPE_SECRET_KEY") || "").trim(), {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } })
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const { goal_list_id, user_id } = await req.json()
    if (!goal_list_id || !user_id) return json({ error: "Missing goal_list_id or user_id" }, 400)

    const { data: list, error: listError } = await supabase
      .from("goal_lists")
      .select("id, user_id")
      .eq("id", goal_list_id)
      .single()

    if (listError || !list) return json({ error: "Goal list not found" }, 404)
    if (list.user_id !== user_id) return json({ error: "Only the list owner can end the challenge" }, 403)

    const { data: payments } = await supabase
      .from("payments")
      .select("id, stripe_payment_intent_id, amount, user_id")
      .eq("goal_list_id", goal_list_id)
      .eq("status", "succeeded")

    const toRefund = (payments || []).filter((p) => p.stripe_payment_intent_id)
    for (const p of toRefund) {
      try {
        await stripe.refunds.create({ payment_intent: p.stripe_payment_intent_id })
      } catch (err) {
        console.error("Refund failed for", p.stripe_payment_intent_id, err)
        return json({ error: `Refund failed: ${err.message}` }, 400)
      }
      await supabase.from("payments").update({ status: "refunded" }).eq("id", p.id)
    }

    await supabase
      .from("goal_lists")
      .update({
        prize_pool_amount: 0,
        platform_fee_amount: 0,
        total_pot: 0,
        all_paid: false,
        started_at: null,
        winner_id: null,
        tie_winner_ids: null,
        payout_status: "pending",
      })
      .eq("id", goal_list_id)

    await supabase
      .from("group_goal_participants")
      .update({ payment_status: "pending" })
      .eq("goal_list_id", goal_list_id)

    return json({ ok: true, refunded: toRefund.length })
  } catch (e) {
    console.error("end-challenge error:", e)
    return json({ error: String(e) }, 500)
  }
})
