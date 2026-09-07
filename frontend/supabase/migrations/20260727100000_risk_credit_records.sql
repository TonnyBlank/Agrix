-- Persist insurance and green-credit readiness records.

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.risk_credit_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_type text NOT NULL
    CHECK (record_type IN ('insurance', 'green_credit')),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  target_amount_text text,
  enterprise text NOT NULL CHECK (length(btrim(enterprise)) > 0),
  risk_focus text NOT NULL CHECK (length(btrim(risk_focus)) > 0),
  evidence_notes text,
  climate_practice text,
  readiness_score integer NOT NULL DEFAULT 0 CHECK (readiness_score >= 0 AND readiness_score <= 100),
  green_score integer NOT NULL DEFAULT 0 CHECK (green_score >= 0 AND green_score <= 100),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'submitted', 'reviewing', 'approved', 'declined')),
  partner_note text,
  partner_reference text,
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risk_credit_records_user_created_idx
ON public.risk_credit_records (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS risk_credit_records_status_submitted_idx
ON public.risk_credit_records (status, submitted_at DESC NULLS LAST, created_at DESC);

CREATE INDEX IF NOT EXISTS risk_credit_records_record_type_idx
ON public.risk_credit_records (record_type, created_at DESC);

DROP TRIGGER IF EXISTS risk_credit_records_updated_at ON public.risk_credit_records;
CREATE TRIGGER risk_credit_records_updated_at
BEFORE UPDATE ON public.risk_credit_records
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.risk_credit_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "risk_credit_records_owner_read" ON public.risk_credit_records;
CREATE POLICY "risk_credit_records_owner_read"
ON public.risk_credit_records
FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "risk_credit_records_owner_insert" ON public.risk_credit_records;
CREATE POLICY "risk_credit_records_owner_insert"
ON public.risk_credit_records
FOR INSERT
WITH CHECK (user_id = auth.uid() AND status IN ('draft', 'ready'));

DROP POLICY IF EXISTS "risk_credit_records_owner_update" ON public.risk_credit_records;
CREATE POLICY "risk_credit_records_owner_update"
ON public.risk_credit_records
FOR UPDATE
USING (user_id = auth.uid() AND status IN ('draft', 'ready'))
WITH CHECK (user_id = auth.uid() AND status IN ('draft', 'ready'));

DROP POLICY IF EXISTS "risk_credit_records_owner_delete" ON public.risk_credit_records;
CREATE POLICY "risk_credit_records_owner_delete"
ON public.risk_credit_records
FOR DELETE
USING (user_id = auth.uid() AND status IN ('draft', 'ready'));
