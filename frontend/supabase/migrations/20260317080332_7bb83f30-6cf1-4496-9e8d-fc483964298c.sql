
-- Create role enum
DO $$
BEGIN
  -- Repair the legacy enum if it still contains buyer_enterprise
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role' AND typtype = 'e') THEN
    -- Rename buyer_enterprise to company if exists
    BEGIN
      ALTER TYPE public.app_role RENAME VALUE 'buyer_enterprise' TO 'company';
    EXCEPTION WHEN OTHERS THEN
      -- If rename fails, drop and recreate
      DROP TYPE public.app_role CASCADE;
      CREATE TYPE public.app_role AS ENUM ('farmer_free', 'farmer_pro', 'company');
    END;
  ELSE
    CREATE TYPE public.app_role AS ENUM ('farmer_free', 'farmer_pro', 'company');
  END IF;
END $$;

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  phone TEXT,
  county TEXT,
  bio TEXT,
  farm_size TEXT,
  main_crops TEXT[],
  farm_type TEXT,
  irrigation_type TEXT,
  soil_type TEXT,
  years_farming INTEGER,
  has_storage BOOLEAN DEFAULT false,
  has_transport BOOLEAN DEFAULT false,
  cooperative_name TEXT,
  farm_gps_lat NUMERIC(10,7),
  farm_gps_lng NUMERIC(10,7),
  photo_url TEXT,
  payout_method TEXT,
  payout_mpesa_number TEXT,
  bank_name TEXT,
  bank_account_name TEXT,
  bank_account_number TEXT,
  payout_details_updated_at TIMESTAMPTZ,
  plan_started_at TIMESTAMPTZ,
  plan_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to get user's current role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Auto-create profile and assign farmer_free role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'farmer_free');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Feature flags table (admin-managed)
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL UNIQUE,
  enabled_for app_role[] NOT NULL DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read feature flags" ON public.feature_flags;
CREATE POLICY "Anyone authenticated can read feature flags" ON public.feature_flags FOR SELECT TO authenticated USING (true);

-- Seed feature flags
INSERT INTO public.feature_flags (feature_key, enabled_for, description) VALUES
  ('ai_price_guidance', '{farmer_free,farmer_pro,company}', 'Basic AI price guidance'),
  ('ai_crop_advisor', '{farmer_pro,company}', 'Advanced AI crop & profit advisor'),
  ('unlimited_listings', '{farmer_pro,company}', 'Unlimited product listings'),
  ('voice_interface', '{farmer_pro,company}', 'Voice-assisted interface'),
  ('micro_loans', '{farmer_pro}', 'Micro-loan access'),
  ('smart_logistics', '{farmer_pro,company}', 'Automated delivery matching'),
  ('contract_farming', '{company}', 'Contract farming module'),
  ('bulk_orders', '{company}', 'Bulk order management'),
  ('predictive_analytics', '{company}', 'AI supply & demand forecasting'),
  ('escrow_payments', '{farmer_free,farmer_pro,company}', 'M-Pesa escrow system'),
  ('community_access', '{farmer_free,farmer_pro,company}', 'Community tips & alerts'),
  ('sales_analytics', '{farmer_pro,company}', 'Real-time sales analytics'),
  ('priority_search', '{farmer_pro}', 'Priority in buyer search results'),
  ('export_reports', '{company}', 'Export reports & projections')
ON CONFLICT (feature_key) DO UPDATE SET
  enabled_for = EXCLUDED.enabled_for,
  description = EXCLUDED.description;
