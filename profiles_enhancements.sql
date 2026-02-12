-- Profiles table enhancements
-- Run this in Supabase SQL Editor

-- Add bio column
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS bio text;

-- Add preferences columns
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS notifications_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS theme text DEFAULT 'dark';

-- Make username unique (add constraint)
-- First, check if constraint already exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_username_unique'
  ) THEN
    ALTER TABLE profiles 
    ADD CONSTRAINT profiles_username_unique UNIQUE (username);
  END IF;
END $$;

-- Create index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- Update RLS policies if needed (allow users to update their own profile)
-- This assumes you have RLS enabled on profiles table

-- Drop existing update policy if it exists
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Create new update policy
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Ensure users can read all profiles (for friend search)
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;

CREATE POLICY "Profiles are viewable by everyone"
ON profiles FOR SELECT
USING (true);

COMMENT ON COLUMN profiles.bio IS 'User bio/description';
COMMENT ON COLUMN profiles.notifications_enabled IS 'Whether push notifications are enabled';
COMMENT ON COLUMN profiles.theme IS 'App theme preference: dark or light';
