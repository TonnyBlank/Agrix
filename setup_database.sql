-- ================================================================
-- AgriLink X â€“ Supabase Migration 001: Initial Schema
-- Apply in: Supabase Dashboard â†’ SQL Editor (paste & run)
-- Or via CLI: supabase db push
-- ================================================================

-- â”€â”€â”€ Products â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  category      text NOT NULL DEFAULT 'Other',
  price_per_unit numeric(10,2) NOT NULL,
  unit          text NOT NULL DEFAULT 'kg',
  stock         numeric(10,2) NOT NULL DEFAULT 0,
  description   text,
  image_emoji   text DEFAULT 'ðŸ“¦',
  video_url     text,
  is_organic    boolean DEFAULT false,
  is_available  boolean DEFAULT true,
  location      text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- â”€â”€â”€ Profiles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  full_name     text,
  county        text,
  phone         text,
  bio           text,
  farm_size     text,
  main_crops    text[],
  farm_type     text,
  irrigation_type text,
  soil_type     text,
  years_farming integer,
  has_storage   boolean DEFAULT false,
  has_transport boolean DEFAULT false,
  cooperative_name text,
  farm_gps_lat  numeric(10,7),
  farm_gps_lng  numeric(10,7),
  photo_url     text,
  payout_method text,
  payout_mpesa_number text,
  bank_name     text,
  bank_account_name text,
  bank_account_number text,
  payout_details_updated_at timestamptz,
  plan_started_at timestamptz,
  plan_expires_at timestamptz,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- â”€â”€â”€ Orders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  buyer_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  farmer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quantity      numeric(10,2) NOT NULL,
  unit          text NOT NULL,
  total_price   numeric(10,2) NOT NULL,
  delivery_fee  numeric(10,2) DEFAULT 50,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','confirmed','processing','shipped','delivered','cancelled')),
  payment_method text DEFAULT 'mpesa',
  payment_ref   text,
  notes         text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- â”€â”€â”€ Conversations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message  text,
  last_at       timestamptz DEFAULT now(),
  unread_a      int DEFAULT 0,
  unread_b      int DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  CHECK (participant_a <> participant_b),
  UNIQUE (participant_a, participant_b)
);

-- â”€â”€â”€ Messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body            text NOT NULL,
  read            boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

-- â”€â”€â”€ Product Likes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS product_likes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (product_id, user_id)
);

-- â”€â”€â”€ Product Ratings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS product_ratings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating      int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (product_id, user_id)
);

-- â”€â”€â”€ Crop Events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS crop_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  crop        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('planting','fertilizing','spraying','harvesting','irrigation','pruning')),
  event_date  date NOT NULL,
  notes       text,
  done        boolean DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- â”€â”€â”€ ID Verifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS id_verifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  doc_url       text,
  front_doc_url text,
  back_doc_url  text,
  status        text NOT NULL DEFAULT 'unverified'
                CHECK (status IN ('unverified','pending','verified','rejected')),
  reviewer_note text,
  submitted_at  timestamptz,
  reviewed_at   timestamptz,
  created_at    timestamptz DEFAULT now()
);

-- â”€â”€â”€ Storage Buckets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO storage.buckets (id, name, public)
  VALUES ('product-media', 'product-media', true)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('id-documents', 'id-documents', false)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('profile-photos', 'profile-photos', true)
  ON CONFLICT (id) DO NOTHING;

-- â”€â”€â”€ Row Level Security (RLS) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_likes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE crop_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE id_verifications ENABLE ROW LEVEL SECURITY;

-- Products
DROP POLICY IF EXISTS "products_public_read" ON products;
DROP POLICY IF EXISTS "products_owner_insert" ON products;
DROP POLICY IF EXISTS "products_owner_update" ON products;
DROP POLICY IF EXISTS "products_owner_delete" ON products;
CREATE POLICY "products_public_read"  ON products FOR SELECT USING (true);
CREATE POLICY "products_owner_insert" ON products FOR INSERT WITH CHECK (farmer_id = auth.uid());
CREATE POLICY "products_owner_update" ON products FOR UPDATE USING (farmer_id = auth.uid());
CREATE POLICY "products_owner_delete" ON products FOR DELETE USING (farmer_id = auth.uid());

