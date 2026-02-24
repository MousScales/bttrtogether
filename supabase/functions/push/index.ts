/**
 * Push notification webhook handler.
 * Triggered by Database Webhook on public.notifications INSERT.
 * Sends the notification to Expo Push API for the user's expo_push_token.
 *
 * Secrets: EXPO_ACCESS_TOKEN (optional, for enhanced security)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

interface NotificationRow {
  id: string
  user_id: string
  title: string | null
  body: string
  data?: Record<string, unknown>
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE"
  table: string
  record: NotificationRow
  schema: string
  old_record: NotificationRow | null
}

async function sendExpoPush(expoPushToken: string, title: string | null, body: string, data?: Record<string, unknown>) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Accept-encoding": "gzip, deflate",
  }
  const token = Deno.env.get("EXPO_ACCESS_TOKEN")
  if (token) headers["Authorization"] = `Bearer ${token}`

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers,
    body: JSON.stringify({
      to: expoPushToken,
      sound: "default",
      title: title ?? undefined,
      body,
      data: data ?? {},
    }),
  })
  return res.json()
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    })
  }

  try {
    const payload: WebhookPayload = await req.json()
    if (payload.type !== "INSERT" || payload.table !== "notifications") {
      return new Response(JSON.stringify({ ok: true, skipped: "not an insert on notifications" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { user_id, title, body, data } = payload.record
    if (!user_id || !body) {
      return new Response(JSON.stringify({ error: "Missing user_id or body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("expo_push_token, notifications_enabled")
      .eq("id", user_id)
      .single()

    if (profileError || !profile?.expo_push_token) {
      return new Response(JSON.stringify({ ok: true, skipped: "no push token or user not found" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (profile.notifications_enabled === false) {
      return new Response(JSON.stringify({ ok: true, skipped: "notifications disabled" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    const result = await sendExpoPush(
      profile.expo_push_token,
      title ?? null,
      body,
      (data as Record<string, unknown>) ?? {}
    )

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    console.error("Push webhook error:", e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
