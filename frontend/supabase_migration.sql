-- ================================================================
-- AgriLink X - Full Supabase Setup
-- Paste this whole script into the Supabase SQL Editor and run it.
-- This script is idempotent and aims to cover the full app workflow.
-- ================================================================

-- ----------------------------------------------------------------
-- Core enums, roles, profiles, auth hooks
-- ----------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role' AND typtype = 'e') THEN
    BEGIN
      ALTER TYPE public.app_role RENAME VALUE 'buyer_enterprise' TO 'company';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  ELSE
    CREATE TYPE public.app_role AS ENUM ('farmer_free', 'farmer_pro', 'company', 'admin');
  END IF;
END $$;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'company';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  county text,
  bio text,
  farm_size text,
  main_crops text[],
  farm_type text CHECK (farm_type IN ('subsistence', 'commercial', 'mixed', 'livestock', 'horticulture', 'agroforestry')),
  irrigation_type text CHECK (irrigation_type IN ('rainfed', 'drip', 'sprinkler', 'canal', 'none')),
  soil_type text,
  years_farming integer,
  has_storage boolean DEFAULT false,
  has_transport boolean DEFAULT false,
  cooperative_name text,
  farm_gps_lat numeric(10,7),
  farm_gps_lng numeric(10,7),
  photo_url text,
  payout_method text CHECK (payout_method IN ('mpesa', 'bank')),
  payout_mpesa_number text,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  payout_details_updated_at timestamptz,
  plan_started_at timestamptz,
  plan_expires_at timestamptz,
  guarantors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles
DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE public.user_roles
ADD CONSTRAINT user_roles_role_check
CHECK (role::text IN ('farmer_free', 'farmer_pro', 'company', 'admin'));

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.role::public.app_role
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
    AND ur.role::text IN ('admin', 'company', 'farmer_pro', 'farmer_free')
  ORDER BY CASE ur.role::text
    WHEN 'admin' THEN 1
    WHEN 'company' THEN 2
    WHEN 'farmer_pro' THEN 3
    WHEN 'farmer_free' THEN 4
    ELSE 99
  END
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'farmer_free')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- Feature flags
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL UNIQUE,
  enabled_for public.app_role[] NOT NULL DEFAULT '{}',
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read feature flags" ON public.feature_flags;
CREATE POLICY "Anyone authenticated can read feature flags"
ON public.feature_flags
FOR SELECT
TO authenticated
USING (true);

INSERT INTO public.feature_flags (feature_key, enabled_for, description) VALUES
  ('ai_price_guidance', '{farmer_free,farmer_pro,company}', 'Basic AI price guidance'),
  ('ai_crop_advisor', '{farmer_pro,company}', 'Advanced AI crop and profit advisor'),
  ('unlimited_listings', '{farmer_pro,company}', 'Unlimited product listings'),
  ('voice_interface', '{farmer_pro,company}', 'Voice assisted interface'),
  ('micro_loans', '{farmer_pro}', 'Micro-loan access'),
  ('smart_logistics', '{farmer_pro,company}', 'Automated delivery matching'),
  ('contract_farming', '{company}', 'Contract farming module'),
  ('bulk_orders', '{company}', 'Bulk order management'),
  ('predictive_analytics', '{company}', 'AI supply and demand forecasting'),
  ('escrow_payments', '{farmer_free,farmer_pro,company}', 'M-Pesa escrow system'),
  ('community_access', '{farmer_free,farmer_pro,company}', 'Community tips and alerts'),
  ('sales_analytics', '{farmer_pro,company}', 'Real-time sales analytics'),
  ('priority_search', '{farmer_pro}', 'Priority in buyer search results'),
  ('export_reports', '{company}', 'Export reports and projections')
ON CONFLICT (feature_key) DO UPDATE SET
  enabled_for = EXCLUDED.enabled_for,
  description = EXCLUDED.description;

