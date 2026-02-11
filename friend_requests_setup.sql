-- ============================================
-- Friend Requests System - Complete Setup
-- ============================================
-- Copy and paste this entire file into Supabase SQL Editor
-- ============================================

-- Step 1: Create friend_requests table
-- ============================================
create table if not exists public.friend_requests (
  id uuid default gen_random_uuid() primary key,
  requester_id uuid references auth.users(id) on delete cascade not null,
  recipient_id uuid references auth.users(id) on delete cascade not null,
  status text default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(requester_id, recipient_id),
  check (requester_id != recipient_id)
);

-- Enable RLS for friend_requests
alter table public.friend_requests enable row level security;

-- Drop existing policies if they exist (for re-running)
drop policy if exists "Users can view their own friend requests" on public.friend_requests;
drop policy if exists "Users can create friend requests" on public.friend_requests;
drop policy if exists "Users can update friend requests they received" on public.friend_requests;

-- Create RLS policies for friend_requests
create policy "Users can view their own friend requests" on public.friend_requests
  for select using (
    auth.uid() = requester_id OR 
    auth.uid() = recipient_id
  );

create policy "Users can create friend requests" on public.friend_requests
  for insert with check (auth.uid() = requester_id);

create policy "Users can update friend requests they received" on public.friend_requests
  for update using (auth.uid() = recipient_id);


-- Step 2: Create friends table (for accepted friendships)
-- ============================================
create table if not exists public.friends (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  friend_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, friend_id),
  check (user_id != friend_id)
);

-- Enable RLS for friends
alter table public.friends enable row level security;

-- Drop existing policies if they exist (for re-running)
drop policy if exists "Users can view their own friendships" on public.friends;
drop policy if exists "Users can insert their own friendships" on public.friends;

-- Create RLS policies for friends
create policy "Users can view their own friendships" on public.friends
  for select using (
    auth.uid() = user_id OR 
    auth.uid() = friend_id
  );

create policy "Users can insert their own friendships" on public.friends
  for insert with check (auth.uid() = user_id);


-- Step 3: Create trigger function for automatic friendship creation
-- ============================================
-- This function automatically creates bidirectional friendships when a request is accepted
create or replace function public.handle_friend_request_accepted()
returns trigger as $$
begin
  -- Create bidirectional friendship (both directions)
  insert into public.friends (user_id, friend_id)
  values (new.requester_id, new.recipient_id)
  on conflict do nothing;
  
  insert into public.friends (user_id, friend_id)
  values (new.recipient_id, new.requester_id)
  on conflict do nothing;
  
  return new;
end;
$$ language plpgsql security definer;

-- Drop existing trigger if it exists (for re-running)
drop trigger if exists on_friend_request_accepted on public.friend_requests;

-- Create trigger to automatically create friendships when request is accepted
create trigger on_friend_request_accepted
  after update on public.friend_requests
  for each row
  when (new.status = 'accepted' and old.status = 'pending')
  execute function public.handle_friend_request_accepted();


-- ============================================
-- Setup Complete!
-- ============================================
-- The friend requests system is now ready to use.
-- When a friend request is accepted, the trigger will
-- automatically create bidirectional friendships in the friends table.
-- ============================================

