-- ============================================
-- Add Goal Validations Table
-- ============================================
-- This tracks validations for goal completions
-- Copy and paste this into Supabase SQL Editor
-- ============================================

-- Create goal_validations table
CREATE TABLE IF NOT EXISTS public.goal_validations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_completion_id uuid REFERENCES public.goal_completions(id) ON DELETE CASCADE NOT NULL,
  validator_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(goal_completion_id, validator_id)
);

-- Enable RLS
ALTER TABLE public.goal_validations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view validations for completions in their goal lists" ON public.goal_validations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.goal_completions gc
      JOIN public.goals g ON gc.goal_id = g.id
      JOIN public.goal_lists gl ON g.goal_list_id = gl.id
      WHERE gc.id = goal_validations.goal_completion_id
      AND (
        gl.user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.group_goal_participants ggp
          WHERE ggp.goal_list_id = gl.id
          AND ggp.user_id = auth.uid()
        )
      )
    )
  );

-- Create a security definer function to check validation permission
-- This function takes the completion_id and checks if the current user can validate it
CREATE OR REPLACE FUNCTION public.user_can_validate_completion(completion_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.goal_completions gc
    JOIN public.goals g ON gc.goal_id = g.id
    JOIN public.goal_lists gl ON g.goal_list_id = gl.id
    WHERE gc.id = completion_id
    AND (
      gl.user_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.group_goal_participants ggp
        WHERE ggp.goal_list_id = gl.id
        AND ggp.user_id = auth.uid()
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "Users can validate completions in their goal lists" ON public.goal_validations
  FOR INSERT WITH CHECK (
    auth.uid() = validator_id AND
    EXISTS (
      SELECT 1 FROM public.goal_completions gc
      JOIN public.goals g ON gc.goal_id = g.id
      JOIN public.goal_lists gl ON g.goal_list_id = gl.id
      WHERE gc.id = goal_completion_id
      AND (
        gl.user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.group_goal_participants ggp
          WHERE ggp.goal_list_id = gl.id
          AND ggp.user_id = auth.uid()
        )
      )
    )
  );

-- ============================================
-- Table Created!
-- ============================================

