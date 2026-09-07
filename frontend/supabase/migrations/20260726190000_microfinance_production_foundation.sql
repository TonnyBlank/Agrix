-- Microfinance production foundation: score snapshots, arrears, documents, vouchers, and ledger records.

ALTER TABLE public.micro_loan_applications
  ADD COLUMN IF NOT EXISTS credit_score integer NOT NULL DEFAULT 0 CHECK (credit_score >= 0 AND credit_score <= 100),
  ADD COLUMN IF NOT EXISTS credit_score_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS eligibility_explanation jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS due_date timestamptz,
  ADD COLUMN IF NOT EXISTS grace_period_days integer NOT NULL DEFAULT 7 CHECK (grace_period_days >= 0),
  ADD COLUMN IF NOT EXISTS days_late integer NOT NULL DEFAULT 0 CHECK (days_late >= 0),
  ADD COLUMN IF NOT EXISTS late_fee_amount numeric NOT NULL DEFAULT 0 CHECK (late_fee_amount >= 0),
  ADD COLUMN IF NOT EXISTS arrears_status text NOT NULL DEFAULT 'current'
    CHECK (arrears_status IN ('current', 'grace', 'overdue', 'default_risk', 'repaid')),
  ADD COLUMN IF NOT EXISTS next_payment_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_payment_amount numeric NOT NULL DEFAULT 0 CHECK (next_payment_amount >= 0),
  ADD COLUMN IF NOT EXISTS repayment_status text NOT NULL DEFAULT 'not_started'
    CHECK (repayment_status IN ('not_started', 'on_track', 'due', 'late', 'repaid')),
  ADD COLUMN IF NOT EXISTS document_status text NOT NULL DEFAULT 'not_required'
    CHECK (document_status IN ('not_required', 'required', 'submitted', 'verified', 'rejected', 'waived')),
  ADD COLUMN IF NOT EXISTS voucher_status text NOT NULL DEFAULT 'not_applicable'
    CHECK (voucher_status IN ('not_applicable', 'issued', 'redeemed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS ledger_status text NOT NULL DEFAULT 'open'
    CHECK (ledger_status IN ('open', 'closed', 'written_off')),
  ADD COLUMN IF NOT EXISTS lender_reference text;

ALTER TABLE public.micro_loan_repayments
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid'
    CHECK (payment_status IN ('initiated', 'pending_confirmation', 'paid', 'failed')),
  ADD COLUMN IF NOT EXISTS checkout_request_id text,
  ADD COLUMN IF NOT EXISTS merchant_request_id text,
  ADD COLUMN IF NOT EXISTS payment_error text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE INDEX IF NOT EXISTS micro_loan_applications_due_status_idx
ON public.micro_loan_applications (status, due_date, arrears_status);

CREATE INDEX IF NOT EXISTS micro_loan_applications_credit_score_idx
ON public.micro_loan_applications (credit_score DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS micro_loan_repayments_checkout_idx
ON public.micro_loan_repayments (checkout_request_id)
WHERE checkout_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.micro_loan_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL REFERENCES public.micro_loan_applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  document_name text NOT NULL,
  document_url text,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'verified', 'rejected', 'waived')),
  reviewer_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS micro_loan_documents_loan_idx
ON public.micro_loan_documents (loan_application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS micro_loan_documents_user_idx
ON public.micro_loan_documents (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.micro_loan_voucher_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL REFERENCES public.micro_loan_applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  voucher_code text NOT NULL,
  dealer_name text NOT NULL,
  dealer_location text,
  redeemed_value numeric NOT NULL DEFAULT 0 CHECK (redeemed_value >= 0),
  status text NOT NULL DEFAULT 'redeemed'
    CHECK (status IN ('redeemed', 'cancelled')),
  note text,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS micro_loan_voucher_redemptions_loan_idx
ON public.micro_loan_voucher_redemptions (loan_application_id, redeemed_at DESC);

CREATE TABLE IF NOT EXISTS public.micro_loan_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL REFERENCES public.micro_loan_applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_type text NOT NULL
    CHECK (entry_type IN ('disbursement', 'repayment', 'interest_accrual', 'late_fee', 'voucher_redemption', 'adjustment', 'write_off')),
  debit numeric NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric NOT NULL DEFAULT 0 CHECK (credit >= 0),
  balance_after numeric NOT NULL DEFAULT 0 CHECK (balance_after >= 0),
  reference text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS micro_loan_ledger_entries_loan_idx
ON public.micro_loan_ledger_entries (loan_application_id, created_at ASC);

ALTER TABLE public.micro_loan_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.micro_loan_voucher_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.micro_loan_ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "micro_loan_documents_owner_read" ON public.micro_loan_documents;
DROP POLICY IF EXISTS "micro_loan_documents_owner_insert" ON public.micro_loan_documents;
CREATE POLICY "micro_loan_documents_owner_read" ON public.micro_loan_documents
FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "micro_loan_documents_owner_insert" ON public.micro_loan_documents
FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "micro_loan_vouchers_owner_read" ON public.micro_loan_voucher_redemptions;
CREATE POLICY "micro_loan_vouchers_owner_read" ON public.micro_loan_voucher_redemptions
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "micro_loan_ledger_owner_read" ON public.micro_loan_ledger_entries;
CREATE POLICY "micro_loan_ledger_owner_read" ON public.micro_loan_ledger_entries
FOR SELECT USING (user_id = auth.uid());
