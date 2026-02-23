-- ============================================
-- Allow viewing all participants in a group goal list
-- ============================================
-- Run this in Supabase SQL Editor so owners and participants
-- can see everyone added to the list (including people who aren't friends).
-- ============================================

-- Ensure helper exists (from fix_group_goal_participants_rls.sql)
create or replace function public.user_is_participant(goal_list_uuid uuid, user_uuid uuid)
returns boolean as $$
begin
  return exists (
    select 1
    from public.group_goal_participants
    where goal_list_id = goal_list_uuid
      and user_id = user_uuid
  );
end;
$$ language plpgsql security definer;

-- Drop existing SELECT policy if any
drop policy if exists "Users can view their own participant row" on public.group_goal_participants;
drop policy if exists "Users can view participants in their goal lists" on public.group_goal_participants;

-- Allow SELECT if you're the goal list owner OR you're in this goal list (see all participants)
create policy "Users can view participants in their goal lists" on public.group_goal_participants
  for select using (
    auth.uid() IN (SELECT user_id FROM public.goal_lists WHERE id = goal_list_id)
    OR public.user_is_participant(goal_list_id, auth.uid())
  );

-- ============================================
-- Result: Everyone in the list (owner + added people)
-- can see the full participant list, including
-- people who are not their friends.
-- ============================================
