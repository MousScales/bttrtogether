# Friend Requests System Setup

## Database Schema

Run these SQL commands in Supabase SQL Editor:

### Step 1: Create friend_requests table
```sql
-- Create friend_requests table
create table public.friend_requests (
  id uuid default gen_random_uuid() primary key,
  requester_id uuid references auth.users(id) on delete cascade not null,
  recipient_id uuid references auth.users(id) on delete cascade not null,
  status text default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(requester_id, recipient_id),
  check (requester_id != recipient_id)
);

-- Enable RLS
alter table public.friend_requests enable row level security;

-- Create policies
create policy "Users can view their own friend requests" on public.friend_requests
  for select using (
    auth.uid() = requester_id OR 
    auth.uid() = recipient_id
  );

create policy "Users can create friend requests" on public.friend_requests
  for insert with check (auth.uid() = requester_id);

create policy "Users can update friend requests they received" on public.friend_requests
  for update using (auth.uid() = recipient_id);
```

### Step 2: Create friends table (for accepted friendships)
```sql
-- Create friends table
create table public.friends (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  friend_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, friend_id),
  check (user_id != friend_id)
);

-- Enable RLS
alter table public.friends enable row level security;

-- Create policies
create policy "Users can view their own friendships" on public.friends
  for select using (
    auth.uid() = user_id OR 
    auth.uid() = friend_id
  );

create policy "Users can insert their own friendships" on public.friends
  for insert with check (auth.uid() = user_id);

-- Function to automatically create bidirectional friendship when friend request is accepted
create or replace function public.handle_friend_request_accepted()
returns trigger as $$
begin
  -- Create bidirectional friendship
  insert into public.friends (user_id, friend_id)
  values (new.requester_id, new.recipient_id)
  on conflict do nothing;
  
  insert into public.friends (user_id, friend_id)
  values (new.recipient_id, new.requester_id)
  on conflict do nothing;
  
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to create friendships when request is accepted
create trigger on_friend_request_accepted
  after update on public.friend_requests
  for each row
  when (new.status = 'accepted' and old.status = 'pending')
  execute function public.handle_friend_request_accepted();
```

