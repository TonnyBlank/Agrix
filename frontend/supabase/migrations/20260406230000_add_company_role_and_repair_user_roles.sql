ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'company';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';

DO $$
DECLARE
  current_udt text;
BEGIN
  SELECT c.udt_name
  INTO current_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'user_roles'
    AND c.column_name = 'role';

  IF current_udt IS NULL THEN
    RAISE NOTICE 'public.user_roles.role was not found. Skipping role column repair.';
    RETURN;
  END IF;

  IF current_udt <> 'app_role' THEN
    EXECUTE 'ALTER TABLE public.user_roles ALTER COLUMN role TYPE public.app_role USING role::public.app_role';
  END IF;
END $$;

ALTER TABLE public.user_roles
DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE public.user_roles
ADD CONSTRAINT user_roles_role_check
CHECK (role::text IN ('farmer_free', 'farmer_pro', 'company', 'admin'));

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
  ORDER BY
    CASE ur.role::text
      WHEN 'admin' THEN 1
      WHEN 'company' THEN 2
      WHEN 'farmer_pro' THEN 3
      WHEN 'farmer_free' THEN 4
      ELSE 99
    END
  LIMIT 1
$$;

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

CREATE INDEX IF NOT EXISTS idx_companies_user_id ON public.companies(user_id);
CREATE INDEX IF NOT EXISTS idx_companies_verification_status ON public.companies(verification_status);
CREATE INDEX IF NOT EXISTS idx_company_products_company_id ON public.company_products(company_id);
CREATE INDEX IF NOT EXISTS idx_company_orders_company_id ON public.company_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_farmer_company_relations_company_id ON public.farmer_company_relations(company_id);
CREATE INDEX IF NOT EXISTS idx_company_contracts_company_id ON public.company_contracts(company_id);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmer_company_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_owner_select" ON public.companies;
DROP POLICY IF EXISTS "companies_owner_insert" ON public.companies;
DROP POLICY IF EXISTS "companies_owner_update" ON public.companies;
DROP POLICY IF EXISTS "companies_public_verified_read" ON public.companies;

CREATE POLICY "companies_owner_select"
ON public.companies
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "companies_owner_insert"
ON public.companies
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "companies_owner_update"
ON public.companies
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "companies_public_verified_read"
ON public.companies
FOR SELECT
USING (verified = true);

DROP POLICY IF EXISTS "company_products_owner_all" ON public.company_products;
CREATE POLICY "company_products_owner_all"
ON public.company_products
FOR ALL
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
CREATE POLICY "company_orders_owner_read"
ON public.company_orders
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_orders.company_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "farmer_company_relations_owner_read" ON public.farmer_company_relations;
CREATE POLICY "farmer_company_relations_owner_read"
ON public.farmer_company_relations
FOR SELECT
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
CREATE POLICY "company_contracts_owner_read"
ON public.company_contracts
FOR SELECT
USING (
  farmer_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_contracts.company_id
      AND c.user_id = auth.uid()
  )
);

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