-- ----------------------------------------------------------------
-- Marketplace, messaging, social, crop planning
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Other',
  price_per_unit numeric(10,2) NOT NULL,
  unit text NOT NULL DEFAULT 'kg',
  stock numeric(10,2) NOT NULL DEFAULT 0,
  description text,
  image_emoji text DEFAULT '📦',
  cover_image_url text,
  video_url text,
  is_organic boolean DEFAULT false,
  is_available boolean DEFAULT true,
  location text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  farmer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quantity numeric(10,2) NOT NULL,
  unit text NOT NULL,
  total_price numeric(10,2) NOT NULL,
  delivery_fee numeric(10,2) DEFAULT 50,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  payment_method text DEFAULT 'mpesa',
  payment_ref text,
  payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'initiated', 'pending_confirmation', 'paid', 'failed')),
  merchant_request_id text,
  checkout_request_id text,
  payment_error text,
  paid_at timestamptz,
  escrow_amount numeric(10,2) NOT NULL DEFAULT 0,
  agrilink_commission_rate numeric(6,4) NOT NULL DEFAULT 0.05,
  agrilink_commission_amount numeric(10,2) NOT NULL DEFAULT 0,
  seller_payout_amount numeric(10,2) NOT NULL DEFAULT 0,
  payout_status text NOT NULL DEFAULT 'pending_payment'
    CHECK (payout_status IN ('pending_payment', 'awaiting_delivery', 'awaiting_official_signoff', 'released', 'cancelled')),
  escrow_received_at timestamptz,
  official_verified_at timestamptz,
  official_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  official_note text,
  payout_released_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_checkout_request_id_idx ON public.orders(checkout_request_id);

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message text,
  last_at timestamptz DEFAULT now(),
  unread_a integer DEFAULT 0,
  unread_b integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CHECK (participant_a <> participant_b),
  UNIQUE (participant_a, participant_b)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (product_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.product_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (product_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.crop_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  crop text NOT NULL,
  type text NOT NULL CHECK (type IN ('planting', 'fertilizing', 'spraying', 'harvesting', 'irrigation', 'pruning')),
  event_date date NOT NULL,
  notes text,
  done boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.id_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_url text,
  front_doc_url text,
  back_doc_url text,
  status text NOT NULL DEFAULT 'unverified'
    CHECK (status IN ('unverified', 'pending', 'verified', 'rejected')),
  reviewer_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.id_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_public_read" ON public.products;
DROP POLICY IF EXISTS "products_owner_insert" ON public.products;
DROP POLICY IF EXISTS "products_owner_update" ON public.products;
DROP POLICY IF EXISTS "products_owner_delete" ON public.products;
CREATE POLICY "products_public_read" ON public.products FOR SELECT USING (true);
CREATE POLICY "products_owner_insert" ON public.products FOR INSERT WITH CHECK (farmer_id = auth.uid());
CREATE POLICY "products_owner_update" ON public.products FOR UPDATE USING (farmer_id = auth.uid());
CREATE POLICY "products_owner_delete" ON public.products FOR DELETE USING (farmer_id = auth.uid());

DROP POLICY IF EXISTS "orders_parties_read" ON public.orders;
DROP POLICY IF EXISTS "orders_buyer_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_parties_update" ON public.orders;
CREATE POLICY "orders_parties_read" ON public.orders FOR SELECT USING (buyer_id = auth.uid() OR farmer_id = auth.uid());
CREATE POLICY "orders_buyer_insert" ON public.orders FOR INSERT WITH CHECK (buyer_id = auth.uid());
CREATE POLICY "orders_parties_update" ON public.orders FOR UPDATE USING (buyer_id = auth.uid() OR farmer_id = auth.uid());

DROP POLICY IF EXISTS "conv_participants" ON public.conversations;
CREATE POLICY "conv_participants" ON public.conversations FOR ALL
USING (participant_a = auth.uid() OR participant_b = auth.uid())
WITH CHECK (participant_a = auth.uid() OR participant_b = auth.uid());

DROP POLICY IF EXISTS "msg_participants_read" ON public.messages;
DROP POLICY IF EXISTS "msg_sender_insert" ON public.messages;
CREATE POLICY "msg_participants_read" ON public.messages FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = conversation_id
      AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())
  )
);
CREATE POLICY "msg_sender_insert" ON public.messages FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = conversation_id
      AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())
  )
);

