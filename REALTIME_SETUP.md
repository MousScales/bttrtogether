# Supabase Realtime Setup

The app uses **Supabase Realtime** so that changes in the database (goals, payments, participants, posts, etc.) appear without refreshing.

## Why only my phone shows updates / posts don’t sync across devices

If **only what you do on one device** shows up there, and **group goals or posts don’t appear on other devices**, the usual cause is that **Realtime replication is not enabled** for the relevant tables. Until replication is on, the app only refetches when you open the screen or pull to refresh; it won’t get live updates from other devices.

**Fix:** Enable replication for the tables below (see “Enable replication for tables”). After that, all devices get live updates for goals, goal completions (posts), and list changes.

## Enable replication for tables

Realtime only broadcasts changes for tables that are in the `supabase_realtime` publication.

1. Open your project in the [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **Database** → **Replication**.
3. Find the **supabase_realtime** publication and click to expand.
4. Enable replication for these tables (toggle on):
   - `goal_lists`
   - `goals`
   - `goal_completions`
   - `goal_validations`
   - `group_goal_participants`
   - `payments`
   - `payouts`
   - `profiles`
   - `friends`
   - `friend_requests`

After enabling, the app will receive live updates when any of these tables change (from this device, another device, or the backend).

## Still not syncing?

1. **Pull to refresh** on the Goals screen: if the latest goals/posts appear when you pull down, the server and RLS are fine and the issue is likely Realtime not firing (e.g. subscription or network).
2. **Wait a few seconds** after a change on the other device; the Realtime event can take a moment.
3. **Restart the app** on the device that should show updates (subscribes to the channel again).
4. In Supabase **Database → Publications → supabase_realtime**, confirm the tables above are **checked** (source is the publication, not “Replication” destinations).
