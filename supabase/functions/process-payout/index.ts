/**
 * process-payout — Supabase Edge Function
 *
 * Supports Rapyd (primary) and legacy Stripe Connect.
 *
 * Rapyd actions:
 *   create_beneficiary – Create beneficiary with bank details, store rapyd_beneficiary_id on profile.
 *   check_status       – Has user set up payouts? (Rapyd: has rapyd_beneficiary_id; Stripe: onboarding_completed)
 *   transfer           – Send prize to winner (Rapyd payout or Stripe transfer).
 *
 * Env: RAPYD_ACCESS_KEY, RAPYD_SECRET_KEY, RAPYD_BASE_URL; STRIPE_SECRET_KEY (optional); SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

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

const stripeSecretKey = (Deno.env.get("STRIPE_SECRET_KEY") || "").trim()
const rapydAccessKey = (Deno.env.get("RAPYD_ACCESS_KEY") || "").trim()
const rapydSecretKey = (Deno.env.get("RAPYD_SECRET_KEY") || "").trim()
const rapydBaseUrl = (Deno.env.get("RAPYD_BASE_URL") || "https://api.rapyd.net").replace(/\/+$/, "")

const stripe = new Stripe(stripeSecretKey || "sk_missing", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
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
    const {
      action,
      user_id,
      goal_list_id,
      amount: amountParam,
      return_url,
      // Rapyd beneficiary
      first_name,
      last_name,
      account_number,
      routing_number,
      address,
      city,
      state,
      postcode,
      identification_type,
      identification_value,
    } = body

    if (!action || !user_id) {
      return jsonResponse({ error: "Missing required fields: action, user_id" }, 400)
    }
    if (!uuidRegex.test(user_id)) {
      return jsonResponse({ error: "Invalid user_id format" }, 400)
    }
    if (goal_list_id && !uuidRegex.test(goal_list_id)) {
      return jsonResponse({ error: "Invalid goal_list_id format" }, 400)
    }

    const RAPYD_COMPLETE_BASE = "https://bttrsite.vercel.app/rapyd-complete"

    // ------------------------------------------------------------------
    // create_rapyd_checkout: create Rapyd hosted checkout (same as super-handler)
    // ------------------------------------------------------------------
    if (action === "create_rapyd_checkout") {
      if (!rapydAccessKey || !rapydSecretKey) {
        return jsonResponse({ error: "Rapyd is not configured. Set RAPYD_ACCESS_KEY and RAPYD_SECRET_KEY in Supabase Edge Function secrets." }, 503)
      }
      if (!goal_list_id || !uuidRegex.test(goal_list_id) || amountParam == null || amountParam <= 0) {
        return jsonResponse({ error: "Missing or invalid goal_list_id or amount" }, 400)
      }
      const amt = Math.round(parseFloat(String(amountParam)) * 100) / 100
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
        return jsonResponse({ error: msg }, 400)
      }
      const checkoutId = data?.data?.id
      const redirectUrl = data?.data?.redirect_url
      if (!checkoutId || !redirectUrl) {
        return jsonResponse({ error: "Rapyd did not return checkout URL" }, 500)
      }
      const { error: insErr } = await supabase.from("rapyd_checkouts").insert({
        checkout_id: checkoutId,
        goal_list_id,
        user_id,
        amount: amt,
      })
      if (insErr) console.error("rapyd_checkouts insert error:", insErr)
      return jsonResponse({
        redirect_url: redirectUrl,
        checkout_id: checkoutId,
        prizePoolContribution: prizePoolAmount,
        platformFeeContribution: platformFeeAmount,
      })
    }

    // ------------------------------------------------------------------
    // confirm_rapyd_payment: check if payment was recorded (by webhook)
    // ------------------------------------------------------------------
    if (action === "confirm_rapyd_payment") {
      if (!goal_list_id || !uuidRegex.test(goal_list_id)) {
        return jsonResponse({ error: "Missing or invalid goal_list_id" }, 400)
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
      return jsonResponse({
        success: !!payment && recent,
        payment_id: payment?.id,
        amount: payment?.amount,
      })
    }

    // ------------------------------------------------------------------
    // RAPYD: create_beneficiary
    // ------------------------------------------------------------------
    if (action === "create_beneficiary") {
      if (!rapydAccessKey || !rapydSecretKey) {
        return jsonResponse({ error: "Rapyd is not configured" }, 503)
      }
      const fname = (first_name || "").trim()
      const lname = (last_name || "").trim()
      const acct = (account_number || "").trim()
      const routing = (routing_number || "").trim().replace(/\D/g, "")
      if (!fname || !lname || !acct || !routing) {
        return jsonResponse({
          error: "Missing required bank details: first_name, last_name, account_number, routing_number",
        }, 400)
      }
      const beneficiaryBody = {
        category: "bank",
        country: "US",
        currency: "USD",
        entity_type: "individual",
        first_name: fname,
        last_name: lname,
        default_payout_method_type: "us_general_bank",
        merchant_reference_id: user_id,
        payment_type: "regular",
        address: (address || "N/A").trim() || "N/A",
        city: (city || "N/A").trim() || "N/A",
        state: (state || "N/A").trim() || "N/A",
        postcode: (postcode || "00000").trim() || "00000",
        account_number: acct,
        aba: routing,
        identification_type: (identification_type || "identification_id").trim() || "identification_id",
        identification_value: (identification_value || "N/A").trim() || "N/A",
      }
      const res = await rapydFetch(
        "POST",
        "/v1/payouts/beneficiary",
        beneficiaryBody,
        rapydAccessKey,
        rapydSecretKey,
        rapydBaseUrl
      )
      const data = await res.json()
      if (!res.ok || data?.status?.status === "ERROR") {
        const msg = data?.status?.message || data?.error || "Failed to create beneficiary"
        console.error("Rapyd create_beneficiary error:", msg, data)
        return jsonResponse({ error: msg }, 400)
      }
      const beneficiaryId = data?.data?.id
      if (!beneficiaryId) {
        return jsonResponse({ error: "Rapyd did not return beneficiary id" }, 500)
      }
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ rapyd_beneficiary_id: beneficiaryId })
        .eq("id", user_id)
      if (updErr) {
        console.error("Profile update error:", updErr)
        return jsonResponse({ error: updErr.message }, 500)
      }
      return jsonResponse({ success: true, rapyd_beneficiary_id: beneficiaryId })
    }

    // ------------------------------------------------------------------
    // check_status: Rapyd first, then Stripe legacy
    // ------------------------------------------------------------------
    if (action === "check_status") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("rapyd_beneficiary_id")
        .eq("id", user_id)
        .single()
      if (profile?.rapyd_beneficiary_id) {
        return jsonResponse({
          onboarding_completed: true,
          has_account: true,
          payouts_enabled: true,
          charges_enabled: true,
          rapyd_beneficiary_id: profile.rapyd_beneficiary_id,
        })
      }
      // Legacy Stripe
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
        onboarding_completed: isReady,
        has_account: true,
        stripe_account_id: connectRecord.stripe_account_id,
        charges_enabled: account.charges_enabled ?? false,
        payouts_enabled: account.payouts_enabled ?? false,
      })
    }

    // ------------------------------------------------------------------
    // transfer: Rapyd payout or Stripe transfer
    // ------------------------------------------------------------------
    if (action === "transfer") {
      if (!goal_list_id) {
        return jsonResponse({ error: "Missing required field: goal_list_id" }, 400)
      }

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

      // Prefer Rapyd
      const { data: profile } = await supabase
        .from("profiles")
        .select("rapyd_beneficiary_id")
        .eq("id", user_id)
        .single()

      if (profile?.rapyd_beneficiary_id && rapydAccessKey && rapydSecretKey) {
        const payoutBody = {
          beneficiary: profile.rapyd_beneficiary_id,
          amount: prizeAmount,
          currency: "USD",
          payout_method_type: "us_general_bank",
          merchant_reference_id: `payout_${goal_list_id}_${user_id}`,
          metadata: { goal_list_id, winner_id: user_id },
          description: `Prize: ${goalList.name}`,
        }
        const res = await rapydFetch(
          "POST",
          "/v1/payouts",
          payoutBody,
          rapydAccessKey,
          rapydSecretKey,
          rapydBaseUrl
        )
        const payoutData = await res.json()
        if (!res.ok || payoutData?.status?.status === "ERROR") {
          const msg = payoutData?.status?.message || payoutData?.error || "Rapyd payout failed"
          console.error("Rapyd payout error:", msg, payoutData)
          return jsonResponse({ error: msg }, 400)
        }
        const rapydPayoutId = payoutData?.data?.id

        await supabase.from("payouts").insert({
          goal_list_id,
          winner_id: user_id,
          total_amount: fullPrize + (goalList.platform_fee_amount || 0),
          payout_amount: prizeAmount,
          rapyd_payout_id: rapydPayoutId,
          status: "processing",
        })

        if (isTie) {
          const { data: allPayouts } = await supabase.from("payouts").select("id").eq("goal_list_id", goal_list_id)
          const allClaimed = allPayouts && allPayouts.length >= goalList.tie_winner_ids.length
          await supabase
            .from("goal_lists")
            .update({ payout_status: allClaimed ? "completed" : "processing" })
            .eq("id", goal_list_id)
        } else {
          await supabase.from("goal_lists").update({ payout_status: "processing" }).eq("id", goal_list_id)
        }

        return jsonResponse({ success: true, payout_id: rapydPayoutId, amount: prizeAmount })
      }

      // Legacy Stripe transfer
      const { data: connectRecord } = await supabase
        .from("stripe_connect_accounts")
        .select("stripe_account_id, onboarding_completed")
        .eq("user_id", user_id)
        .maybeSingle()

      if (!connectRecord) {
        return jsonResponse({
          error: "No payout method set up. Add your bank account in Payout Methods (Rapyd).",
        }, 400)
      }

      const account = await stripe.accounts.retrieve(connectRecord.stripe_account_id)
      if (!account.payouts_enabled) {
        return jsonResponse({
          error: "Your payout account is not ready. Add your bank account in Payout Methods.",
        }, 400)
      }

      const amountCents = Math.round(prizeAmount * 100)
      const transfer = await stripe.transfers.create({
        amount: amountCents,
        currency: "usd",
        destination: connectRecord.stripe_account_id,
        metadata: { goal_list_id, winner_id: user_id, description: `Prize payout: ${goalList.name}` },
      })

      await supabase.from("stripe_connect_accounts").update({
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      }).eq("user_id", user_id)

      await supabase.from("payouts").insert({
        goal_list_id,
        winner_id: user_id,
        total_amount: fullPrize + (goalList.platform_fee_amount || 0),
        payout_amount: prizeAmount,
        stripe_transfer_id: transfer.id,
        stripe_connect_account_id: connectRecord.stripe_account_id,
        status: "processing",
      })

      if (isTie) {
        const { data: allPayouts } = await supabase.from("payouts").select("id").eq("goal_list_id", goal_list_id)
        const allClaimed = allPayouts && allPayouts.length >= goalList.tie_winner_ids.length
        await supabase
          .from("goal_lists")
          .update({ payout_status: allClaimed ? "completed" : "processing" })
          .eq("id", goal_list_id)
      } else {
        await supabase.from("goal_lists").update({ payout_status: "processing" }).eq("id", goal_list_id)
      }

      return jsonResponse({ success: true, transfer_id: transfer.id, amount: prizeAmount })
    }

    // ------------------------------------------------------------------
    // create_account (Stripe legacy): return onboarding URL
    // ------------------------------------------------------------------
    if (action === "create_account") {
      if (!stripeSecretKey || !stripeSecretKey.startsWith("sk_")) {
        return jsonResponse({
          error: "Stripe Connect is no longer used. Add your bank account in Payout Methods (Rapyd).",
        }, 503)
      }
      const callbackUrl = return_url || "https://bttrtogetheraccount.app/payout-return"

      const { data: existing } = await supabase
        .from("stripe_connect_accounts")
        .select("stripe_account_id")
        .eq("user_id", user_id)
        .maybeSingle()

      let stripeAccountId: string
      if (existing?.stripe_account_id) {
        stripeAccountId = existing.stripe_account_id
      } else {
        const account = await stripe.accounts.create({
          type: "express",
          country: "US",
          metadata: { user_id },
        })
        stripeAccountId = account.id
        await supabase.from("stripe_connect_accounts").insert({
          user_id,
          stripe_account_id: stripeAccountId,
          onboarding_completed: false,
        })
      }

      const account = await stripe.accounts.retrieve(stripeAccountId)
      if (account.payouts_enabled) {
        await supabase
          .from("stripe_connect_accounts")
          .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
          .eq("user_id", user_id)
        return jsonResponse({ already_completed: true, stripe_account_id: stripeAccountId })
      }

      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: callbackUrl,
        return_url: callbackUrl,
        type: "account_onboarding",
      })

      return jsonResponse({
        onboarding_url: accountLink.url,
        stripe_account_id: stripeAccountId,
      })
    }

    // ------------------------------------------------------------------
    // create_login_link (Stripe legacy)
    // ------------------------------------------------------------------
    if (action === "create_login_link") {
      const { data: connectRecord } = await supabase
        .from("stripe_connect_accounts")
        .select("stripe_account_id")
        .eq("user_id", user_id)
        .maybeSingle()

      if (!connectRecord?.stripe_account_id) {
        return jsonResponse({
          error: "No Stripe account found. Manage payouts in Settings → Payout Methods (Rapyd).",
        }, 400)
      }

      const loginLink = await stripe.accounts.createLoginLink(connectRecord.stripe_account_id)
      return jsonResponse({ url: loginLink.url })
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400)
  } catch (error) {
    console.error("process-payout error:", error)
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
