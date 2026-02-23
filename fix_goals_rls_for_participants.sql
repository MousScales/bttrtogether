-- ============================================
-- Fix RLS Policy for goals table
-- ============================================
-- This allows goal list owners to insert goals for participants
-- Copy and paste this into Supabase SQL Editor
-- ============================================

-- Drop the old insert policy
drop policy if exists "Users can insert their own goals" on public.goals;

-- Create a new policy that allows:
-- 1. Users to insert their own goals (auth.uid() = user_id)
-- 2. Goal list owners to insert goals for participants (auth.uid() = goal list owner)
create policy "Users can insert their own goals or owners can insert for participants" on public.goals
  for insert 
  with check (
    auth.uid() = user_id OR 
    auth.uid() IN (SELECT user_id FROM public.goal_lists WHERE id = goal_list_id)
  );

-- Also update the select policy to allow participants to view goals in their goal lists
drop policy if exists "Users can view their own goals" on public.goals;

-- Create a function to check if user is a participant or owner (avoids recursion)
create or replace function public.user_can_view_goals(goal_list_uuid uuid, goal_user_uuid uuid, current_user_uuid uuid)
returns boolean as $$
begin
  -- User can view if:
  -- 1. The goal belongs to them
  -- 2. They own the goal list
  -- 3. They are a participant in the goal list
  return (
    goal_user_uuid = current_user_uuid OR
    current_user_uuid IN (SELECT user_id FROM public.goal_lists WHERE id = goal_list_uuid) OR
    exists (
      select 1 
      from public.group_goal_participants 
      where goal_list_id = goal_list_uuid 
      and user_id = current_user_uuid
    )
  );
end;
$$ language plpgsql security definer;

-- Create policy using the function
create policy "Users can view goals in their goal lists" on public.goals
  for select using (
    public.user_can_view_goals(goal_list_id, user_id, auth.uid())
  );

-- ============================================
-- Policies Updated!
-- ============================================


