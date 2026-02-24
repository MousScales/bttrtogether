# Push Notifications (iOS) with Supabase + Expo

This guide lists everything you need to do for push notifications to work on **iOS** using **Supabase** (Edge Functions + DB webhooks) and **Expo’s push service**.

---

## 1. Apple & Expo (iOS credentials)

- **Apple Developer account**  
  You need an active [Apple Developer Program](https://developer.apple.com/programs/) membership.

- **EAS manages APNs for you**  
  On your first **iOS** build with EAS (`eas build --platform ios`), EAS will prompt to create/use an Apple Push Notifications key.  
  Or run:
  ```bash
  eas credentials
  ```
  Choose **iOS** → **Push Notifications: Manage your Apple Push Notifications Key** and follow the prompts.

- **Real device**  
  Push does **not** work in the iOS Simulator. Use a physical iPhone.

- **Bundle ID**  
  Your `app.json` already has `ios.bundleIdentifier: "com.mousscales.bttrtogether"`. Ensure this matches the App ID in [Apple Developer](https://developer.apple.com/account/resources/identifiers/list) and in your EAS project.

---

## 2. Expo project (expo.dev)

- **Expo account & project**  
  Your app is already linked to EAS (`owner: "digaifounder"`, `projectId` in `app.config.js`). No extra Expo project setup is required for basic push.

- **Optional: token for Edge Function (recommended for production)**  
  If you want to use [Expo’s “Enhanced security”](https://docs.expo.dev/push-notifications/push-notifications-setup/#enhanced-security-for-push-notifications) when sending from your Supabase Edge Function:
  1. Go to [Expo Access Tokens](https://expo.dev/accounts/_/settings/access-tokens).
  2. Create a token with permission to send push notifications.
  3. Save it as the `EXPO_ACCESS_TOKEN` secret in Supabase (see step 5).  
  If you don’t set this, the Edge Function can still send via `https://exp.host/--/api/v2/push/send` without a bearer token for basic use (token is optional for that endpoint).

---

## 3. Supabase: database

Run the migration that adds the notifications table, `expo_push_token` on profiles, and all triggers. Either:

- **Option A:** Apply the migration file:  
  `supabase/migrations/20250224000000_push_notifications.sql`  
  (e.g. `supabase db push` or paste its contents into **Supabase Dashboard → SQL Editor** and run).

- **Option B:** Manually run the SQL from that file in **SQL Editor**.

That migration includes:
- `profiles.expo_push_token`
- `public.notifications` table and RLS
- `public.reminder_sent` for stake-reminder throttling
- Helper `notify_push(user_id, title, body, data)` and triggers for: friend request accepted, added to group, new post in list, validation, payment, all paid, winner declared

---

## 4. Supabase: Edge Function “push”

The repo includes **`supabase/functions/push/index.ts`**. It receives the Database Webhook payload on `notifications` INSERT, looks up `expo_push_token` and `notifications_enabled` on `profiles`, and sends to Expo’s push API.

- **Deploy** and **set the secret** (optional but recommended):
  ```bash
  supabase secrets set EXPO_ACCESS_TOKEN=your_expo_access_token   # if using enhanced security
  supabase functions deploy push
  ```

---

## 5. Supabase: Database Webhook

- In Supabase Dashboard: **Database** → **Webhooks** (or **Integrations** → **Webhooks**).
- **Create webhook**:
  - **Table:** `notifications`
  - **Events:** `Insert`
  - **Endpoint:** your `push` Edge Function URL (e.g. `https://<project-ref>.supabase.co/functions/v1/push`).
  - **HTTP method:** POST.
  - **Headers:** add auth header with **service role** key so the Edge Function can call Supabase with service role.

When you **INSERT** into `notifications`, Supabase will POST the row to the Edge Function, which then looks up `expo_push_token` and sends the push via Expo.

---

## 6. App (Expo) code

- **Install:**
  ```bash
  npx expo install expo-notifications expo-device expo-constants
  ```
- **App config:**  
  Add the `expo-notifications` plugin in `app.config.js` (in the `expo.plugins` array).
- **Request permission** (iOS will show the system prompt).
- **Get Expo push token** with `Notifications.getExpoPushTokenAsync({ projectId })` (use `Constants.expoConfig?.extra?.eas?.projectId` or `Constants.easConfig?.projectId`).
- **Save token to Supabase:**  
  Update `profiles.expo_push_token` for the signed-in user when:
  - The user logs in or opens the app and has `notifications_enabled === true`.
  - The user turns notifications on in Settings.
- **Clear token** when the user turns notifications off or logs out (set `expo_push_token` to `null`).
- **Respect `notifications_enabled`:**  
  Your Settings screen already has this; only register and save the push token when the user has enabled notifications.

---

## 7. Reminders (day almost over + stake)

The repo includes **`supabase/functions/send-reminders/index.ts`**. It:

- **Day almost over:** Notifies participants who have incomplete goals for today (UTC date) in active challenges.
- **Stake reminder:** Every 2 days (throttled per user per list), reminds participants what’s at stake (money or dare).

Call it on a schedule (e.g. daily cron). Optional: set `CRON_SECRET` and send `Authorization: Bearer <CRON_SECRET>` so only your cron can invoke it.

```bash
# Example: call daily (e.g. from cron-job.org or Supabase pg_cron)
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reminders" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"types": ["day_almost_over", "stake_reminder"]}'
```

Deploy: `supabase functions deploy send-reminders`

---

## 8. Sending a notification from your backend

Whenever you want to send a push to a user (e.g. goal completed, payout ready, friend request):

- **INSERT** into `notifications`:
  ```sql
  INSERT INTO public.notifications (user_id, title, body, data)
  VALUES (
    'target-user-uuid',
    'Goal completed',
    'Someone completed a goal in "My Challenge".',
    '{"screen": "Goals", "goalListId": "..."}'::jsonb
  );
  ```
- The webhook fires → Edge Function runs → looks up `expo_push_token` for that `user_id` → sends to Expo → user gets the notification on their device.

You can do this from:
- **Supabase Edge Functions** (e.g. after processing a payout, call Supabase client to insert into `notifications`).
- **Other backend code** that has Supabase service role or a secure client.
- **Database triggers** (e.g. trigger on `goal_completions` that inserts into `notifications`).

---

## Summary checklist

| Step | What to do |
|------|------------|
| 1 | Apple Developer account; EAS iOS credentials (APNs) via `eas build` or `eas credentials` |
| 2 | (Optional) Create Expo access token; set as `EXPO_ACCESS_TOKEN` in Supabase secrets |
| 3 | Run migration `supabase/migrations/20250224000000_push_notifications.sql` (table + triggers) |
| 4 | Deploy Edge Function `push`; set `EXPO_ACCESS_TOKEN` if used |
| 5 | Create DB webhook: `notifications` INSERT → `push` Edge Function, with service role auth |
| 6 | App: `expo-notifications`, plugin, and hook already wired; token saved when logged in and notifications on |
| 7 | (Optional) Deploy `send-reminders` and call it daily for “day almost over” and “stake” reminders |

**Implemented triggers (notifications sent automatically):**  
Friend request accepted, added to group list, someone joined list, new post in group list, post validated, payment made, all paid, winner/loser declared.  
**Scheduled (via send-reminders):** Day almost over, stake reminder every 2 days.
