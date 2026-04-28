-- External consistency patch:
-- - hardens micro-loan lifecycle/status/disbursement invariants
-- - enforces repayment ownership/method consistency
-- - persists and validates AI scanner outputs

UPDATE public.micro_loan_offers
SET
  security_type = CASE
    WHEN security_type IN ('unsecured', 'guarantor', 'collateral') THEN security_type
    ELSE 'unsecured'
  END,
  branch_name = NULLIF(BTRIM(COALESCE(branch_name, '')), ''),
  branch_location = NULLIF(BTRIM(COALESCE(branch_location, '')), ''),
  target_county = COALESCE(
    NULLIF(BTRIM(COALESCE(target_county, '')), ''),
    NULLIF(BTRIM(COALESCE(branch_location, '')), '')
  ),
  branch_instructions = NULLIF(BTRIM(COALESCE(branch_instructions, '')), ''),
  collateral_types = CASE
    WHEN jsonb_typeof(collateral_types) = 'array' THEN collateral_types
    ELSE '[]'::jsonb
  END,
  required_documents = CASE
    WHEN jsonb_typeof(required_documents) = 'array' THEN required_documents
    ELSE '[]'::jsonb
  END
WHERE true;

UPDATE public.micro_loan_applications
SET
  security_type = CASE
    WHEN security_type IN ('unsecured', 'guarantor', 'collateral') THEN security_type
    ELSE 'unsecured'
  END,
  requires_branch_visit = CASE
    WHEN COALESCE(requires_branch_visit, false)
      AND NULLIF(BTRIM(COALESCE(branch_name, '')), '') IS NOT NULL
      AND NULLIF(BTRIM(COALESCE(branch_location, '')), '') IS NOT NULL
      THEN true
    ELSE false
  END,
  branch_name = NULLIF(BTRIM(COALESCE(branch_name, '')), ''),
  branch_location = NULLIF(BTRIM(COALESCE(branch_location, '')), ''),
  target_county = COALESCE(
    NULLIF(BTRIM(COALESCE(target_county, '')), ''),
    NULLIF(BTRIM(COALESCE(branch_location, '')), '')
  ),
  branch_instructions = NULLIF(BTRIM(COALESCE(branch_instructions, '')), ''),
  guarantors = CASE
    WHEN jsonb_typeof(guarantors) = 'array' THEN guarantors
    ELSE '[]'::jsonb
  END,
  collateral_types = CASE
    WHEN jsonb_typeof(collateral_types) = 'array' THEN collateral_types
    ELSE '[]'::jsonb
  END,
  required_documents = CASE
    WHEN jsonb_typeof(required_documents) = 'array' THEN required_documents
    ELSE '[]'::jsonb
  END,
  collateral_items = CASE
    WHEN jsonb_typeof(collateral_items) = 'array' THEN collateral_items
    ELSE '[]'::jsonb
  END,
  disbursement_method = CASE
    WHEN disbursement_method IN ('mpesa', 'voucher') THEN disbursement_method
    ELSE 'mpesa'
  END,
  repayment_method = CASE
    WHEN repayment_method IN ('mpesa', 'pay_with_produce') THEN repayment_method
    ELSE 'mpesa'
  END,
  branch_visit_status = CASE
    WHEN NOT (
      COALESCE(requires_branch_visit, false)
      AND NULLIF(BTRIM(COALESCE(branch_name, '')), '') IS NOT NULL
      AND NULLIF(BTRIM(COALESCE(branch_location, '')), '') IS NOT NULL
    ) THEN 'not_required'
    WHEN branch_visit_status IN ('pending_customer_visit', 'documents_received', 'valuation_pending', 'verified', 'waived') THEN branch_visit_status
    ELSE 'pending_customer_visit'
  END,
  reviewed_at = CASE
    WHEN status IN ('approved', 'disbursed', 'repaid') THEN COALESCE(reviewed_at, created_at, now())
    WHEN status = 'pending_review' THEN NULL
    ELSE reviewed_at
  END,
  disbursed_at = CASE
    WHEN status IN ('disbursed', 'repaid') THEN COALESCE(disbursed_at, reviewed_at, created_at, now())
    WHEN status = 'pending_review' THEN NULL
    ELSE disbursed_at
  END,
  repaid_at = CASE
    WHEN status = 'repaid' THEN COALESCE(repaid_at, now())
    ELSE NULL
  END,
  voucher_code = CASE
    WHEN disbursement_method = 'voucher'
      AND status IN ('disbursed', 'repaid')
      AND NULLIF(BTRIM(COALESCE(voucher_code, '')), '') IS NULL
      THEN 'ALV-' || UPPER(SUBSTR(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8))
    WHEN disbursement_method = 'mpesa'
      THEN NULL
    ELSE NULLIF(BTRIM(COALESCE(voucher_code, '')), '')
  END
