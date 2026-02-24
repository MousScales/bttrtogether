/**
 * process-payout  —  Supabase Edge Function
 *
 * Handles:
 *   "add_bank"   – Creates (or retrieves) a Stripe Connect Custom account for the
 *                  winner, adds their bank account (routing + account number), no
 *                  external onboarding. Depop-style: just add bank and get paid.
 *   "check_status" – For backwards compatibility; reports if user has bank set.
 *   "transfer"   – Transfers the prize pool to the winner's connected account.
 *
 * Environment secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno"

const stripe = new Stripe((Deno.env.get("STRIPE_SECRET_KEY") || "").trim(), {
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

function strip(str: unknown): string {
  return typeof str === "string" ? str.trim() : ""
}

/** Split "First Last" into { first_name, last_name } for Stripe individual. */
function splitAccountHolderName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first_name: "Account", last_name: "Holder" }
  if (parts.length === 1) return { first_name: parts[0], last_name: parts[0] }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(" "),
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  try {
    const body = await req.json()
    const { action, user_id, goal_list_id, return_url } = body
    const routing_number = strip(body.routing_number)
    const account_number = strip(body.account_number)
    const account_holder_name = strip(body.account_holder_name)

    // ----------------------------------------------------------------
    // Validate inputs
    // ----------------------------------------------------------------
    if (!action || !user_id || !goal_list_id) {
      return jsonResponse({ error: "Missing required fields: action, user_id, goal_list_id" }, 400)
    }
    if (action === "add_bank") {
      if (!routing_number || !account_number || !account_holder_name) {
        return jsonResponse({ error: "Missing bank details: account_holder_name, routing_number, account_number" }, 400)
      }
      if (!/^\d{9}$/.test(routing_number)) {
        return jsonResponse({ error: "Routing number must be 9 digits" }, 400)
      }
      if (!/^\d{4,17}$/.test(account_number)) {
        return jsonResponse({ error: "Account number must be 4–17 digits" }, 400)
      }
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
      .select("id, winner_id, tie_winner_ids, prize_pool_amount, platform_fee_amount, payout_status, name")
      .eq("id", goal_list_id)
      .single()

    if (goalListError || !goalList) {
      return jsonResponse({ error: "Goal list not found" }, 404)
    }

    const isTie = Array.isArray(goalList.tie_winner_ids) && goalList.tie_winner_ids.length > 1
    const isSingleWinner = goalList.winner_id && !isTie
    const isTiedWinner = isTie && goalList.tie_winner_ids.includes(user_id)
    if (!isSingleWinner && !isTiedWinner) {
      if (isTie) {
        return jsonResponse({ error: "You are not one of the tied winners of this challenge" }, 403)
      }
      return jsonResponse({ error: "You are not the declared winner of this challenge" }, 403)
    }

    if (goalList.payout_status === "completed" && isSingleWinner) {
      return jsonResponse({ error: "Payout has already been processed for this challenge" }, 400)
    }
    if (isTie && goalList.payout_status === "completed") {
      return jsonResponse({ error: "All tied winners have already been paid for this challenge" }, 400)
    }

    // ----------------------------------------------------------------
    // ACTION: add_bank — Add bank in-app for payouts (no browser, no Connect onboarding)
    // ----------------------------------------------------------------
    if (action === "add_bank") {
      const { data: existing } = await supabase
        .from("stripe_connect_accounts")
        .select("stripe_account_id, onboarding_completed")
        .eq("user_id", user_id)
        .maybeSingle()

      const { first_name, last_name } = splitAccountHolderName(account_holder_name)
      const accountCreateParams = {
        type: "custom" as const,
        country: "US",
        business_type: "individual" as const,
        capabilities: {
          transfers: { requested: true },
          legacy_payments: { requested: true },
        },
        individual: {
          first_name: first_name.slice(0, 100),
          last_name: last_name.slice(0, 100),
        },
        metadata: { user_id, goal_list_id },
      }

      let stripeAccountId: string
      let isNewAccount = false

      if (existing) {
        const account = await stripe.accounts.retrieve(existing.stripe_account_id)
        if (account.type === "express") {
          const newAccount = await stripe.accounts.create(accountCreateParams)
          stripeAccountId = newAccount.id
          isNewAccount = true
          await supabase
            .from("stripe_connect_accounts")
            .update({
              stripe_account_id: stripeAccountId,
              onboarding_completed: false,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", user_id)
        } else {
          stripeAccountId = existing.stripe_account_id
          if (existing.onboarding_completed) {
            return jsonResponse({ success: true, already_connected: true, stripe_account_id: stripeAccountId })
          }
        }
      } else {
        const account = await stripe.accounts.create(accountCreateParams)
        stripeAccountId = account.id
        isNewAccount = true
        await supabase.from("stripe_connect_accounts").insert({
          user_id,
          stripe_account_id: stripeAccountId,
          onboarding_completed: false,
        })
      }

      // Attach bank account for payouts
      await stripe.accounts.createExternalAccount(stripeAccountId, {
        external_account: {
          object: "bank_account",
          country: "US",
          currency: "usd",
          account_holder_name: account_holder_name,
          account_holder_type: "individual",
          routing_number: routing_number,
          account_number: account_number,
        },
      })

      await supabase
        .from("stripe_connect_accounts")
        .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
        .eq("user_id", user_id)

      return jsonResponse({
        success: true,
        stripe_account_id: stripeAccountId,
        already_connected: !isNewAccount,
      })
    }

    // ----------------------------------------------------------------
    // ACTION: check_status — For Custom, DB onboarding_completed is source of truth
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

      const account = await stripe.accounts.retrieve(connectRecord.stripe_account_id)
      const isExpress = account.type === "express"
      const isComplete = isExpress
        ? (account.charges_enabled && account.payouts_enabled)
        : connectRecord.onboarding_completed

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
        charges_enabled:       account.charges_enabled ?? false,
        payouts_enabled:       account.payouts_enabled ?? false,
      })
    }

    // ----------------------------------------------------------------
    // ACTION: transfer
    // Send prize pool to winner's connected account (or split share for tie)
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

      // For Express: Stripe must report ready. For Custom: we set onboarding_completed when bank was added.
      const account = await stripe.accounts.retrieve(connectRecord.stripe_account_id)
      if (account.type === "express" && (!account.charges_enabled || !account.payouts_enabled)) {
        return jsonResponse({ error: "Bank account onboarding is not yet complete." }, 400)
      }
      if (!connectRecord.onboarding_completed) {
        return jsonResponse({ error: "Please add your bank account first." }, 400)
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
          return jsonResponse({ error: "You have already claimed your share for this challenge." }, 400)
        }
        prizeAmount = Math.round((fullPrize / n) * 100) / 100
      } else {
        prizeAmount = fullPrize
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
        total_amount:              fullPrize + (goalList.platform_fee_amount || 0),
        payout_amount:             prizeAmount,
        stripe_transfer_id:        transfer.id,
        stripe_connect_account_id: connectRecord.stripe_account_id,
        status:                    "processing",
      })

      // Update goal list payout status: for tie, set completed only when all have claimed
      if (isTie) {
        const { data: payoutsForList } = await supabase
          .from("payouts")
          .select("id")
          .eq("goal_list_id", goal_list_id)
        const allClaimed = payoutsForList && payoutsForList.length >= goalList.tie_winner_ids.length
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
