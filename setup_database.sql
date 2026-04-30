-- ================================================================
-- AgriLink X - Full Supabase Setup
-- Paste this whole script into the Supabase SQL Editor and run it.
-- This script is idempotent and aims to cover the full app workflow.
-- It is the authoritative merged bootstrap from all project SQL files.
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
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "profiles_public_read" ON public.profiles;
CREATE POLICY "profiles_public_read" ON public.profiles FOR SELECT USING (true);

-- Explicit farm-profile visibility rule for platform and county admins.
-- This stays in place even if public profile read policy is tightened later.
CREATE OR REPLACE FUNCTION public.can_view_farm_profile_as_admin(_viewer_id uuid, _farm_county text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _viewer_id
        AND ur.role::text IN ('admin', 'platform_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.profiles admin_profile
        ON admin_profile.user_id = ur.user_id
      WHERE ur.user_id = _viewer_id
        AND ur.role::text = 'county_admin'
        AND COALESCE(NULLIF(BTRIM(admin_profile.county), ''), '') <> ''
        AND LOWER(BTRIM(admin_profile.county)) = LOWER(BTRIM(COALESCE(_farm_county, '')))
    );
$$;

DROP POLICY IF EXISTS "profiles_platform_county_admin_read" ON public.profiles;
CREATE POLICY "profiles_platform_county_admin_read"
ON public.profiles
FOR SELECT
USING (public.can_view_farm_profile_as_admin(auth.uid(), county));

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
  delivery_proof_photo_url text,
  delivery_proof_geo_lat numeric(10,7),
  delivery_proof_geo_lng numeric(10,7),
  delivery_proof_submitted_at timestamptz,
  delivery_proof_submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  delivery_proof_note text,
  buyer_delivery_otp_hash text,
  buyer_delivery_otp_requested_at timestamptz,
  buyer_delivery_otp_expires_at timestamptz,
  buyer_delivery_otp_verified_at timestamptz,
  buyer_delivery_otp_attempts integer NOT NULL DEFAULT 0,
  delivery_signoff_status text NOT NULL DEFAULT 'pending_proof',
  dispute_reason text,
  dispute_opened_at timestamptz,
  dispute_opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  dispute_resolved_at timestamptz,
  dispute_resolution_note text,
  dispute_deadline_at timestamptz,
  official_verified_at timestamptz,
  official_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  official_note text,
  payout_released_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_checkout_request_id_idx ON public.orders(checkout_request_id);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_proof_photo_url text,
  ADD COLUMN IF NOT EXISTS delivery_proof_geo_lat numeric(10,7),
  ADD COLUMN IF NOT EXISTS delivery_proof_geo_lng numeric(10,7),
  ADD COLUMN IF NOT EXISTS delivery_proof_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_proof_submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_proof_note text,
  ADD COLUMN IF NOT EXISTS buyer_delivery_otp_hash text,
  ADD COLUMN IF NOT EXISTS buyer_delivery_otp_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS buyer_delivery_otp_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS buyer_delivery_otp_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS buyer_delivery_otp_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_signoff_status text NOT NULL DEFAULT 'pending_proof',
  ADD COLUMN IF NOT EXISTS dispute_reason text,
  ADD COLUMN IF NOT EXISTS dispute_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispute_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_resolution_note text,
  ADD COLUMN IF NOT EXISTS dispute_deadline_at timestamptz;

CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric(10,2) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cart_items_buyer_product_unique UNIQUE (buyer_id, product_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cart_items' AND column_name = 'id'
  ) THEN
    ALTER TABLE public.cart_items ADD COLUMN id uuid DEFAULT gen_random_uuid();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cart_items' AND column_name = 'buyer_id'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cart_items' AND column_name = 'user_id'
    ) THEN
      ALTER TABLE public.cart_items RENAME COLUMN user_id TO buyer_id;
    ELSE
      ALTER TABLE public.cart_items ADD COLUMN buyer_id uuid;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cart_items' AND column_name = 'product_id'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cart_items' AND column_name = 'item_id'
    ) THEN
      ALTER TABLE public.cart_items RENAME COLUMN item_id TO product_id;
    ELSE
      ALTER TABLE public.cart_items ADD COLUMN product_id uuid;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cart_items' AND column_name = 'quantity'
  ) THEN
    ALTER TABLE public.cart_items ADD COLUMN quantity numeric(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cart_items' AND column_name = 'unit'
  ) THEN
    ALTER TABLE public.cart_items ADD COLUMN unit text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cart_items' AND column_name = 'notes'
  ) THEN
    ALTER TABLE public.cart_items ADD COLUMN notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cart_items' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.cart_items ADD COLUMN created_at timestamptz DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cart_items' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.cart_items ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;

  ALTER TABLE public.cart_items
    ALTER COLUMN id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN quantity SET DEFAULT 1,
    ALTER COLUMN unit SET DEFAULT 'kg',
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN updated_at SET DEFAULT now();
END $$;

