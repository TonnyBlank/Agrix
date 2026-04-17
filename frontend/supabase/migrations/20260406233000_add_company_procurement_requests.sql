CREATE TABLE IF NOT EXISTS public.company_procurement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'produce',
  target_county text,
  quantity_needed numeric(12,2) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'kg',
  budget_min numeric(12,2),
  budget_max numeric(12,2),
  needed_by date,
  notes text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'paused', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_procurement_requests_company_id
  ON public.company_procurement_requests(company_id);

ALTER TABLE public.company_procurement_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_procurement_owner_all" ON public.company_procurement_requests;
CREATE POLICY "company_procurement_owner_all"
ON public.company_procurement_requests
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_procurement_requests.company_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_procurement_requests.company_id
      AND c.user_id = auth.uid()
  )
);

DROP TRIGGER IF EXISTS update_company_procurement_requests_updated_at ON public.company_procurement_requests;
CREATE TRIGGER update_company_procurement_requests_updated_at
BEFORE UPDATE ON public.company_procurement_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