WHERE true;

ALTER TABLE public.micro_loan_offers
DROP CONSTRAINT IF EXISTS micro_loan_offers_branch_requirements_chk;

ALTER TABLE public.micro_loan_offers
ADD CONSTRAINT micro_loan_offers_branch_requirements_chk
CHECK (
  (NOT requires_branch_visit)
  OR (
    NULLIF(BTRIM(COALESCE(branch_name, '')), '') IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(branch_location, '')), '') IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(target_county, '')), '') IS NOT NULL
  )
);

ALTER TABLE public.micro_loan_offers
DROP CONSTRAINT IF EXISTS micro_loan_offers_collateral_requirements_chk;

ALTER TABLE public.micro_loan_offers
ADD CONSTRAINT micro_loan_offers_collateral_requirements_chk
CHECK (
  CASE
    WHEN security_type = 'collateral' THEN jsonb_typeof(collateral_types) = 'array' AND jsonb_array_length(collateral_types) > 0
    ELSE true
  END
);

ALTER TABLE public.micro_loan_applications
DROP CONSTRAINT IF EXISTS micro_loan_applications_json_arrays_chk;

ALTER TABLE public.micro_loan_applications
ADD CONSTRAINT micro_loan_applications_json_arrays_chk
CHECK (
  jsonb_typeof(guarantors) = 'array'
  AND jsonb_typeof(collateral_types) = 'array'
  AND jsonb_typeof(required_documents) = 'array'
  AND jsonb_typeof(collateral_items) = 'array'
);

ALTER TABLE public.micro_loan_applications
DROP CONSTRAINT IF EXISTS micro_loan_applications_amount_consistency_chk;

ALTER TABLE public.micro_loan_applications
ADD CONSTRAINT micro_loan_applications_amount_consistency_chk
CHECK (requested_amount > 0 AND (approved_amount IS NULL OR approved_amount > 0));

ALTER TABLE public.micro_loan_applications
DROP CONSTRAINT IF EXISTS micro_loan_applications_branch_consistency_chk;

ALTER TABLE public.micro_loan_applications
ADD CONSTRAINT micro_loan_applications_branch_consistency_chk
CHECK (
  ((NOT requires_branch_visit) AND branch_visit_status = 'not_required')
  OR (
    requires_branch_visit
    AND branch_visit_status IN ('pending_customer_visit', 'documents_received', 'valuation_pending', 'verified', 'waived')
    AND NULLIF(BTRIM(COALESCE(branch_name, '')), '') IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(branch_location, '')), '') IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(target_county, '')), '') IS NOT NULL
  )
);

ALTER TABLE public.micro_loan_applications
DROP CONSTRAINT IF EXISTS micro_loan_applications_security_consistency_chk;

ALTER TABLE public.micro_loan_applications
ADD CONSTRAINT micro_loan_applications_security_consistency_chk
CHECK (
  CASE security_type
    WHEN 'guarantor' THEN jsonb_array_length(guarantors) > 0
    WHEN 'collateral' THEN jsonb_array_length(collateral_items) > 0 AND jsonb_array_length(collateral_types) > 0
    ELSE true
  END
);

ALTER TABLE public.micro_loan_applications
DROP CONSTRAINT IF EXISTS micro_loan_applications_status_timestamps_chk;