UPDATE public.cart_items
SET
  buyer_id = CASE
    WHEN buyer_id IS NULL THEN NULL
    WHEN buyer_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN buyer_id::text::uuid
    ELSE NULL
  END,
  product_id = CASE
    WHEN product_id IS NULL THEN NULL
    WHEN product_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN product_id::text::uuid
    ELSE NULL
  END,
  quantity = CASE WHEN quantity IS NULL OR quantity <= 0 THEN 1 ELSE quantity END,
  unit = CASE WHEN unit IS NULL OR btrim(unit) = '' THEN 'kg' ELSE unit END,
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, created_at, now())
WHERE true;

DELETE FROM public.cart_items
WHERE buyer_id IS NULL OR product_id IS NULL;

DELETE FROM public.cart_items c
USING (
  SELECT ctid
  FROM (
    SELECT
      ctid,
      row_number() OVER (
        PARTITION BY buyer_id, product_id
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC NULLS LAST
      ) AS rn
    FROM public.cart_items
  ) ranked
  WHERE ranked.rn > 1
) duplicates
WHERE c.ctid = duplicates.ctid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cart_items' AND column_name = 'id' AND udt_name <> 'uuid'
  ) THEN
    ALTER TABLE public.cart_items
      ALTER COLUMN id TYPE uuid
      USING (
        CASE
          WHEN id IS NULL THEN gen_random_uuid()
          WHEN id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN id::text::uuid
          ELSE gen_random_uuid()
        END
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cart_items' AND column_name = 'buyer_id' AND udt_name <> 'uuid'
  ) THEN
    ALTER TABLE public.cart_items
      ALTER COLUMN buyer_id TYPE uuid
      USING (
        CASE
          WHEN buyer_id IS NULL THEN NULL
          WHEN buyer_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN buyer_id::text::uuid
          ELSE NULL
        END
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cart_items' AND column_name = 'product_id' AND udt_name <> 'uuid'
  ) THEN
    ALTER TABLE public.cart_items
      ALTER COLUMN product_id TYPE uuid
      USING (
        CASE
          WHEN product_id IS NULL THEN NULL
          WHEN product_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN product_id::text::uuid
          ELSE NULL
        END
      );
  END IF;

  UPDATE public.cart_items SET id = gen_random_uuid() WHERE id IS NULL;
  ALTER TABLE public.cart_items ALTER COLUMN id SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.cart_items'::regclass
      AND contype = 'p'
  ) THEN
    UPDATE public.cart_items SET id = gen_random_uuid() WHERE id IS NULL;
    ALTER TABLE public.cart_items ALTER COLUMN id SET NOT NULL;
    ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cart_items_buyer_id_fkey'
      AND conrelid = 'public.cart_items'::regclass
  ) THEN
    ALTER TABLE public.cart_items
      ADD CONSTRAINT cart_items_buyer_id_fkey
      FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cart_items_product_id_fkey'
      AND conrelid = 'public.cart_items'::regclass
  ) THEN
    ALTER TABLE public.cart_items
      ADD CONSTRAINT cart_items_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;

  ALTER TABLE public.cart_items
    ALTER COLUMN buyer_id SET NOT NULL,
    ALTER COLUMN product_id SET NOT NULL,
    ALTER COLUMN quantity SET NOT NULL,
    ALTER COLUMN unit SET NOT NULL,
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cart_items_quantity_positive_chk'
      AND conrelid = 'public.cart_items'::regclass
  ) THEN
    ALTER TABLE public.cart_items
      ADD CONSTRAINT cart_items_quantity_positive_chk
      CHECK (quantity > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cart_items_buyer_product_unique'
      AND conrelid = 'public.cart_items'::regclass
  ) THEN
    ALTER TABLE public.cart_items
      ADD CONSTRAINT cart_items_buyer_product_unique UNIQUE (buyer_id, product_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cart_items_buyer_created_idx ON public.cart_items (buyer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_role public.app_role NOT NULL CHECK (plan_role IN ('farmer_pro', 'company')),
  amount_kes numeric(12,2) NOT NULL CHECK (amount_kes > 0),
  currency text NOT NULL DEFAULT 'KES',
  payment_method text NOT NULL DEFAULT 'mpesa',
  payment_status text NOT NULL DEFAULT 'initiated'
    CHECK (payment_status IN ('initiated', 'pending_confirmation', 'paid', 'failed', 'cancelled')),
  merchant_request_id text,
  checkout_request_id text,
  payment_ref text,
  payment_error text,
  paid_at timestamptz,
  plan_started_at timestamptz,
  plan_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_checkout_uidx
ON public.subscription_payments (checkout_request_id)
WHERE checkout_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscription_payments_user_created_idx
ON public.subscription_payments (user_id, created_at DESC);

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
    CHECK (status IN ('unverified', 'pending', 'pending_review', 'verified', 'rejected')),
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
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "cart_items_owner_read" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_owner_insert" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_owner_update" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_owner_delete" ON public.cart_items;
CREATE POLICY "cart_items_owner_read" ON public.cart_items FOR SELECT USING (buyer_id = auth.uid());
CREATE POLICY "cart_items_owner_insert" ON public.cart_items FOR INSERT WITH CHECK (buyer_id = auth.uid());
CREATE POLICY "cart_items_owner_update" ON public.cart_items FOR UPDATE USING (buyer_id = auth.uid()) WITH CHECK (buyer_id = auth.uid());
CREATE POLICY "cart_items_owner_delete" ON public.cart_items FOR DELETE USING (buyer_id = auth.uid());

DROP POLICY IF EXISTS "subscription_payments_owner_read" ON public.subscription_payments;
DROP POLICY IF EXISTS "subscription_payments_owner_insert" ON public.subscription_payments;
CREATE POLICY "subscription_payments_owner_read" ON public.subscription_payments FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "subscription_payments_owner_insert" ON public.subscription_payments FOR INSERT WITH CHECK (user_id = auth.uid());

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

DROP TRIGGER IF EXISTS cart_items_updated_at ON public.cart_items;
CREATE TRIGGER cart_items_updated_at
BEFORE UPDATE ON public.cart_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS subscription_payments_updated_at ON public.subscription_payments;
CREATE TRIGGER subscription_payments_updated_at
BEFORE UPDATE ON public.subscription_payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_non_negative_amounts_chk'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_non_negative_amounts_chk
      CHECK (quantity > 0 AND total_price >= 0 AND delivery_fee >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_payment_paid_timestamp_chk'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_paid_timestamp_chk
      CHECK (payment_status <> 'paid' OR paid_at IS NOT NULL);
  END IF;
END $$;

UPDATE public.orders
SET
  buyer_delivery_otp_attempts = COALESCE(buyer_delivery_otp_attempts, 0),
  delivery_signoff_status = CASE
    WHEN payout_status = 'released' THEN 'waived_by_admin'
    WHEN status = 'delivered' THEN 'pending_buyer_confirmation'
    ELSE 'pending_proof'
  END
WHERE
  delivery_signoff_status IS NULL
  OR delivery_signoff_status NOT IN ('pending_proof', 'pending_buyer_confirmation', 'confirmed', 'disputed', 'waived_by_admin')
  OR buyer_delivery_otp_attempts IS NULL
  OR buyer_delivery_otp_attempts < 0;

ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_delivery_signoff_status_chk;

ALTER TABLE public.orders
ADD CONSTRAINT orders_delivery_signoff_status_chk
CHECK (delivery_signoff_status IN ('pending_proof', 'pending_buyer_confirmation', 'confirmed', 'disputed', 'waived_by_admin'));

ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_buyer_delivery_otp_attempts_chk;

ALTER TABLE public.orders
ADD CONSTRAINT orders_buyer_delivery_otp_attempts_chk
CHECK (buyer_delivery_otp_attempts >= 0);

ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_payout_release_requires_delivery_chk;

ALTER TABLE public.orders
ADD CONSTRAINT orders_payout_release_requires_delivery_chk
CHECK (
  payout_status <> 'released'
  OR (
    payment_status = 'paid'
    AND status = 'delivered'
    AND delivery_signoff_status IN ('confirmed', 'waived_by_admin')
    AND dispute_opened_at IS NULL
  )
);

CREATE OR REPLACE FUNCTION public.enforce_order_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Order quantity must be greater than 0';
  END IF;

  IF NEW.total_price < 0 OR NEW.delivery_fee < 0 THEN
    RAISE EXCEPTION 'Order amounts cannot be negative';
  END IF;

  IF NEW.status = 'cancelled' THEN
    NEW.payout_status := 'cancelled';
  ELSIF NEW.payment_status = 'paid' THEN
    IF NEW.status = 'delivered' THEN
      IF COALESCE(NEW.payout_status, '') <> 'released' THEN
        NEW.payout_status := 'awaiting_official_signoff';
      END IF;
    ELSE
      NEW.payout_status := 'awaiting_delivery';
    END IF;
  ELSE
    NEW.payout_status := 'pending_payment';
  END IF;

  IF NEW.status = 'delivered' THEN
    IF COALESCE(NEW.delivery_signoff_status, '') = '' OR NEW.delivery_signoff_status = 'pending_proof' THEN
      NEW.delivery_signoff_status := 'pending_buyer_confirmation';
    END IF;
  ELSE
    IF COALESCE(NEW.delivery_signoff_status, '') = '' THEN
      NEW.delivery_signoff_status := 'pending_proof';
    END IF;
  END IF;

  IF NEW.buyer_delivery_otp_attempts IS NULL OR NEW.buyer_delivery_otp_attempts < 0 THEN
    NEW.buyer_delivery_otp_attempts := 0;
  END IF;

  IF NEW.payment_status = 'paid' THEN
    NEW.paid_at := COALESCE(NEW.paid_at, now());
    NEW.escrow_received_at := COALESCE(NEW.escrow_received_at, NEW.paid_at);
  ELSIF NEW.payout_status = 'released' THEN
    RAISE EXCEPTION 'Released payouts require paid + delivered orders';
  END IF;

  IF NEW.payout_status = 'released' THEN
    IF NEW.payment_status <> 'paid' OR NEW.status <> 'delivered' THEN
      RAISE EXCEPTION 'Released payouts require paid + delivered orders';
    END IF;
    IF COALESCE(NEW.delivery_signoff_status, 'pending_proof') NOT IN ('confirmed', 'waived_by_admin') THEN
      RAISE EXCEPTION 'Released payouts require buyer sign-off or admin waiver';
    END IF;
    IF NEW.dispute_opened_at IS NOT NULL THEN
      RAISE EXCEPTION 'Released payouts are blocked while a dispute is open';
    END IF;
    NEW.payout_released_at := COALESCE(NEW.payout_released_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_consistency_guard ON public.orders;
CREATE TRIGGER orders_consistency_guard
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_consistency();

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

-- Backfill/repair block merged from migration:
-- 20260331190000_add_secured_loan_branch_flow.sql
ALTER TABLE public.micro_loan_offers
  ADD COLUMN IF NOT EXISTS security_type text NOT NULL DEFAULT 'unsecured',
  ADD COLUMN IF NOT EXISTS requires_branch_visit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS branch_name text,
  ADD COLUMN IF NOT EXISTS branch_location text,
  ADD COLUMN IF NOT EXISTS branch_instructions text,
  ADD COLUMN IF NOT EXISTS collateral_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS required_documents jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.micro_loan_offers
  DROP CONSTRAINT IF EXISTS micro_loan_offers_security_type_check;

ALTER TABLE public.micro_loan_offers
  ADD CONSTRAINT micro_loan_offers_security_type_check
  CHECK (security_type IN ('unsecured', 'guarantor', 'collateral'));

ALTER TABLE public.micro_loan_applications
  ADD COLUMN IF NOT EXISTS security_type text NOT NULL DEFAULT 'unsecured',
  ADD COLUMN IF NOT EXISTS requires_branch_visit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS branch_name text,
  ADD COLUMN IF NOT EXISTS branch_location text,
  ADD COLUMN IF NOT EXISTS branch_instructions text,
  ADD COLUMN IF NOT EXISTS branch_visit_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS collateral_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS collateral_items jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.micro_loan_applications
  DROP CONSTRAINT IF EXISTS micro_loan_applications_security_type_check;

ALTER TABLE public.micro_loan_applications
  ADD CONSTRAINT micro_loan_applications_security_type_check
  CHECK (security_type IN ('unsecured', 'guarantor', 'collateral'));

ALTER TABLE public.micro_loan_applications
  DROP CONSTRAINT IF EXISTS micro_loan_applications_branch_visit_status_check;

ALTER TABLE public.micro_loan_applications
  ADD CONSTRAINT micro_loan_applications_branch_visit_status_check
  CHECK (branch_visit_status IN ('not_required', 'pending_customer_visit', 'documents_received', 'valuation_pending', 'verified', 'waived'));

UPDATE public.micro_loan_applications
SET branch_visit_status = CASE
  WHEN COALESCE(requires_branch_visit, false) THEN 'pending_customer_visit'
  ELSE 'not_required'
END
WHERE branch_visit_status NOT IN ('not_required', 'pending_customer_visit', 'documents_received', 'valuation_pending', 'verified', 'waived');

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
-- 20260428223000_external_consistency_microloans_scanner.sql
-- ----------------------------------------------------------------

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

ALTER TABLE public.companies
ALTER COLUMN registration_number DROP NOT NULL;

ALTER TABLE public.companies
ALTER COLUMN tax_id DROP NOT NULL;

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

CREATE INDEX IF NOT EXISTS idx_companies_user_id ON public.companies(user_id);
CREATE INDEX IF NOT EXISTS idx_companies_verification_status ON public.companies(verification_status);
CREATE INDEX IF NOT EXISTS idx_company_products_company_id ON public.company_products(company_id);
CREATE INDEX IF NOT EXISTS idx_company_orders_company_id ON public.company_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_farmer_company_relations_company_id ON public.farmer_company_relations(company_id);
CREATE INDEX IF NOT EXISTS idx_company_contracts_company_id ON public.company_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_company_procurement_requests_company_id ON public.company_procurement_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_company_procurement_responses_request_id ON public.company_procurement_responses(request_id);
CREATE INDEX IF NOT EXISTS idx_company_procurement_responses_company_id ON public.company_procurement_responses(company_id);
CREATE INDEX IF NOT EXISTS idx_company_procurement_responses_farmer_id ON public.company_procurement_responses(farmer_id);
CREATE INDEX IF NOT EXISTS idx_company_procurement_responses_status ON public.company_procurement_responses(status);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmer_company_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_procurement_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_procurement_responses ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "company_products_public_available_read" ON public.company_products;
CREATE POLICY "company_products_public_available_read" ON public.company_products FOR SELECT
USING (is_available = true);

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

DROP POLICY IF EXISTS "farmer_company_relations_owner_all" ON public.farmer_company_relations;
CREATE POLICY "farmer_company_relations_owner_all" ON public.farmer_company_relations FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = farmer_company_relations.company_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
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

DROP POLICY IF EXISTS "company_procurement_open_read" ON public.company_procurement_requests;
CREATE POLICY "company_procurement_open_read" ON public.company_procurement_requests FOR SELECT
USING (status = 'open');

DROP POLICY IF EXISTS "company_procurement_responses_company_read" ON public.company_procurement_responses;
CREATE POLICY "company_procurement_responses_company_read" ON public.company_procurement_responses FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_procurement_responses.company_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "company_procurement_responses_company_update" ON public.company_procurement_responses;
CREATE POLICY "company_procurement_responses_company_update" ON public.company_procurement_responses FOR UPDATE
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
CREATE POLICY "company_procurement_responses_farmer_read" ON public.company_procurement_responses FOR SELECT
USING (farmer_id = auth.uid());

DROP POLICY IF EXISTS "company_procurement_responses_farmer_insert" ON public.company_procurement_responses;
CREATE POLICY "company_procurement_responses_farmer_insert" ON public.company_procurement_responses FOR INSERT
WITH CHECK (farmer_id = auth.uid());

DROP POLICY IF EXISTS "company_procurement_responses_farmer_update" ON public.company_procurement_responses;
CREATE POLICY "company_procurement_responses_farmer_update" ON public.company_procurement_responses FOR UPDATE
USING (farmer_id = auth.uid())
WITH CHECK (farmer_id = auth.uid());

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

DROP TRIGGER IF EXISTS update_company_procurement_responses_updated_at ON public.company_procurement_responses;
CREATE TRIGGER update_company_procurement_responses_updated_at
BEFORE UPDATE ON public.company_procurement_responses
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
