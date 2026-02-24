/**
 * process-payout  —  Supabase Edge Function
 *
 * Handles:
 *   "list_payout_methods" – Returns saved banks and cards (up to 2 each) for the user's Connect account.
 *   "add_bank"   – Creates (or retrieves) a Stripe Connect Custom account, adds bank (max 2 banks).
 *   "add_card"   – Adds a debit card via token for instant payouts (max 2 cards).
 *   "check_status" – Reports if user has any payout method; optionally returns list_payout_methods.
 *   "transfer"   – Transfers the prize pool to the winner's connected account (optional external_account_id for destination).
 *
 * For list_payout_methods, add_bank, add_card: goal_list_id is optional (used from Settings).
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

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const actionsWithoutGoalList = ["list_payout_methods", "add_bank", "add_card"]

  try {
    const body = await req.json()
    const { action, user_id, goal_list_id, return_url, external_account_id } = body
    const routing_number = strip(body.routing_number)
    const account_number = strip(body.account_number)
    const account_holder_name = strip(body.account_holder_name)
    const card_token = strip(body.card_token)

    if (!action || !user_id) {
      return jsonResponse({ error: "Missing required fields: action, user_id" }, 400)
    }
    if (!uuidRegex.test(user_id)) {
      return jsonResponse({ error: "Invalid user_id format" }, 400)
    }
    const requireGoalList = !actionsWithoutGoalList.includes(action)
    if (requireGoalList && !goal_list_id) {
      return jsonResponse({ error: "Missing required field: goal_list_id" }, 400)
    }
    if (goal_list_id && !uuidRegex.test(goal_list_id)) {
      return jsonResponse({ error: "Invalid goal_list_id format" }, 400)
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
    if (action === "add_card") {
      if (!card_token || !card_token.startsWith("tok_")) {
        return jsonResponse({ error: "Missing or invalid card_token (use Stripe to tokenize card)" }, 400)
      }
    }

    // ----------------------------------------------------------------
    // Fetch goal list when required (check_status, transfer)
    // ----------------------------------------------------------------
    let goalList: { id: string; winner_id: string | null; tie_winner_ids: string[] | null; prize_pool_amount: number; platform_fee_amount?: number; payout_status: string; name: string } | null = null
    if (requireGoalList && goal_list_id) {
      const { data: gl, error: goalListError } = await supabase
        .from("goal_lists")
        .select("id, winner_id, tie_winner_ids, prize_pool_amount, platform_fee_amount, payout_status, name")
        .eq("id", goal_list_id)
        .single()
      if (goalListError || !gl) {
        return jsonResponse({ error: "Goal list not found" }, 404)
      }
      goalList = gl
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
    }

    const MAX_BANKS = 2
    const MAX_CARDS = 2

    /** Get or create Connect Custom account for user; returns stripe_account_id or null if list and no account. */
    async function getOrCreateConnectAccount(forAdd: boolean): Promise<string | null> {
      const { data: existing } = await supabase
        .from("stripe_connect_accounts")
        .select("stripe_account_id, onboarding_completed")
        .eq("user_id", user_id)
        .maybeSingle()
      if (existing) {
        const account = await stripe.accounts.retrieve(existing.stripe_account_id)
        if (account.type === "express") {
          if (!forAdd) return null
          const { first_name, last_name } = splitAccountHolderName(account_holder_name || "Account Holder")
          const newAccount = await stripe.accounts.create({
            type: "custom",
            country: "US",
            business_type: "individual",
            capabilities: { transfers: { requested: true }, legacy_payments: { requested: true } },
            individual: { first_name: first_name.slice(0, 100), last_name: last_name.slice(0, 100) },
            metadata: { user_id, goal_list_id: goal_list_id || "" },
          })
          await supabase.from("stripe_connect_accounts").update({
            stripe_account_id: newAccount.id,
            onboarding_completed: false,
            updated_at: new Date().toISOString(),
          }).eq("user_id", user_id)
          return newAccount.id
        }
        return existing.stripe_account_id
      }
      if (!forAdd) return null
      const { first_name, last_name } = splitAccountHolderName(account_holder_name || "Account Holder")
      const account = await stripe.accounts.create({
        type: "custom",
        country: "US",
        business_type: "individual",
        capabilities: { transfers: { requested: true }, legacy_payments: { requested: true } },
        individual: { first_name: first_name.slice(0, 100), last_name: last_name.slice(0, 100) },
        metadata: { user_id, goal_list_id: goal_list_id || "" },
      })
      await supabase.from("stripe_connect_accounts").insert({
        user_id,
        stripe_account_id: account.id,
        onboarding_completed: false,
      })
      return account.id
    }

    // ----------------------------------------------------------------
    // ACTION: list_payout_methods
    // ----------------------------------------------------------------
    if (action === "list_payout_methods") {
      const stripeAccountId = await getOrCreateConnectAccount(false)
      const banks: { id: string; last4: string; default_for_currency: boolean }[] = []
      const cards: { id: string; last4: string; brand: string; default_for_currency: boolean }[] = []
      if (stripeAccountId) {
        const list = await stripe.accounts.listExternalAccounts(stripeAccountId, { limit: 100 })
        for (const ea of list.data) {
          if (ea.object === "bank_account") {
            banks.push({
              id: ea.id,
              last4: (ea as { last4?: string }).last4 ?? "",
              default_for_currency: (ea as { default_for_currency?: boolean }).default_for_currency ?? false,
            })
          }
          if (ea.object === "card") {
            const c = ea as { id: string; last4?: string; brand?: string; default_for_currency?: boolean }
            cards.push({
              id: c.id,
              last4: c.last4 ?? "",
              brand: c.brand ?? "card",
              default_for_currency: c.default_for_currency ?? false,
            })
          }
        }
      }
      return jsonResponse({ banks: banks.slice(0, MAX_BANKS), cards: cards.slice(0, MAX_CARDS) })
    }

    // ----------------------------------------------------------------
    // ACTION: add_bank — Add bank (max 2); get or create Connect account
    // ----------------------------------------------------------------
    if (action === "add_bank") {
      const stripeAccountId = await getOrCreateConnectAccount(true)
      if (!stripeAccountId) {
        return jsonResponse({ error: "Could not get or create Connect account" }, 500)
      }
      const list = await stripe.accounts.listExternalAccounts(stripeAccountId, { limit: 100 })
      const bankCount = list.data.filter((ea) => ea.object === "bank_account").length
      if (bankCount >= MAX_BANKS) {
        return jsonResponse({ error: "Maximum 2 bank accounts allowed. Remove one in Stripe or use an existing one." }, 400)
      }
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
      return jsonResponse({ success: true, stripe_account_id: stripeAccountId })
    }

    // ----------------------------------------------------------------
    // ACTION: add_card — Add debit card via token (max 2) for instant payouts
    // ----------------------------------------------------------------
    if (action === "add_card") {
      const stripeAccountId = await getOrCreateConnectAccount(true)
      if (!stripeAccountId) {
        return jsonResponse({ error: "Could not get or create Connect account" }, 500)
      }
      const list = await stripe.accounts.listExternalAccounts(stripeAccountId, { limit: 100 })
      const cardCount = list.data.filter((ea) => ea.object === "card").length
      if (cardCount >= MAX_CARDS) {
        return jsonResponse({ error: "Maximum 2 debit cards allowed for instant payouts." }, 400)
      }
      await stripe.accounts.createExternalAccount(stripeAccountId, {
        external_account: card_token,
        default_for_currency: list.data.length === 0,
      } as { external_account: string; default_for_currency?: boolean })
      await supabase
        .from("stripe_connect_accounts")
        .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
        .eq("user_id", user_id)
      return jsonResponse({ success: true, stripe_account_id: stripeAccountId })
    }

    // ----------------------------------------------------------------
    // ACTION: check_status — For Custom, DB onboarding_completed is source of truth; includes payout_methods
    // ----------------------------------------------------------------
    if (action === "check_status") {
      const { data: connectRecord } = await supabase
        .from("stripe_connect_accounts")
        .select("stripe_account_id, onboarding_completed")
        .eq("user_id", user_id)
        .maybeSingle()

      if (!connectRecord) {
        return jsonResponse({ onboarding_completed: false, has_account: false, banks: [], cards: [] })
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

      const banks: { id: string; last4: string; default_for_currency: boolean }[] = []
      const cards: { id: string; last4: string; brand: string; default_for_currency: boolean }[] = []
      const list = await stripe.accounts.listExternalAccounts(connectRecord.stripe_account_id, { limit: 100 })
      for (const ea of list.data) {
        if (ea.object === "bank_account") {
          banks.push({ id: ea.id, last4: (ea as { last4?: string }).last4 ?? "", default_for_currency: (ea as { default_for_currency?: boolean }).default_for_currency ?? false })
        }
        if (ea.object === "card") {
          const c = ea as { id: string; last4?: string; brand?: string; default_for_currency?: boolean }
          cards.push({ id: c.id, last4: c.last4 ?? "", brand: c.brand ?? "card", default_for_currency: c.default_for_currency ?? false })
        }
      }

      return jsonResponse({
        onboarding_completed:  isComplete,
        has_account:           true,
        stripe_account_id:     connectRecord.stripe_account_id,
        charges_enabled:       account.charges_enabled ?? false,
        payouts_enabled:       account.payouts_enabled ?? false,
        banks,
        cards,
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
        return jsonResponse({ error: "Please add a bank account or debit card first." }, 400)
      }

      const stripeAccountId = connectRecord.stripe_account_id
      if (external_account_id && typeof external_account_id === "string" && external_account_id.trim()) {
        try {
          await stripe.accounts.updateExternalAccount(stripeAccountId, external_account_id.trim(), { default_for_currency: true })
        } catch (e) {
          console.error("Set default external account failed:", e)
          return jsonResponse({ error: "Invalid payout method. Please choose a saved bank or card." }, 400)
        }
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

      // Instant payout = destination is a card → charge fee: $0.35 per $20 (to STRIPE_FEES_ACCOUNT_ID)
      let isInstantPayout = false
      if (external_account_id && typeof external_account_id === "string" && external_account_id.trim()) {
        try {
          const ext = await stripe.accounts.retrieveExternalAccount(stripeAccountId, external_account_id.trim())
          isInstantPayout = ext.object === "card"
        } catch {
          // ignore; treat as standard
        }
      }

      const INSTANT_FEE_PER_20 = 0.35
      const instantFeeDollars = isInstantPayout
        ? Math.round((prizeAmount / 20) * INSTANT_FEE_PER_20 * 100) / 100
        : 0
      const amountToWinner = Math.round((prizeAmount - instantFeeDollars) * 100) / 100
      const amountToWinnerCents = Math.round(amountToWinner * 100)
      const instantFeeCents = Math.round(instantFeeDollars * 100)

      // 1) Transfer to winner's connected account (net of instant fee if applicable)
      const transfer = await stripe.transfers.create({
        amount:      amountToWinnerCents,
        currency:    "usd",
        destination: connectRecord.stripe_account_id,
        metadata: {
          goal_list_id,
          winner_id:   user_id,
          description: `Prize payout for challenge: ${goalList.name}`,
        },
      })

      // 2) If instant payout, send instant fee to the same Connect account that receives the 10% platform fee
      if (instantFeeCents > 0) {
        const feesAccountId = Deno.env.get("STRIPE_FEES_ACCOUNT_ID")?.trim()
        if (feesAccountId) {
          try {
            await stripe.transfers.create({
              amount:      instantFeeCents,
              currency:   "usd",
              destination: feesAccountId,
              metadata: {
                goal_list_id,
                winner_id:   user_id,
                description: `Instant payout fee ($${instantFeeDollars.toFixed(2)})`,
              },
            })
          } catch (feeErr) {
            console.error("Instant fee transfer to STRIPE_FEES_ACCOUNT_ID failed:", feeErr)
            // Don't fail the whole payout; winner already got their amount
          }
        }
      }

      // Mark Connect account as onboarding completed (in case DB was stale)
      await supabase
        .from("stripe_connect_accounts")
        .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
        .eq("user_id", user_id)

      // Insert payout record (payout_amount = amount winner actually receives)
      await supabase.from("payouts").insert({
        goal_list_id,
        winner_id:                 user_id,
        total_amount:              fullPrize + (goalList.platform_fee_amount || 0),
        payout_amount:             amountToWinner,
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
        success:       true,
        transfer_id:   transfer.id,
        amount:        amountToWinner,
        instant_fee:   instantFeeDollars > 0 ? instantFeeDollars : undefined,
      })
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400)

  } catch (error) {
    console.error("process-payout error:", error)
    return jsonResponse({ error: error.message }, 500)
  }
})
