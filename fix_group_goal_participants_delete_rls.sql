-- ============================================
-- Allow goal list OWNER to remove participants
-- ============================================
-- Run this in Supabase SQL Editor so "Remove" works when
-- the owner taps remove on a participant (before list is started).
-- ============================================

-- Owner of the goal list can delete any participant row for that list
create policy "Goal list owners can remove participants" on public.group_goal_participants
  for delete using (
    auth.uid() IN (SELECT user_id FROM public.goal_lists WHERE id = goal_list_id)
  );

-- ============================================
-- Result: Owner can remove participants from their list.
-- ============================================