DROP POLICY IF EXISTS "product_likes_public_read" ON public.product_likes;
DROP POLICY IF EXISTS "product_likes_owner_insert" ON public.product_likes;
DROP POLICY IF EXISTS "product_likes_owner_delete" ON public.product_likes;
CREATE POLICY "product_likes_public_read" ON public.product_likes FOR SELECT USING (true);
CREATE POLICY "product_likes_owner_insert" ON public.product_likes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "product_likes_owner_delete" ON public.product_likes FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "product_ratings_public_read" ON public.product_ratings;
DROP POLICY IF EXISTS "product_ratings_owner_insert" ON public.product_ratings;
DROP POLICY IF EXISTS "product_ratings_owner_update" ON public.product_ratings;
CREATE POLICY "product_ratings_public_read" ON public.product_ratings FOR SELECT USING (true);
CREATE POLICY "product_ratings_owner_insert" ON public.product_ratings FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "product_ratings_owner_update" ON public.product_ratings FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "crop_events_owner" ON public.crop_events;
CREATE POLICY "crop_events_owner" ON public.crop_events FOR ALL USING (farmer_id = auth.uid());

DROP POLICY IF EXISTS "id_ver_owner" ON public.id_verifications;
CREATE POLICY "id_ver_owner" ON public.id_verifications FOR ALL USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS products_updated_at ON public.products;
CREATE TRIGGER products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS orders_updated_at ON public.orders;
CREATE TRIGGER orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS crop_events_updated_at ON public.crop_events;
CREATE TRIGGER crop_events_updated_at
BEFORE UPDATE ON public.crop_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS product_ratings_updated_at ON public.product_ratings;
CREATE TRIGGER product_ratings_updated_at
BEFORE UPDATE ON public.product_ratings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.place_marketplace_order(
  p_product_id uuid,
  p_quantity numeric,
  p_unit text DEFAULT NULL,
  p_delivery_fee numeric DEFAULT 50,
  p_notes text DEFAULT NULL
)
RETURNS SETOF public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer_id uuid := auth.uid();
  v_product public.products%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_unit text;
  v_subtotal numeric(10,2);
  v_escrow_amount numeric(10,2);
  v_commission_amount numeric(10,2);
  v_seller_payout_amount numeric(10,2);
BEGIN
  IF v_buyer_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to place an order';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;

  IF p_delivery_fee IS NULL OR p_delivery_fee < 0 THEN
    RAISE EXCEPTION 'Delivery fee must be 0 or more';
  END IF;

  SELECT *
  INTO v_product
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF v_product.farmer_id = v_buyer_id THEN
    RAISE EXCEPTION 'You cannot place an order for your own product';
  END IF;

  IF COALESCE(v_product.is_available, false) = false THEN
    RAISE EXCEPTION 'This product is not currently available';
  END IF;

  IF v_product.stock < p_quantity THEN
    RAISE EXCEPTION 'Only % % available for this product', v_product.stock, v_product.unit;
  END IF;

  v_unit := COALESCE(NULLIF(trim(p_unit), ''), v_product.unit);
  v_subtotal := round(v_product.price_per_unit * p_quantity, 2);
  v_escrow_amount := round(v_subtotal + p_delivery_fee, 2);
  v_commission_amount := round(v_subtotal * 0.05, 2);
  v_seller_payout_amount := round(greatest(v_subtotal - v_commission_amount, 0), 2);

  INSERT INTO public.orders (
    product_id, buyer_id, farmer_id, quantity, unit, total_price,
    delivery_fee, status, payment_method, notes,
    escrow_amount, agrilink_commission_rate, agrilink_commission_amount,
    seller_payout_amount, payout_status
  )
  VALUES (
    v_product.id, v_buyer_id, v_product.farmer_id, p_quantity, v_unit,
    v_subtotal, p_delivery_fee, 'pending', 'mpesa',
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    v_escrow_amount, 0.05, v_commission_amount, v_seller_payout_amount, 'pending_payment'
  )
  RETURNING * INTO v_order;

  UPDATE public.products
  SET
    stock = stock - p_quantity,
    is_available = (stock - p_quantity) > 0,
    updated_at = now()
  WHERE id = v_product.id;

  RETURN NEXT v_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_marketplace_order(uuid, numeric, text, numeric, text) TO authenticated;

