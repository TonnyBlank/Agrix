alter table public.profiles
add column if not exists plan_started_at timestamptz;

alter table public.profiles
add column if not exists plan_expires_at timestamptz;