ALTER TABLE public.micro_loan_applications
ADD CONSTRAINT micro_loan_applications_status_timestamps_chk
CHECK (
  CASE
    WHEN status = 'pending_review' THEN reviewed_at IS NULL AND disbursed_at IS NULL AND repaid_at IS NULL
    WHEN status = 'approved' THEN reviewed_at IS NOT NULL AND repaid_at IS NULL
    WHEN status = 'disbursed' THEN reviewed_at IS NOT NULL AND disbursed_at IS NOT NULL AND repaid_at IS NULL
    WHEN status = 'repaid' THEN reviewed_at IS NOT NULL AND disbursed_at IS NOT NULL AND repaid_at IS NOT NULL
    WHEN status = 'rejected' THEN repaid_at IS NULL
    ELSE true
  END
);

ALTER TABLE public.micro_loan_applications
DROP CONSTRAINT IF EXISTS micro_loan_applications_disbursement_consistency_chk;

ALTER TABLE public.micro_loan_applications
ADD CONSTRAINT micro_loan_applications_disbursement_consistency_chk
CHECK (
  (disbursement_method = 'mpesa' AND NULLIF(BTRIM(COALESCE(voucher_code, '')), '') IS NULL)
  OR (
    disbursement_method = 'voucher'
    AND (
      status NOT IN ('disbursed', 'repaid')
      OR NULLIF(BTRIM(COALESCE(voucher_code, '')), '') IS NOT NULL
    )
  )
);

ALTER TABLE public.micro_loan_applications
DROP CONSTRAINT IF EXISTS micro_loan_applications_repayment_method_role_chk;

ALTER TABLE public.micro_loan_applications
ADD CONSTRAINT micro_loan_applications_repayment_method_role_chk
CHECK (repayment_method <> 'pay_with_produce' OR applicant_role = 'farmer_pro');

ALTER TABLE public.micro_loan_applications
DROP CONSTRAINT IF EXISTS micro_loan_applications_branch_ready_for_disbursement_chk;

ALTER TABLE public.micro_loan_applications
ADD CONSTRAINT micro_loan_applications_branch_ready_for_disbursement_chk
CHECK (
  status NOT IN ('disbursed', 'repaid')
  OR (NOT requires_branch_visit)
  OR branch_visit_status IN ('documents_received', 'verified', 'waived')
);

ALTER TABLE public.micro_loan_repayments
DROP CONSTRAINT IF EXISTS micro_loan_repayments_payment_method_check;

ALTER TABLE public.micro_loan_repayments
ADD CONSTRAINT micro_loan_repayments_payment_method_check
CHECK (payment_method IN ('mpesa', 'pay_with_produce'));

ALTER TABLE public.micro_loan_repayments
DROP CONSTRAINT IF EXISTS micro_loan_repayments_phone_requirement_chk;

ALTER TABLE public.micro_loan_repayments
ADD CONSTRAINT micro_loan_repayments_phone_requirement_chk
CHECK (
  (payment_method = 'mpesa' AND NULLIF(BTRIM(COALESCE(phone_number, '')), '') IS NOT NULL)
  OR payment_method = 'pay_with_produce'
);

