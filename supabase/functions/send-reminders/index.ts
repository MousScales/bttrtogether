/**
 * send-reminders — Run on a schedule (e.g. daily cron).
 * 1. Day almost over: notify participants with incomplete goals for today (UTC date).
 * 2. Stake reminder: every 2 days, remind participants what's at stake (money or dare).
 *
 * Call with POST body: { "types": ["day_almost_over", "stake_reminder"] } or omit for both.
 * Optional: Authorization header with a secret CRON_SECRET to prevent public calls.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

const today = () => new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC

async function runDayAlmostOver() {
  const todayStr = today()
  const { data: lists } = await supabase
    .from("goal_lists")
    .select("id, name, user_id")
    .not("started_at", "is", null)
    .is("winner_id", null)
    .or("tie_winner_ids.is.null,tie_winner_ids.eq.[]")

  if (!lists?.length) return { day_almost_over: 0 }

  let sent = 0
  for (const list of lists) {
    const { data: participants } = await supabase
      .from("group_goal_participants")
      .select("user_id")
      .eq("goal_list_id", list.id)
    const userIds = (participants ?? []).map((p) => p.user_id)
    if (list.user_id && !userIds.includes(list.user_id)) userIds.push(list.user_id)

    const { data: goals } = await supabase.from("goals").select("id").eq("goal_list_id", list.id)
    const goalIds = (goals ?? []).map((g) => g.id)
    if (goalIds.length === 0) continue

    for (const userId of userIds) {
      const { count: completed } = await supabase
        .from("goal_completions")
        .select("id", { count: "exact", head: true })
        .in("goal_id", goalIds)
        .eq("user_id", userId)
        .eq("completed_at", todayStr)
      const incomplete = goalIds.length - (completed ?? 0)
      if (incomplete > 0) {
        await supabase.from("notifications").insert({
          user_id: userId,
          title: "Day almost over",
          body: `You have ${incomplete} goal(s) left in "${list.name ?? "your challenge"}". Finish before midnight!`,
          data: { type: "day_almost_over", goal_list_id: list.id },
        })
        sent++
      }
    }
  }
  return { day_almost_over: sent }
}

async function runStakeReminder() {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const { data: lists } = await supabase
    .from("goal_lists")
    .select("id, name, user_id, prize_pool_amount, consequence_type, consequence")
    .not("started_at", "is", null)
    .is("winner_id", null)
    .or("tie_winner_ids.is.null,tie_winner_ids.eq.[]")

  if (!lists?.length) return { stake_reminder: 0 }

  let sent = 0
  for (const list of lists) {
    const { data: participants } = await supabase
      .from("group_goal_participants")
      .select("user_id")
      .eq("goal_list_id", list.id)
    const userIds = (participants ?? []).map((p) => p.user_id)
    if (list.user_id && !userIds.includes(list.user_id)) userIds.push(list.user_id)

    const stakeText =
      list.consequence_type === "money" && list.prize_pool_amount
        ? `$${Number(list.prize_pool_amount).toFixed(2)} on the line`
        : list.consequence_type === "punishment" && list.consequence
          ? `Dare at stake: ${String(list.consequence).slice(0, 80)}${String(list.consequence).length > 80 ? "…" : ""}`
          : "Something's at stake – open the app to see."

    for (const userId of userIds) {
      const { data: last } = await supabase
        .from("reminder_sent")
        .select("sent_at")
        .eq("goal_list_id", list.id)
        .eq("user_id", userId)
        .eq("kind", "stake_reminder")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (last && last.sent_at >= twoDaysAgo) continue

      await supabase.from("notifications").insert({
        user_id: userId,
        title: "What's at stake",
        body: `"${list.name ?? "Your challenge"}": ${stakeText}`,
        data: { type: "stake_reminder", goal_list_id: list.id },
      })
      await supabase.from("reminder_sent").upsert(
        { goal_list_id: list.id, user_id: userId, kind: "stake_reminder", sent_at: new Date().toISOString() },
        { onConflict: "goal_list_id,user_id,kind" }
      )
      sent++
    }
  }
  return { stake_reminder: sent }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    })
  }

  const cronSecret = Deno.env.get("CRON_SECRET")
  if (cronSecret) {
    const auth = req.headers.get("authorization")
    if (auth !== `Bearer ${cronSecret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } })
    }
  }

  try {
    let types = ["day_almost_over", "stake_reminder"]
    if (req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}))
        if (Array.isArray(body.types) && body.types.length > 0) types = body.types
      } catch {
        // use default types
      }
    }

    const results: Record<string, number> = {}
    if (types.includes("day_almost_over")) Object.assign(results, await runDayAlmostOver())
    if (types.includes("stake_reminder")) Object.assign(results, await runStakeReminder())

    return new Response(JSON.stringify({ ok: true, ...results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    console.error("send-reminders error:", e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
