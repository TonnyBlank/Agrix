-- Add guarantors column to profiles
-- This column will store a JSONB array of default guarantor details for the user
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS guarantors jsonb DEFAULT '[]'::jsonb;
