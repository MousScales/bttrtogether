/**
 * Rapyd webhook handler. Handles PAYMENT_SUCCEEDED: records payment and updates
 * goal list / participants (same logic as app's processPaymentSuccess).
 * Set RAPYD_WEBHOOK_SECRET in Supabase secrets and configure this URL in Rapyd Client Portal.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
)

const PLATFORM_FEE_PERCENT = 0.10

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405)
  }

  try {
    const rawBody = await req.text()
    const payload = JSON.parse(rawBody) as {
      type?: string
      data?: {
        id?: string
        metadata?: { goal_list_id?: string; user_id?: string }
        amount?: number
      }
    }

    if (payload.type !== "PAYMENT_SUCCEEDED" && payload.type !== "payment_succeeded") {
      return json({ received: true })
    }

    const data = payload.data
    const paymentId = data?.id
    const metadata = data?.metadata || {}
    const goalListId = metadata.goal_list_id
    const userId = metadata.user_id
    const amount = data?.amount

    if (!goalListId || !userId || !paymentId) {
      console.error("Rapyd webhook missing goal_list_id, user_id, or payment id:", payload)
      return json({ error: "Missing metadata" }, 400)
    }

    const paidAmount = typeof amount === "number" ? amount : parseFloat(String(amount || 0))
    if (paidAmount <= 0) {
      return json({ error: "Invalid amount" }, 400)
    }

    const platformFeeContribution = Math.round(paidAmount * PLATFORM_FEE_PERCENT * 100) / 100
    const prizePoolContribution = Math.round((paidAmount - platformFeeContribution) * 100) / 100

    const { data: existing } = await supabase
      .from("payments")
      .select("id")
      .eq("goal_list_id", goalListId)
      .eq("user_id", userId)
      .eq("rapyd_payment_id", paymentId)
      .maybeSingle()

    if (existing) {
      return json({ received: true, already_processed: true })
    }

    const { data: checkoutRow } = await supabase
      .from("rapyd_checkouts")
      .select("id, checkout_id")
      .eq("goal_list_id", goalListId)
      .eq("user_id", userId)
      .is("rapyd_payment_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const checkoutId = checkoutRow?.checkout_id || null

    const { error: insErr } = await supabase.from("payments").insert({
      goal_list_id: goalListId,
      user_id: userId,
      amount: paidAmount,
      rapyd_payment_id: paymentId,
      rapyd_checkout_id: checkoutId,
      status: "succeeded",
      prize_pool_contribution: prizePoolContribution,
      platform_fee_contribution: platformFeeContribution,
    })

    if (insErr) {
      console.error("payments insert error:", insErr)
      return json({ error: insErr.message }, 500)
    }

    if (checkoutRow?.id) {
      await supabase
        .from("rapyd_checkouts")
        .update({ rapyd_payment_id: paymentId })
        .eq("id", checkoutRow.id)
    }

    await supabase
      .from("group_goal_participants")
      .update({ payment_status: "paid" })
      .eq("goal_list_id", goalListId)
      .eq("user_id", userId)

    const { data: goalList } = await supabase
      .from("goal_lists")
      .select("total_pot, prize_pool_amount, platform_fee_amount")
      .eq("id", goalListId)
      .single()

    if (goalList) {
      const newTotal = (goalList.total_pot || 0) + paidAmount
      const newPrizePool = (goalList.prize_pool_amount || 0) + prizePoolContribution
      const newPlatformFee = (goalList.platform_fee_amount || 0) + platformFeeContribution
      await supabase
        .from("goal_lists")
        .update({
          total_pot: newTotal,
          prize_pool_amount: newPrizePool,
          platform_fee_amount: newPlatformFee,
        })
        .eq("id", goalListId)

      const { data: participants } = await supabase
        .from("group_goal_participants")
        .select("payment_status")
        .eq("goal_list_id", goalListId)
      const allPaid = participants?.every((p) => p.payment_status === "paid")
      if (allPaid) {
        await supabase.from("goal_lists").update({ all_paid: true }).eq("id", goalListId)
      }
    }

    return json({ received: true })
  } catch (e) {
    console.error("rapyd-webhook error:", e)
    return json({ error: (e as Error).message }, 500)
  }
})
