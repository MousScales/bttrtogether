# Supabase Realtime Setup

The app uses **Supabase Realtime** so that changes in the database (goals, payments, participants, etc.) appear without refreshing.

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