-- Profiles
DROP POLICY IF EXISTS "profiles_public_read" ON profiles;
DROP POLICY IF EXISTS "profiles_owner_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_owner_update" ON profiles;
CREATE POLICY "profiles_public_read"  ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_owner_insert" ON profiles FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "profiles_owner_update" ON profiles FOR UPDATE USING (user_id = auth.uid());

-- Orders
DROP POLICY IF EXISTS "orders_parties_read" ON orders;
DROP POLICY IF EXISTS "orders_buyer_insert" ON orders;
DROP POLICY IF EXISTS "orders_parties_update" ON orders;
CREATE POLICY "orders_parties_read"    ON orders FOR SELECT  USING (buyer_id = auth.uid() OR farmer_id = auth.uid());
CREATE POLICY "orders_buyer_insert"    ON orders FOR INSERT  WITH CHECK (buyer_id = auth.uid());
CREATE POLICY "orders_parties_update"  ON orders FOR UPDATE  USING (buyer_id = auth.uid() OR farmer_id = auth.uid());

-- Conversations
DROP POLICY IF EXISTS "conv_participants" ON conversations;
CREATE POLICY "conv_participants"  ON conversations FOR ALL
  USING (participant_a = auth.uid() OR participant_b = auth.uid())
  WITH CHECK (
    (participant_a = auth.uid() OR participant_b = auth.uid())
    AND participant_a <> participant_b
    AND participant_a < participant_b
  );

-- Messages
DROP POLICY IF EXISTS "msg_participants_read" ON messages;
DROP POLICY IF EXISTS "msg_sender_insert" ON messages;
CREATE POLICY "msg_participants_read" ON messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())));
CREATE POLICY "msg_sender_insert"     ON messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM conversations c
    WHERE c.id = conversation_id
      AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())
  )
);

-- Product likes
DROP POLICY IF EXISTS "product_likes_public_read" ON product_likes;
DROP POLICY IF EXISTS "product_likes_owner_insert" ON product_likes;
DROP POLICY IF EXISTS "product_likes_owner_delete" ON product_likes;
CREATE POLICY "product_likes_public_read" ON product_likes FOR SELECT USING (true);
CREATE POLICY "product_likes_owner_insert" ON product_likes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "product_likes_owner_delete" ON product_likes FOR DELETE USING (user_id = auth.uid());

-- Product ratings
DROP POLICY IF EXISTS "product_ratings_public_read" ON product_ratings;
DROP POLICY IF EXISTS "product_ratings_owner_insert" ON product_ratings;
DROP POLICY IF EXISTS "product_ratings_owner_update" ON product_ratings;
CREATE POLICY "product_ratings_public_read" ON product_ratings FOR SELECT USING (true);
CREATE POLICY "product_ratings_owner_insert" ON product_ratings FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "product_ratings_owner_update" ON product_ratings FOR UPDATE USING (user_id = auth.uid());

-- Crop events
DROP POLICY IF EXISTS "crop_events_owner" ON crop_events;
CREATE POLICY "crop_events_owner" ON crop_events FOR ALL USING (farmer_id = auth.uid());

-- ID verifications
DROP POLICY IF EXISTS "id_ver_owner" ON id_verifications;
CREATE POLICY "id_ver_owner" ON id_verifications FOR ALL USING (user_id = auth.uid());