-- ----------------------------------------------------------------
-- Micro-loans
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.micro_loan_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  applicant_role text NOT NULL CHECK (applicant_role IN ('farmer_pro', 'company')),
  product_type text NOT NULL CHECK (product_type IN ('seasonal_working_capital', 'equipment_top_up', 'buyer_contract_financing')),
  product_title text NOT NULL,
  requested_amount numeric(12,2) NOT NULL CHECK (requested_amount > 0),
  approved_amount numeric(12,2),
  speed text,
  interest_rate numeric(5,2),
  repayment_days integer,
  status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending_review', 'approved', 'rejected', 'disbursed', 'repaid')),
  note text,
  guarantors jsonb DEFAULT '[]'::jsonb,
  security_type text NOT NULL DEFAULT 'unsecured' CHECK (security_type IN ('unsecured', 'guarantor', 'collateral')),
  requires_branch_visit boolean NOT NULL DEFAULT false,
  branch_name text,
  branch_location text,
  target_county text,
  branch_instructions text,
  branch_visit_status text NOT NULL DEFAULT 'not_required'
    CHECK (branch_visit_status IN ('not_required', 'pending_customer_visit', 'documents_received', 'valuation_pending', 'verified', 'waived')),
  collateral_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  collateral_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  disbursed_at timestamptz,
  repaid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

UPDATE public.micro_loan_applications
SET branch_visit_status = CASE
  WHEN COALESCE(requires_branch_visit, false) THEN 'pending_customer_visit'
  ELSE 'not_required'
END
WHERE branch_visit_status NOT IN ('not_required', 'pending_customer_visit', 'documents_received', 'valuation_pending', 'verified', 'waived');

UPDATE public.micro_loan_applications
SET disbursed_at = COALESCE(disbursed_at, reviewed_at, created_at)
WHERE status IN ('approved', 'disbursed', 'repaid');

ALTER TABLE public.micro_loan_applications
ADD COLUMN IF NOT EXISTS disbursement_method text NOT NULL DEFAULT 'mpesa'
  CHECK (disbursement_method IN ('mpesa', 'voucher')),
ADD COLUMN IF NOT EXISTS repayment_method text NOT NULL DEFAULT 'mpesa'
  CHECK (repayment_method IN ('mpesa', 'pay_with_produce')),
ADD COLUMN IF NOT EXISTS voucher_code text;

ALTER TABLE public.micro_loan_applications
ADD COLUMN IF NOT EXISTS target_county text;

CREATE INDEX IF NOT EXISTS micro_loan_applications_user_created_idx
ON public.micro_loan_applications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.micro_loan_repayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL REFERENCES public.micro_loan_applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL DEFAULT 'mpesa',
  payment_ref text,
  phone_number text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS micro_loan_repayments_loan_created_idx
ON public.micro_loan_repayments (loan_application_id, created_at ASC);

