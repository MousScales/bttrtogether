-- Add goal_type column to goals table
-- This distinguishes between 'group' goals (all members do) and 'personal' goals (only creator does)

ALTER TABLE public.goals 
ADD COLUMN IF NOT EXISTS goal_type text DEFAULT 'personal' CHECK (goal_type IN ('group', 'personal'));

-- Update existing goals to be 'personal' by default
UPDATE public.goals 
SET goal_type = 'personal' 
WHERE goal_type IS NULL;

-- Make goal_type NOT NULL after setting defaults
ALTER TABLE public.goals 
ALTER COLUMN goal_type SET NOT NULL;

