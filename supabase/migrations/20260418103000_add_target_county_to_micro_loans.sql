alter table public.micro_loan_offers
add column if not exists target_county text;

alter table public.micro_loan_applications
add column if not exists target_county text;

update public.micro_loan_offers
set target_county = coalesce(target_county, nullif(trim(branch_location), ''))
where target_county is null;

update public.micro_loan_applications
set target_county = coalesce(target_county, nullif(trim(branch_location), ''))
where target_county is null;

create index if not exists micro_loan_offers_role_county_active_created_idx
on public.micro_loan_offers (applicant_role, target_county, is_active, created_at desc);