CREATE OR REPLACE FUNCTION public.enforce_micro_loan_application_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.security_type := CASE
    WHEN NEW.security_type IN ('unsecured', 'guarantor', 'collateral') THEN NEW.security_type
    ELSE 'unsecured'
  END;

  NEW.disbursement_method := CASE
    WHEN NEW.disbursement_method IN ('mpesa', 'voucher') THEN NEW.disbursement_method
    ELSE 'mpesa'
  END;

  NEW.repayment_method := CASE
    WHEN NEW.repayment_method IN ('mpesa', 'pay_with_produce') THEN NEW.repayment_method
    ELSE 'mpesa'
  END;

  IF NEW.repayment_method = 'pay_with_produce' AND NEW.applicant_role <> 'farmer_pro' THEN
    RAISE EXCEPTION 'Pay with Produce repayment method is only available for Farmer Pro applications';
  END IF;

  NEW.branch_name := NULLIF(BTRIM(COALESCE(NEW.branch_name, '')), '');
  NEW.branch_location := NULLIF(BTRIM(COALESCE(NEW.branch_location, '')), '');
  NEW.target_county := COALESCE(NULLIF(BTRIM(COALESCE(NEW.target_county, '')), ''), NEW.branch_location);
  NEW.branch_instructions := NULLIF(BTRIM(COALESCE(NEW.branch_instructions, '')), '');

  NEW.guarantors := CASE WHEN jsonb_typeof(NEW.guarantors) = 'array' THEN NEW.guarantors ELSE '[]'::jsonb END;
  NEW.collateral_types := CASE WHEN jsonb_typeof(NEW.collateral_types) = 'array' THEN NEW.collateral_types ELSE '[]'::jsonb END;
  NEW.required_documents := CASE WHEN jsonb_typeof(NEW.required_documents) = 'array' THEN NEW.required_documents ELSE '[]'::jsonb END;
  NEW.collateral_items := CASE WHEN jsonb_typeof(NEW.collateral_items) = 'array' THEN NEW.collateral_items ELSE '[]'::jsonb END;

  IF COALESCE(NEW.requires_branch_visit, false) THEN
    IF NEW.branch_name IS NULL OR NEW.branch_location IS NULL THEN
      NEW.requires_branch_visit := false;
      NEW.branch_visit_status := 'not_required';
    ELSIF NEW.branch_visit_status NOT IN ('pending_customer_visit', 'documents_received', 'valuation_pending', 'verified', 'waived') THEN
      NEW.branch_visit_status := 'pending_customer_visit';
    END IF;
  ELSE
    NEW.branch_visit_status := 'not_required';
  END IF;

  IF NEW.requested_amount <= 0 THEN
    RAISE EXCEPTION 'Requested amount must be greater than zero';
  END IF;

  IF NEW.approved_amount IS NOT NULL AND NEW.approved_amount <= 0 THEN
    RAISE EXCEPTION 'Approved amount must be greater than zero';
  END IF;

  IF NEW.status IN ('approved', 'disbursed', 'repaid') THEN
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, NEW.created_at, now());
  END IF;

  IF NEW.status IN ('disbursed', 'repaid') THEN
    NEW.disbursed_at := COALESCE(NEW.disbursed_at, NEW.reviewed_at, NEW.created_at, now());
  END IF;

  IF NEW.status = 'repaid' THEN
    NEW.repaid_at := COALESCE(NEW.repaid_at, now());
  ELSE
    NEW.repaid_at := NULL;
  END IF;

  IF NEW.disbursement_method = 'voucher' THEN
    NEW.voucher_code := NULLIF(BTRIM(COALESCE(NEW.voucher_code, '')), '');
    IF NEW.status IN ('disbursed', 'repaid') AND NEW.voucher_code IS NULL THEN
      NEW.voucher_code := 'ALV-' || UPPER(SUBSTR(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8));
    END IF;
  ELSE
    NEW.voucher_code := NULL;
  END IF;

  IF NEW.status IN ('disbursed', 'repaid')
    AND COALESCE(NEW.requires_branch_visit, false)
    AND NEW.branch_visit_status NOT IN ('documents_received', 'verified', 'waived') THEN
    RAISE EXCEPTION 'Branch-visit loans must be documents_received, verified, or waived before disbursement';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS micro_loan_applications_consistency_guard ON public.micro_loan_applications;
CREATE TRIGGER micro_loan_applications_consistency_guard
BEFORE INSERT OR UPDATE ON public.micro_loan_applications
FOR EACH ROW EXECUTE FUNCTION public.enforce_micro_loan_application_consistency();

