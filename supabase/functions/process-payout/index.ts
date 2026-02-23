/**
 * process-payout  —  Supabase Edge Function
 *
 * Handles two actions:
 *   "create_account"  – Creates (or retrieves) a Stripe Connect Express account
 *                       for the winner and returns an onboarding URL.
 *   "transfer"        – Verifies onboarding is complete, then transfers the
 *                       prize pool to the winner's connected account.
 *
 * Environment secrets required (set with `supabase secrets set`):
 *   STRIPE_SECRET_KEY
 *   SUPABASE_URL            (auto-provided by Supabase)
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
})

// Service-role client so we can read/write any row
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

  try {
    const { action, user_id, goal_list_id, return_url } = await req.json()

    // ----------------------------------------------------------------
    // Validate inputs
    // ----------------------------------------------------------------
    if (!action || !user_id || !goal_list_id) {
      return jsonResponse({ error: "Missing required fields: action, user_id, goal_list_id" }, 400)
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(user_id) || !uuidRegex.test(goal_list_id)) {
      return jsonResponse({ error: "Invalid UUID format" }, 400)
    }

    // ----------------------------------------------------------------
    // Fetch goal list to verify winner and get prize pool
    // ----------------------------------------------------------------
    const { data: goalList, error: goalListError } = await supabase
      .from("goal_lists")
      .select("id, winner_id, prize_pool_amount, platform_fee_amount, payout_status, name")
      .eq("id", goal_list_id)
      .single()

    if (goalListError || !goalList) {
      return jsonResponse({ error: "Goal list not found" }, 404)
    }

    if (goalList.winner_id !== user_id) {
      return jsonResponse({ error: "You are not the declared winner of this challenge" }, 403)
    }

    if (goalList.payout_status === "completed") {
      return jsonResponse({ error: "Payout has already been processed for this challenge" }, 400)
    }

    // ----------------------------------------------------------------
    // ACTION: create_account
    // ----------------------------------------------------------------
    if (action === "create_account") {
      // Check if user already has a Connect account
      const { data: existing } = await supabase
        .from("stripe_connect_accounts")
        .select("stripe_account_id, onboarding_completed")
        .eq("user_id", user_id)
        .maybeSingle()

      let stripeAccountId: string

      if (existing) {
        stripeAccountId = existing.stripe_account_id

        // If already fully onboarded, tell the client
        if (existing.onboarding_completed) {
          return jsonResponse({
            already_connected: true,
            stripe_account_id: stripeAccountId,
          })
        }
      } else {
        // Create new Express account
        const account = await stripe.accounts.create({
          type: "express",
          metadata: { user_id, goal_list_id },
        })
        stripeAccountId = account.id

        // Save to DB
        await supabase.from("stripe_connect_accounts").insert({
          user_id,
          stripe_account_id: stripeAccountId,
          onboarding_completed: false,
        })
      }

      // Generate onboarding link
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: return_url || "bttrtogetherapp://payout-refresh",
        return_url:  return_url || "bttrtogetherapp://payout-return",
        type: "account_onboarding",
      })

      return jsonResponse({
        onboarding_url:    accountLink.url,
        stripe_account_id: stripeAccountId,
      })
    }

    // ----------------------------------------------------------------
    // ACTION: check_status
    // Verifies if onboarding is complete and marks it in DB
    // ----------------------------------------------------------------
    if (action === "check_status") {
      const { data: connectRecord } = await supabase
        .from("stripe_connect_accounts")
        .select("stripe_account_id, onboarding_completed")
        .eq("user_id", user_id)
        .maybeSingle()

      if (!connectRecord) {
        return jsonResponse({ onboarding_completed: false, has_account: false })
      }

      // Re-check with Stripe in case it changed
      const account = await stripe.accounts.retrieve(connectRecord.stripe_account_id)
      const isComplete = account.charges_enabled && account.payouts_enabled

      if (isComplete && !connectRecord.onboarding_completed) {
        await supabase
          .from("stripe_connect_accounts")
          .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
          .eq("user_id", user_id)
      }

      return jsonResponse({
        onboarding_completed:  isComplete,
        has_account:           true,
        stripe_account_id:     connectRecord.stripe_account_id,
        charges_enabled:       account.charges_enabled,
        payouts_enabled:       account.payouts_enabled,
      })
    }

    // ----------------------------------------------------------------
    // ACTION: transfer
    // Send prize pool to winner's connected account
    // ----------------------------------------------------------------
    if (action === "transfer") {
      const { data: connectRecord } = await supabase
        .from("stripe_connect_accounts")
        .select("stripe_account_id, onboarding_completed")
        .eq("user_id", user_id)
        .maybeSingle()

      if (!connectRecord) {
        return jsonResponse({ error: "No Stripe account found. Please complete onboarding first." }, 400)
      }

      // Double-check onboarding status with Stripe
      const account = await stripe.accounts.retrieve(connectRecord.stripe_account_id)
      if (!account.charges_enabled || !account.payouts_enabled) {
        return jsonResponse({ error: "Bank account onboarding is not yet complete." }, 400)
      }

      const prizeAmount = goalList.prize_pool_amount
      if (!prizeAmount || prizeAmount <= 0) {
        return jsonResponse({ error: "No prize pool to transfer" }, 400)
      }

      // Create the transfer: platform balance → winner's connected account
      const transfer = await stripe.transfers.create({
        amount:      Math.round(prizeAmount * 100), // cents
        currency:    "usd",
        destination: connectRecord.stripe_account_id,
        metadata: {
          goal_list_id,
          winner_id:   user_id,
          description: `Prize payout for challenge: ${goalList.name}`,
        },
      })

      // Mark Connect account as onboarding completed (in case DB was stale)
      await supabase
        .from("stripe_connect_accounts")
        .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
        .eq("user_id", user_id)

      // Insert payout record
      await supabase.from("payouts").insert({
        goal_list_id,
        winner_id:                 user_id,
        total_amount:              goalList.prize_pool_amount + (goalList.platform_fee_amount || 0),
        payout_amount:             prizeAmount,
        stripe_transfer_id:        transfer.id,
        stripe_connect_account_id: connectRecord.stripe_account_id,
        status:                    "processing",
      })

      // Update goal list payout status
      await supabase
        .from("goal_lists")
        .update({ payout_status: "processing" })
        .eq("id", goal_list_id)

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
