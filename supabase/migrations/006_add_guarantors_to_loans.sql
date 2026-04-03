-- Add guarantors column to micro_loan_applications
-- This column will store a JSONB array of guarantor details (name, phone, relationship, etc.)

ALTER TABLE public.micro_loan_applications
ADD COLUMN IF NOT EXISTS guarantors jsonb DEFAULT '[]'::jsonb;
