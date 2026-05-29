CREATE TABLE IF NOT EXISTS public.farmer_deal_match_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  realtime_alerts_enabled boolean NOT NULL DEFAULT true,
  min_margin_percent numeric(5,2) NOT NULL DEFAULT 8
    CHECK (min_margin_percent >= 0 AND min_margin_percent <= 35),
  free_unlocked_on date,
  free_unlocked_request_ids jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(free_unlocked_request_ids) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_farmer_deal_match_settings_updated_at
  ON public.farmer_deal_match_settings(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_procurement_requests_status_created_at
  ON public.company_procurement_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_procurement_requests_target_county
  ON public.company_procurement_requests(target_county);

CREATE INDEX IF NOT EXISTS idx_products_farmer_available_category
  ON public.products(farmer_id, is_available, category);

ALTER TABLE public.farmer_deal_match_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "farmer_deal_match_settings_owner_read" ON public.farmer_deal_match_settings;
CREATE POLICY "farmer_deal_match_settings_owner_read"
ON public.farmer_deal_match_settings
FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "farmer_deal_match_settings_owner_insert" ON public.farmer_deal_match_settings;
CREATE POLICY "farmer_deal_match_settings_owner_insert"
ON public.farmer_deal_match_settings
FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "farmer_deal_match_settings_owner_update" ON public.farmer_deal_match_settings;
CREATE POLICY "farmer_deal_match_settings_owner_update"
ON public.farmer_deal_match_settings
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS update_farmer_deal_match_settings_updated_at ON public.farmer_deal_match_settings;
CREATE TRIGGER update_farmer_deal_match_settings_updated_at
BEFORE UPDATE ON public.farmer_deal_match_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