CREATE INDEX IF NOT EXISTS micro_loan_repayments_user_created_idx
ON public.micro_loan_repayments (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.micro_loan_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_role text NOT NULL CHECK (applicant_role IN ('farmer_pro', 'company')),
  product_type text NOT NULL CHECK (product_type IN ('seasonal_working_capital', 'equipment_top_up', 'buyer_contract_financing')),
  product_title text NOT NULL,
  max_amount numeric(12,2) NOT NULL CHECK (max_amount > 0),
  interest_rate numeric(5,2),
  repayment_days integer,
  speed text,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  security_type text NOT NULL DEFAULT 'unsecured' CHECK (security_type IN ('unsecured', 'guarantor', 'collateral')),
  requires_branch_visit boolean NOT NULL DEFAULT false,
  branch_name text,
  branch_location text,
  target_county text,
  branch_instructions text,
  collateral_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS micro_loan_offers_role_active_created_idx
ON public.micro_loan_offers (applicant_role, is_active, created_at DESC);

UPDATE public.micro_loan_offers
SET target_county = COALESCE(target_county, NULLIF(TRIM(branch_location), ''))
WHERE target_county IS NULL;

UPDATE public.micro_loan_applications
SET target_county = COALESCE(target_county, NULLIF(TRIM(branch_location), ''))
WHERE target_county IS NULL;

CREATE INDEX IF NOT EXISTS micro_loan_offers_role_county_active_created_idx
ON public.micro_loan_offers (applicant_role, target_county, is_active, created_at DESC);

ALTER TABLE public.micro_loan_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.micro_loan_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.micro_loan_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "micro_loan_owner_read" ON public.micro_loan_applications;
DROP POLICY IF EXISTS "micro_loan_owner_insert" ON public.micro_loan_applications;
DROP POLICY IF EXISTS "micro_loan_owner_update" ON public.micro_loan_applications;
CREATE POLICY "micro_loan_owner_read" ON public.micro_loan_applications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "micro_loan_owner_insert" ON public.micro_loan_applications FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "micro_loan_owner_update" ON public.micro_loan_applications FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "micro_loan_repayment_owner_read" ON public.micro_loan_repayments;
DROP POLICY IF EXISTS "micro_loan_repayment_owner_insert" ON public.micro_loan_repayments;
CREATE POLICY "micro_loan_repayment_owner_read" ON public.micro_loan_repayments FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "micro_loan_repayment_owner_insert" ON public.micro_loan_repayments FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "micro_loan_offers_authenticated_read" ON public.micro_loan_offers;
CREATE POLICY "micro_loan_offers_authenticated_read" ON public.micro_loan_offers FOR SELECT USING (auth.role() = 'authenticated');

DROP TRIGGER IF EXISTS micro_loan_applications_updated_at ON public.micro_loan_applications;
CREATE TRIGGER micro_loan_applications_updated_at
BEFORE UPDATE ON public.micro_loan_applications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS micro_loan_offers_updated_at ON public.micro_loan_offers;
CREATE TRIGGER micro_loan_offers_updated_at
BEFORE UPDATE ON public.micro_loan_offers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------
-- Company workflow
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  company_type text NOT NULL DEFAULT 'other',
  registration_number text NOT NULL,
  tax_id text NOT NULL,
  phone text,
  email text,
  website text,
  bio text,
  logo_url text,
  cover_image_url text,
  headquarters_location text,
  service_areas text[] NOT NULL DEFAULT '{}',
  certifications text[] NOT NULL DEFAULT '{}',
  payout_method text,
  payout_mpesa_number text,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  rating numeric(3,2),
  verified boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'approved', 'rejected', 'suspended')),
  verification_notes text,
  rejection_reason text,
  verified_at timestamptz,
  verified_by_admin_at timestamptz,
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  description text,
  price_per_unit numeric(12,2) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'kg',
  minimum_order_quantity numeric(12,2) NOT NULL DEFAULT 1,
  stock numeric(12,2) NOT NULL DEFAULT 0,
  bulk_discount_tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_url text,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  farmer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.company_products(id) ON DELETE SET NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.farmer_company_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  farmer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'inactive', 'blocked')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, farmer_id)
);

CREATE TABLE IF NOT EXISTS public.company_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  farmer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS idx_companies_user_id ON public.companies(user_id);
CREATE INDEX IF NOT EXISTS idx_companies_verification_status ON public.companies(verification_status);
CREATE INDEX IF NOT EXISTS idx_company_products_company_id ON public.company_products(company_id);
CREATE INDEX IF NOT EXISTS idx_company_orders_company_id ON public.company_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_farmer_company_relations_company_id ON public.farmer_company_relations(company_id);
CREATE INDEX IF NOT EXISTS idx_company_contracts_company_id ON public.company_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_company_procurement_requests_company_id ON public.company_procurement_requests(company_id);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmer_company_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_procurement_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_owner_select" ON public.companies;
DROP POLICY IF EXISTS "companies_owner_insert" ON public.companies;
DROP POLICY IF EXISTS "companies_owner_update" ON public.companies;
DROP POLICY IF EXISTS "companies_public_verified_read" ON public.companies;
CREATE POLICY "companies_owner_select" ON public.companies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "companies_owner_insert" ON public.companies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "companies_owner_update" ON public.companies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "companies_public_verified_read" ON public.companies FOR SELECT USING (verified = true);