CREATE OR REPLACE FUNCTION public.enforce_micro_loan_repayment_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_loan public.micro_loan_applications%ROWTYPE;
BEGIN
  SELECT *
  INTO v_loan
  FROM public.micro_loan_applications
  WHERE id = NEW.loan_application_id;

  IF v_loan.id IS NULL THEN
    RAISE EXCEPTION 'Loan application not found for repayment';
  END IF;

  IF NEW.user_id <> v_loan.user_id THEN
    RAISE EXCEPTION 'Repayment user must match the loan owner';
  END IF;

  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Repayment amount must be greater than zero';
  END IF;

  NEW.payment_method := CASE
    WHEN NEW.payment_method IN ('mpesa', 'pay_with_produce') THEN NEW.payment_method
    ELSE 'mpesa'
  END;

  NEW.payment_ref := NULLIF(BTRIM(COALESCE(NEW.payment_ref, '')), '');
  NEW.phone_number := NULLIF(BTRIM(COALESCE(NEW.phone_number, '')), '');
  NEW.note := NULLIF(BTRIM(COALESCE(NEW.note, '')), '');
  NEW.created_at := COALESCE(NEW.created_at, now());

  IF NEW.payment_method <> COALESCE(v_loan.repayment_method, 'mpesa') THEN
    RAISE EXCEPTION 'Repayment method must match the loan repayment configuration';
  END IF;

  IF NEW.payment_method = 'pay_with_produce' THEN
    NEW.phone_number := NULL;
  ELSIF NEW.phone_number IS NULL THEN
    RAISE EXCEPTION 'M-Pesa repayments require a phone number';
  END IF;

  IF v_loan.status = 'rejected' THEN
    RAISE EXCEPTION 'Rejected loans cannot receive repayments';
  END IF;

  IF v_loan.status NOT IN ('disbursed', 'repaid') THEN
    RAISE EXCEPTION 'Only disbursed loans can receive repayments';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS micro_loan_repayments_consistency_guard ON public.micro_loan_repayments;
CREATE TRIGGER micro_loan_repayments_consistency_guard
BEFORE INSERT OR UPDATE ON public.micro_loan_repayments
FOR EACH ROW EXECUTE FUNCTION public.enforce_micro_loan_repayment_consistency();

CREATE OR REPLACE FUNCTION public.is_valid_crop_scanner_result(payload jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    jsonb_typeof(payload) = 'object'
    AND NULLIF(BTRIM(COALESCE(payload->>'disease', '')), '') IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(payload->>'scientificName', '')), '') IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(payload->>'crop', '')), '') IS NOT NULL
    AND (payload->>'confidence') ~ '^-?[0-9]+(\.[0-9]+)?$'
    AND (payload->>'confidence')::numeric BETWEEN 0 AND 100
    AND LOWER(COALESCE(payload->>'severity', '')) IN ('low', 'moderate', 'high')
    AND LOWER(COALESCE(payload->>'spreadRisk', '')) IN ('low', 'moderate', 'high')
    AND NULLIF(BTRIM(COALESCE(payload->>'affectedArea', '')), '') IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(payload->>'description', '')), '') IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(payload->>'treatment', '')), '') IS NOT NULL
    AND jsonb_typeof(payload->'organicAlternatives') = 'array'
    AND jsonb_array_length(payload->'organicAlternatives') BETWEEN 1 AND 5
    AND jsonb_typeof(payload->'fertilizerRecommendations') = 'array'
    AND jsonb_array_length(payload->'fertilizerRecommendations') BETWEEN 1 AND 5
    AND NULLIF(BTRIM(COALESCE(payload->>'prevention', '')), '') IS NOT NULL;
$$;

CREATE TABLE IF NOT EXISTS public.crop_scanner_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  image_size_bytes integer NOT NULL CHECK (image_size_bytes > 0 AND image_size_bytes <= 8388608),
  image_sha256 text NOT NULL CHECK (image_sha256 ~ '^[0-9a-f]{64}$'),
  analysis_mode text NOT NULL CHECK (analysis_mode IN ('gemini', 'heuristic')),
  advisory text NOT NULL,
  result jsonb NOT NULL,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crop_scanner_scans_result_valid_chk CHECK (public.is_valid_crop_scanner_result(result))
);

CREATE INDEX IF NOT EXISTS crop_scanner_scans_user_scanned_idx
ON public.crop_scanner_scans (user_id, scanned_at DESC);

CREATE INDEX IF NOT EXISTS crop_scanner_scans_sha_idx
ON public.crop_scanner_scans (image_sha256);

ALTER TABLE public.crop_scanner_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crop_scanner_scans_owner_read" ON public.crop_scanner_scans;
DROP POLICY IF EXISTS "crop_scanner_scans_owner_insert" ON public.crop_scanner_scans;

CREATE POLICY "crop_scanner_scans_owner_read" ON public.crop_scanner_scans
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "crop_scanner_scans_owner_insert" ON public.crop_scanner_scans
FOR INSERT WITH CHECK (user_id = auth.uid());
