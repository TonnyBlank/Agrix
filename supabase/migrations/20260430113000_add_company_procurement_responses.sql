CREATE TABLE IF NOT EXISTS public.company_procurement_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.company_procurement_requests(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  farmer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity_offered numeric(12,2) NOT NULL CHECK (quantity_offered > 0),
  accepted_quantity numeric(12,2) CHECK (accepted_quantity IS NULL OR accepted_quantity > 0),
  unit text NOT NULL DEFAULT 'kg',
  price_per_unit numeric(12,2) NOT NULL CHECK (price_per_unit > 0),
  currency text NOT NULL DEFAULT 'KES',
  notes text,
  company_note text,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'accepted', 'rejected', 'withdrawn')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, farmer_id, product_id),
  CONSTRAINT company_procurement_responses_accepted_consistency_chk CHECK (
    (status = 'accepted' AND accepted_quantity IS NOT NULL AND order_id IS NOT NULL)
    OR (status <> 'accepted' AND order_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_company_procurement_responses_request_id
  ON public.company_procurement_responses(request_id);

CREATE INDEX IF NOT EXISTS idx_company_procurement_responses_company_id
  ON public.company_procurement_responses(company_id);

CREATE INDEX IF NOT EXISTS idx_company_procurement_responses_farmer_id
  ON public.company_procurement_responses(farmer_id);

CREATE INDEX IF NOT EXISTS idx_company_procurement_responses_status
  ON public.company_procurement_responses(status);

ALTER TABLE public.company_procurement_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_procurement_responses_company_read" ON public.company_procurement_responses;
CREATE POLICY "company_procurement_responses_company_read"
ON public.company_procurement_responses
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_procurement_responses.company_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "company_procurement_responses_company_update" ON public.company_procurement_responses;
CREATE POLICY "company_procurement_responses_company_update"
ON public.company_procurement_responses
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_procurement_responses.company_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_procurement_responses.company_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "company_procurement_responses_farmer_read" ON public.company_procurement_responses;
CREATE POLICY "company_procurement_responses_farmer_read"
ON public.company_procurement_responses
FOR SELECT
USING (farmer_id = auth.uid());

DROP POLICY IF EXISTS "company_procurement_responses_farmer_insert" ON public.company_procurement_responses;
CREATE POLICY "company_procurement_responses_farmer_insert"
ON public.company_procurement_responses
FOR INSERT
WITH CHECK (farmer_id = auth.uid());

DROP POLICY IF EXISTS "company_procurement_responses_farmer_update" ON public.company_procurement_responses;
CREATE POLICY "company_procurement_responses_farmer_update"
ON public.company_procurement_responses
FOR UPDATE
USING (farmer_id = auth.uid())
WITH CHECK (farmer_id = auth.uid());

DROP TRIGGER IF EXISTS update_company_procurement_responses_updated_at ON public.company_procurement_responses;
CREATE TRIGGER update_company_procurement_responses_updated_at
BEFORE UPDATE ON public.company_procurement_responses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