DROP POLICY IF EXISTS "company_products_owner_all" ON public.company_products;
CREATE POLICY "company_products_owner_all" ON public.company_products FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_products.company_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_products.company_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "company_orders_owner_read" ON public.company_orders;
CREATE POLICY "company_orders_owner_read" ON public.company_orders FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_orders.company_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "farmer_company_relations_owner_read" ON public.farmer_company_relations;
CREATE POLICY "farmer_company_relations_owner_read" ON public.farmer_company_relations FOR SELECT
USING (
  farmer_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = farmer_company_relations.company_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "company_contracts_owner_read" ON public.company_contracts;
CREATE POLICY "company_contracts_owner_read" ON public.company_contracts FOR SELECT
USING (
  farmer_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_contracts.company_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "company_procurement_owner_all" ON public.company_procurement_requests;
CREATE POLICY "company_procurement_owner_all" ON public.company_procurement_requests FOR ALL
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

DROP TRIGGER IF EXISTS update_companies_updated_at ON public.companies;
CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_company_products_updated_at ON public.company_products;
CREATE TRIGGER update_company_products_updated_at
BEFORE UPDATE ON public.company_products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_company_orders_updated_at ON public.company_orders;
CREATE TRIGGER update_company_orders_updated_at
BEFORE UPDATE ON public.company_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_farmer_company_relations_updated_at ON public.farmer_company_relations;
CREATE TRIGGER update_farmer_company_relations_updated_at
BEFORE UPDATE ON public.farmer_company_relations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_company_contracts_updated_at ON public.company_contracts;
CREATE TRIGGER update_company_contracts_updated_at
BEFORE UPDATE ON public.company_contracts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_company_procurement_requests_updated_at ON public.company_procurement_requests;
CREATE TRIGGER update_company_procurement_requests_updated_at
BEFORE UPDATE ON public.company_procurement_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.sync_company_role_from_company_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.verified, false) = true OR NEW.verification_status = 'approved' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'company')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

INSERT INTO public.user_roles (user_id, role)
SELECT c.user_id, 'company'::public.app_role
FROM public.companies c
WHERE c.user_id IS NOT NULL
  AND (COALESCE(c.verified, false) = true OR c.verification_status = 'approved')
ON CONFLICT (user_id, role) DO NOTHING;

DROP TRIGGER IF EXISTS sync_company_role_from_company_record ON public.companies;
CREATE TRIGGER sync_company_role_from_company_record
AFTER INSERT OR UPDATE OF verified, verification_status ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.sync_company_role_from_company_record();

-- ----------------------------------------------------------------
-- Storage
-- ----------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-media', 'product-media', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('id-documents', 'id-documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "product_media_public_read" ON storage.objects;
DROP POLICY IF EXISTS "product_media_auth_upload" ON storage.objects;
DROP POLICY IF EXISTS "id_docs_owner_upload" ON storage.objects;
DROP POLICY IF EXISTS "id_docs_owner_read" ON storage.objects;
DROP POLICY IF EXISTS "profile_photos_public_read" ON storage.objects;
DROP POLICY IF EXISTS "profile_photos_owner_upload" ON storage.objects;

CREATE POLICY "product_media_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'product-media');
CREATE POLICY "product_media_auth_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-media' AND auth.role() = 'authenticated');
CREATE POLICY "id_docs_owner_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'id-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "id_docs_owner_read" ON storage.objects FOR SELECT USING (bucket_id = 'id-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "profile_photos_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'profile-photos');
CREATE POLICY "profile_photos_owner_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ----------------------------------------------------------------
-- Realtime
-- ----------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;
