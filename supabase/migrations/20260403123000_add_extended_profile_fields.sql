alter table public.profiles
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
  add column if not exists farm_gps_lng numeric(10,7);