-- Storage
DROP POLICY IF EXISTS "product_media_public_read" ON storage.objects;
DROP POLICY IF EXISTS "product_media_auth_upload" ON storage.objects;
DROP POLICY IF EXISTS "id_docs_owner_upload" ON storage.objects;
DROP POLICY IF EXISTS "id_docs_owner_read" ON storage.objects;
DROP POLICY IF EXISTS "profile_photos_public_read" ON storage.objects;
DROP POLICY IF EXISTS "profile_photos_owner_upload" ON storage.objects;
CREATE POLICY "product_media_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'product-media');
CREATE POLICY "product_media_auth_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-media' AND auth.role() = 'authenticated');
CREATE POLICY "id_docs_owner_upload"      ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'id-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "id_docs_owner_read"        ON storage.objects FOR SELECT USING (bucket_id = 'id-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "profile_photos_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'profile-photos');
CREATE POLICY "profile_photos_owner_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- â”€â”€â”€ Realtime â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;
END $$;

-- â”€â”€â”€ Auto-update timestamps â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at    BEFORE UPDATE ON products    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at    BEFORE UPDATE ON profiles    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at      BEFORE UPDATE ON orders      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS crop_events_updated_at ON crop_events;
CREATE TRIGGER crop_events_updated_at BEFORE UPDATE ON crop_events FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS product_ratings_updated_at ON product_ratings;
CREATE TRIGGER product_ratings_updated_at BEFORE UPDATE ON product_ratings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Backfill for deployments that were created before cover_image_url was added
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS cover_image_url text;
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS cover_image_url text;
create table if not exists public.micro_loan_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  applicant_role text not null check (applicant_role in ('farmer_pro', 'buyer_enterprise')),
  product_type text not null check (product_type in ('seasonal_working_capital', 'equipment_top_up', 'buyer_contract_financing')),
  product_title text not null,
  requested_amount numeric(12,2) not null check (requested_amount > 0),
  approved_amount numeric(12,2),
  speed text,
  status text not null default 'approved' check (status in ('pending_review', 'approved', 'rejected', 'disbursed')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists micro_loan_applications_user_created_idx
  on public.micro_loan_applications (user_id, created_at desc);

alter table public.micro_loan_applications enable row level security;

drop policy if exists "micro_loan_owner_read" on public.micro_loan_applications;
drop policy if exists "micro_loan_owner_insert" on public.micro_loan_applications;
drop policy if exists "micro_loan_owner_update" on public.micro_loan_applications;

create policy "micro_loan_owner_read"
on public.micro_loan_applications
for select
using (user_id = auth.uid());

create policy "micro_loan_owner_insert"
on public.micro_loan_applications
for insert
with check (user_id = auth.uid());

create policy "micro_loan_owner_update"
on public.micro_loan_applications
for update
using (user_id = auth.uid());
alter table public.micro_loan_applications
  add column if not exists interest_rate numeric(5,2),
  add column if not exists repayment_days integer;
alter table public.micro_loan_applications
  add column if not exists disbursed_at timestamptz,
  add column if not exists repaid_at timestamptz;

alter table public.micro_loan_applications
  drop constraint if exists micro_loan_applications_status_check;

alter table public.micro_loan_applications
  add constraint micro_loan_applications_status_check
  check (status in ('pending_review', 'approved', 'rejected', 'disbursed', 'repaid'));

update public.micro_loan_applications
set disbursed_at = coalesce(disbursed_at, reviewed_at, created_at)
where status in ('approved', 'disbursed', 'repaid');

create table if not exists public.micro_loan_repayments (
  id uuid primary key default gen_random_uuid(),
  loan_application_id uuid not null references public.micro_loan_applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null default 'mpesa',
  payment_ref text,
  phone_number text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists micro_loan_repayments_loan_created_idx
  on public.micro_loan_repayments (loan_application_id, created_at asc);

create index if not exists micro_loan_repayments_user_created_idx
  on public.micro_loan_repayments (user_id, created_at desc);

alter table public.micro_loan_repayments enable row level security;

drop policy if exists "micro_loan_repayment_owner_read" on public.micro_loan_repayments;
drop policy if exists "micro_loan_repayment_owner_insert" on public.micro_loan_repayments;

create policy "micro_loan_repayment_owner_read"
on public.micro_loan_repayments
for select
using (user_id = auth.uid());

create policy "micro_loan_repayment_owner_insert"
on public.micro_loan_repayments
for insert
with check (user_id = auth.uid());
create table if not exists public.micro_loan_offers (
  id uuid primary key default gen_random_uuid(),
  applicant_role text not null check (applicant_role in ('farmer_pro', 'buyer_enterprise')),
  product_type text not null check (product_type in ('seasonal_working_capital', 'equipment_top_up', 'buyer_contract_financing')),
  product_title text not null,
  max_amount numeric(12,2) not null check (max_amount > 0),
  interest_rate numeric(5,2),
  repayment_days integer,
  speed text,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists micro_loan_offers_role_active_created_idx
  on public.micro_loan_offers (applicant_role, is_active, created_at desc);

alter table public.micro_loan_offers enable row level security;

drop policy if exists "micro_loan_offers_authenticated_read" on public.micro_loan_offers;

create policy "micro_loan_offers_authenticated_read"
on public.micro_loan_offers
for select
using (auth.role() = 'authenticated');

alter table public.micro_loan_offers
  add column if not exists security_type text not null default 'unsecured',
  add column if not exists requires_branch_visit boolean not null default false,
  add column if not exists branch_name text,
  add column if not exists branch_location text,
  add column if not exists branch_instructions text,
  add column if not exists collateral_types jsonb not null default '[]'::jsonb,
  add column if not exists required_documents jsonb not null default '[]'::jsonb;

alter table public.micro_loan_offers
  drop constraint if exists micro_loan_offers_security_type_check;

alter table public.micro_loan_offers
  add constraint micro_loan_offers_security_type_check
  check (security_type in ('unsecured', 'guarantor', 'collateral'));
-- Add guarantors column to micro_loan_applications
-- This column will store a JSONB array of guarantor details (name, phone, relationship, etc.)

ALTER TABLE public.micro_loan_applications
ADD COLUMN IF NOT EXISTS guarantors jsonb DEFAULT '[]'::jsonb;

alter table public.micro_loan_applications
  add column if not exists security_type text not null default 'unsecured',
  add column if not exists requires_branch_visit boolean not null default false,
  add column if not exists branch_name text,
  add column if not exists branch_location text,
  add column if not exists branch_instructions text,
  add column if not exists branch_visit_status text not null default 'not_required',
  add column if not exists collateral_types jsonb not null default '[]'::jsonb,
  add column if not exists required_documents jsonb not null default '[]'::jsonb,
  add column if not exists collateral_items jsonb not null default '[]'::jsonb;

alter table public.micro_loan_applications
  drop constraint if exists micro_loan_applications_security_type_check;

alter table public.micro_loan_applications
  add constraint micro_loan_applications_security_type_check
  check (security_type in ('unsecured', 'guarantor', 'collateral'));

alter table public.micro_loan_applications
  drop constraint if exists micro_loan_applications_branch_visit_status_check;

alter table public.micro_loan_applications
  add constraint micro_loan_applications_branch_visit_status_check
  check (branch_visit_status in ('not_required', 'pending_customer_visit', 'documents_received', 'valuation_pending', 'verified', 'waived'));

update public.micro_loan_applications
set branch_visit_status = case
  when coalesce(requires_branch_visit, false) then 'pending_customer_visit'
  else 'not_required'
end
where branch_visit_status not in ('not_required', 'pending_customer_visit', 'documents_received', 'valuation_pending', 'verified', 'waived');
-- Add guarantors column to profiles
-- This column will store a JSONB array of default guarantor details for the user
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS guarantors jsonb DEFAULT '[]'::jsonb;
-- 012_add_guest_user.sql
-- Adds a default guest profile for the demo/bypass login mode.

INSERT INTO public.profiles (
  user_id, 
  full_name, 
  county, 
  farm_size, 
  main_crops, 
  bio, 
  phone,
  created_at, 
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Guest Farmer',
  'Nairobi',
  '5 Acres',
  ARRAY['Maize', 'Beans', 'Coffee'],
  'Demo account for exploring the AgriLink X platform. This profile is automatically used when logging in via demo mode.',
  '+254700000000',
  NOW(),
  NOW()
)
ON CONFLICT (user_id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  updated_at = NOW();
create or replace function public.place_marketplace_order(
  p_product_id uuid,
  p_quantity numeric,
  p_unit text default null,
  p_delivery_fee numeric default 50,
  p_notes text default null
)
returns setof public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid := auth.uid();
  v_product public.products%rowtype;
  v_order public.orders%rowtype;
  v_unit text;
begin
  if v_buyer_id is null then
    raise exception 'You must be signed in to place an order';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than 0';
  end if;

  if p_delivery_fee is null or p_delivery_fee < 0 then
    raise exception 'Delivery fee must be 0 or more';
  end if;

  select *
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  if v_product.farmer_id = v_buyer_id then
    raise exception 'You cannot place an order for your own product';
  end if;

  if coalesce(v_product.is_available, false) = false then
    raise exception 'This product is not currently available';
  end if;

  if v_product.stock < p_quantity then
    raise exception 'Only % % available for this product', v_product.stock, v_product.unit;
  end if;

  v_unit := coalesce(nullif(trim(p_unit), ''), v_product.unit);

  insert into public.orders (
    product_id,
    buyer_id,
    farmer_id,
    quantity,
    unit,
    total_price,
    delivery_fee,
    status,
    payment_method,
    notes
  )
  values (
    v_product.id,
    v_buyer_id,
    v_product.farmer_id,
    p_quantity,
    v_unit,
    v_product.price_per_unit * p_quantity,
    p_delivery_fee,
    'pending',
    'mpesa',
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning *
  into v_order;

  update public.products
  set
    stock = stock - p_quantity,
    is_available = (stock - p_quantity) > 0,
    updated_at = now()
  where id = v_product.id;

  return next v_order;
end;
$$;

grant execute on function public.place_marketplace_order(uuid, numeric, text, numeric, text) to authenticated;
alter table public.orders
add column if not exists payment_status text not null default 'unpaid'
  check (payment_status in ('unpaid', 'initiated', 'pending_confirmation', 'paid', 'failed'));

alter table public.orders
add column if not exists merchant_request_id text;

alter table public.orders
add column if not exists checkout_request_id text;

alter table public.orders
add column if not exists payment_error text;

alter table public.orders
add column if not exists paid_at timestamptz;

create index if not exists orders_checkout_request_id_idx on public.orders(checkout_request_id);
alter table public.profiles
add column if not exists payout_method text
  check (payout_method in ('mpesa', 'bank'));

alter table public.profiles
add column if not exists farm_type text
  check (farm_type in ('subsistence', 'commercial', 'mixed', 'livestock', 'horticulture', 'agroforestry'));

alter table public.profiles
add column if not exists irrigation_type text
  check (irrigation_type in ('rainfed', 'drip', 'sprinkler', 'canal', 'none'));

alter table public.profiles
add column if not exists soil_type text;

alter table public.profiles
add column if not exists years_farming integer;

alter table public.profiles
add column if not exists has_storage boolean default false;

alter table public.profiles
add column if not exists has_transport boolean default false;

alter table public.profiles
add column if not exists cooperative_name text;

alter table public.profiles
add column if not exists farm_gps_lat numeric(10,7);

alter table public.profiles
add column if not exists farm_gps_lng numeric(10,7);

alter table public.profiles
add column if not exists payout_mpesa_number text;

alter table public.profiles
add column if not exists bank_name text;

alter table public.profiles
add column if not exists bank_account_name text;

alter table public.profiles
add column if not exists bank_account_number text;

alter table public.profiles
add column if not exists payout_details_updated_at timestamptz;

alter table public.profiles
add column if not exists plan_started_at timestamptz;

alter table public.profiles
add column if not exists plan_expires_at timestamptz;

alter table public.micro_loan_applications
add column if not exists disbursement_method text not null default 'mpesa' check (disbursement_method in ('mpesa', 'voucher')),
add column if not exists repayment_method text not null default 'mpesa' check (repayment_method in ('mpesa', 'pay_with_produce')),
add column if not exists voucher_code text;

