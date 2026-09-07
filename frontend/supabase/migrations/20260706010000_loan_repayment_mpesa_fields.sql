-- Migration: Add M-Pesa tracking columns to micro_loan_repayments
ALTER TABLE public.micro_loan_repayments
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid'
    CHECK (payment_status IN ('initiated', 'pending_confirmation', 'paid', 'failed')),
  ADD COLUMN IF NOT EXISTS checkout_request_id text,
  ADD COLUMN IF NOT EXISTS merchant_request_id text,
  ADD COLUMN IF NOT EXISTS payment_error text,
  ADD COLUMN IF NOT EXISTS payment_verification_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz;
