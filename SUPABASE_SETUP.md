# Supabase Database Schema Setup

## Run these SQL commands in Supabase SQL Editor

### Step 1: Create profiles table (IMPORTANT - Run this first!)
```sql
-- Create profiles table
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  username text unique not null,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.profiles enable row level security;

-- Create policies for profiles
create policy "Public profiles are viewable by everyone" on public.profiles
  for select using (true);

create policy "Users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);
```

### Step 2: Create goal_lists table
```sql
-- Create goal_lists table
create table public.goal_lists (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  type text not null check (type in ('personal', 'group')),
  deadline timestamp with time zone,
  consequence_type text check (consequence_type in ('money', 'punishment')),
  consequence text,
  amount numeric,
  duration_days integer,
  is_unlimited boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.goal_lists enable row level security;

-- Create policies
create policy "Users can view their own goal lists" on public.goal_lists
  for select using (auth.uid() = user_id);

create policy "Users can insert their own goal lists" on public.goal_lists
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own goal lists" on public.goal_lists
  for update using (auth.uid() = user_id);

create policy "Users can delete their own goal lists" on public.goal_lists
  for delete using (auth.uid() = user_id);
```

### Step 3: Create goals table
```sql
-- Create goals table
create table public.goals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  goal_list_id uuid references public.goal_lists(id) on delete cascade not null,
  title text not null,
  completed boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.goals enable row level security;

-- Create policies
create policy "Users can view their own goals" on public.goals
  for select using (auth.uid() = user_id);

create policy "Users can insert their own goals" on public.goals
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own goals" on public.goals
  for update using (auth.uid() = user_id);

create policy "Users can delete their own goals" on public.goals
  for delete using (auth.uid() = user_id);
```

### Step 4: Create goal_completions table (for tracking history)
```sql
-- Create goal_completions table
create table public.goal_completions (
  id uuid default gen_random_uuid() primary key,
  goal_id uuid references public.goals(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  completed_at date not null,
  proof_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(goal_id, completed_at)
);

-- Enable RLS
alter table public.goal_completions enable row level security;

-- Create policies
create policy "Users can view their own completions" on public.goal_completions
  for select using (auth.uid() = user_id);

create policy "Users can insert their own completions" on public.goal_completions
  for insert with check (auth.uid() = user_id);
```

## How to Run:

1. Go to your Supabase Dashboard
2. Click on "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy and paste **each step** above (one at a time)
5. Click "Run" for each query
6. Verify tables are created in "Table Editor"

## Verify Setup:

After running all queries, go to Table Editor and you should see:
- ✅ profiles
- ✅ goal_lists
- ✅ goals
- ✅ goal_completions


