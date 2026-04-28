-- ============================================================
-- AgriLink X - Legacy Profile Patch
-- NOTE:
-- - This patch is already included in setup_database.sql.
-- - For a fresh project, run setup_database.sql only.
-- - Use this file only to patch older environments.
-- ============================================================

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists county text,
  add column if not exists bio text,
  add column if not exists farm_size text,
  add column if not exists main_crops text[],
  add column if not exists farm_type text
    check (farm_type in ('subsistence', 'commercial', 'mixed', 'livestock', 'horticulture', 'agroforestry')),
  add column if not exists irrigation_type text
    check (irrigation_type in ('rainfed', 'drip', 'sprinkler', 'canal', 'none')),
  add column if not exists soil_type text,
  add column if not exists years_farming integer,
  add column if not exists has_storage boolean default false,
  add column if not exists has_transport boolean default false,
  add column if not exists cooperative_name text,
  add column if not exists farm_gps_lat numeric(10,7),
  add column if not exists farm_gps_lng numeric(10,7),
  add column if not exists photo_url text,
  add column if not exists payout_method text
    check (payout_method in ('mpesa', 'bank')),
  add column if not exists payout_mpesa_number text,
  add column if not exists bank_name text,
  add column if not exists bank_account_name text,
  add column if not exists bank_account_number text,
  add column if not exists payout_details_updated_at timestamptz,
  add column if not exists plan_started_at timestamptz,
  add column if not exists plan_expires_at timestamptz;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "profiles_public_read" on public.profiles;
create policy "profiles_public_read"
  on public.profiles
  for select
  using (true);

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
order by ordinal_position;
