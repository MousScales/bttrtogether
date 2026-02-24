/**
 * process-payout  —  Supabase Edge Function
 *
 * Uses Stripe Connect EXPRESS accounts so Stripe handles all KYC / bank-account
 * collection through their hosted onboarding. No manual bank forms needed.
 *
 * Actions:
 *   "create_account" – Create/retrieve Express account → return hosted onboarding URL.
 *   "check_status"   – Is the account fully onboarded (payouts_enabled)?
 *   "transfer"       – Transfer prize pool to winner's connected account.
 *
 * Env secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno"

const stripe = new Stripe((Deno.env.get("STRIPE_SECRET_KEY") || "").trim(), {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")              || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  try {
    const body = await req.json()
    const { action, user_id, goal_list_id, return_url, external_account_id } = body

    if (!action || !user_id) {
      return jsonResponse({ error: "Missing required fields: action, user_id" }, 400)
    }
    if (!uuidRegex.test(user_id)) {
      return jsonResponse({ error: "Invalid user_id format" }, 400)
    }
    if (goal_list_id && !uuidRegex.test(goal_list_id)) {
      return jsonResponse({ error: "Invalid goal_list_id format" }, 400)
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------
    async function getOrCreateExpressAccount(): Promise<string> {
      const { data: existing } = await supabase
        .from("stripe_connect_accounts")
        .select("stripe_account_id")
        .eq("user_id", user_id)
        .maybeSingle()

      if (existing?.stripe_account_id) {
        return existing.stripe_account_id
      }

      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        metadata: { user_id },
      })

      await supabase.from("stripe_connect_accounts").insert({
        user_id,
        stripe_account_id: account.id,
        onboarding_completed: false,
      })

      return account.id
    }

    // ------------------------------------------------------------------
    // ACTION: create_account
    // Get/create Express account and return a hosted onboarding URL.
    // ------------------------------------------------------------------
    if (action === "create_account") {
      const callbackUrl = return_url || "https://bttrtogetheraccount.app/payout-return"

      const stripeAccountId = await getOrCreateExpressAccount()

      // If already fully onboarded, skip the link generation
      const account = await stripe.accounts.retrieve(stripeAccountId)
      if (account.payouts_enabled) {
        await supabase
          .from("stripe_connect_accounts")
          .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
          .eq("user_id", user_id)
        return jsonResponse({ already_completed: true, stripe_account_id: stripeAccountId })
      }

      // Generate a fresh onboarding link (links expire after a few minutes)
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: callbackUrl, // shown if user refreshes mid-flow
        return_url:  callbackUrl, // shown when user finishes
        type: "account_onboarding",
      })

      return jsonResponse({
        onboarding_url:   accountLink.url,
        stripe_account_id: stripeAccountId,
      })
    }

    // ------------------------------------------------------------------
    // ACTION: check_status
    // Is the Express account onboarded and ready to receive payouts?
    // ------------------------------------------------------------------
    if (action === "check_status") {
      const { data: connectRecord } = await supabase
        .from("stripe_connect_accounts")
        .select("stripe_account_id, onboarding_completed")
        .eq("user_id", user_id)
        .maybeSingle()

      if (!connectRecord) {
        return jsonResponse({ onboarding_completed: false, has_account: false })
      }

      const account = await stripe.accounts.retrieve(connectRecord.stripe_account_id)
      const isReady = !!(account.payouts_enabled && account.charges_enabled)

      if (isReady && !connectRecord.onboarding_completed) {
        await supabase
          .from("stripe_connect_accounts")
          .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
          .eq("user_id", user_id)
      }

      return jsonResponse({
        onboarding_completed:  isReady,
        has_account:           true,
        stripe_account_id:     connectRecord.stripe_account_id,
        charges_enabled:       account.charges_enabled ?? false,
        payouts_enabled:       account.payouts_enabled ?? false,
      })
    }

    // ------------------------------------------------------------------
    // ACTION: transfer
    // Transfer the prize pool to the winner's connected Express account.
    // Stripe automatically pays out to their linked bank/card on schedule.
    // ------------------------------------------------------------------
    if (action === "transfer") {
      if (!goal_list_id) {
        return jsonResponse({ error: "Missing required field: goal_list_id" }, 400)
      }

      // Load goal list
      const { data: goalList, error: glError } = await supabase
        .from("goal_lists")
        .select("id, winner_id, tie_winner_ids, prize_pool_amount, platform_fee_amount, payout_status, name")
        .eq("id", goal_list_id)
        .single()

      if (glError || !goalList) {
        return jsonResponse({ error: "Goal list not found" }, 404)
      }

      const isTie = Array.isArray(goalList.tie_winner_ids) && goalList.tie_winner_ids.length > 1
      const isTiedWinner = isTie && goalList.tie_winner_ids.includes(user_id)
      const isSingleWinner = goalList.winner_id === user_id && !isTie

      if (!isSingleWinner && !isTiedWinner) {
        return jsonResponse({ error: "You are not the declared winner of this challenge" }, 403)
      }
      if (goalList.payout_status === "completed" && !isTie) {
        return jsonResponse({ error: "Payout already processed for this challenge" }, 400)
      }

      const { data: connectRecord } = await supabase
        .from("stripe_connect_accounts")
        .select("stripe_account_id, onboarding_completed")
        .eq("user_id", user_id)
        .maybeSingle()

      if (!connectRecord) {
        return jsonResponse({ error: "No Stripe account found. Please complete setup first." }, 400)
      }

      const account = await stripe.accounts.retrieve(connectRecord.stripe_account_id)
      if (!account.payouts_enabled) {
        return jsonResponse({ error: "Your Stripe account is not yet ready to receive payouts. Please complete setup." }, 400)
      }

      const fullPrize = goalList.prize_pool_amount
      if (!fullPrize || fullPrize <= 0) {
        return jsonResponse({ error: "No prize pool to transfer" }, 400)
      }

      let prizeAmount: number
      if (isTie) {
        const n = goalList.tie_winner_ids.length
        const { data: existingPayouts } = await supabase
          .from("payouts")
          .select("id")
          .eq("goal_list_id", goal_list_id)
          .eq("winner_id", user_id)
        if (existingPayouts && existingPayouts.length > 0) {
          return jsonResponse({ error: "You have already claimed your share." }, 400)
        }
        prizeAmount = Math.round((fullPrize / n) * 100) / 100
      } else {
        prizeAmount = fullPrize
      }

      const amountCents = Math.round(prizeAmount * 100)

      // Transfer to the winner's Express connected account.
      // Stripe automatically pays out to their linked bank on the account's payout schedule.
      const transfer = await stripe.transfers.create({
        amount:      amountCents,
        currency:    "usd",
        destination: connectRecord.stripe_account_id,
        metadata: {
          goal_list_id,
          winner_id:   user_id,
          description: `Prize payout: ${goalList.name}`,
        },
      })

      await supabase
        .from("stripe_connect_accounts")
        .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
        .eq("user_id", user_id)

      await supabase.from("payouts").insert({
        goal_list_id,
        winner_id:                 user_id,
        total_amount:              fullPrize + (goalList.platform_fee_amount || 0),
        payout_amount:             prizeAmount,
        stripe_transfer_id:        transfer.id,
        stripe_connect_account_id: connectRecord.stripe_account_id,
        status:                    "processing",
      })

      if (isTie) {
        const { data: allPayouts } = await supabase
          .from("payouts")
          .select("id")
          .eq("goal_list_id", goal_list_id)
        const allClaimed = allPayouts && allPayouts.length >= goalList.tie_winner_ids.length
        await supabase
          .from("goal_lists")
          .update({ payout_status: allClaimed ? "completed" : "processing" })
          .eq("id", goal_list_id)
      } else {
        await supabase
          .from("goal_lists")
          .update({ payout_status: "processing" })
          .eq("id", goal_list_id)
      }

      return jsonResponse({
        success:     true,
        transfer_id: transfer.id,
        amount:      prizeAmount,
      })
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400)

  } catch (error) {
    console.error("process-payout error:", error)
    return jsonResponse({ error: error.message }, 500)
  }
})
