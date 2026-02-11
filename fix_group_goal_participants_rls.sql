-- ============================================
-- Fix RLS Policy for group_goal_participants
-- ============================================
-- This allows goal list owners to add participants
-- Copy and paste this into Supabase SQL Editor
-- ============================================

-- Drop the old insert policy
drop policy if exists "Users can join goal lists" on public.group_goal_participants;
drop policy if exists "Users can join goal lists or owners can add them" on public.group_goal_participants;

-- Create a new policy that allows:
-- 1. Users to join themselves (auth.uid() = user_id)
-- 2. Goal list owners to add participants (auth.uid() = goal list owner)
create policy "Users can join goal lists or owners can add them" on public.group_goal_participants
  for insert 
  with check (
    auth.uid() = user_id OR 
    auth.uid() IN (SELECT user_id FROM public.goal_lists WHERE id = goal_list_id)
  );

-- Also update goal_lists RLS to allow participants to view goal lists they're in
-- Use a function to avoid infinite recursion
drop policy if exists "Users can view their own goal lists" on public.goal_lists;
drop policy if exists "Users can view their own goal lists or ones they participate in" on public.goal_lists;

-- Create a function to check if user is a participant (avoids recursion)
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

-- Create policy using the function to avoid recursion
create policy "Users can view their own goal lists or ones they participate in" on public.goal_lists
  for select using (
    auth.uid() = user_id OR 
    public.user_is_participant(id, auth.uid())
  );

-- ============================================
-- Policies Updated!
-- ============================================
-- 1. Goal list owners can add participants to their goal lists
-- 2. Participants can view goal lists they're added to
-- ============================================

