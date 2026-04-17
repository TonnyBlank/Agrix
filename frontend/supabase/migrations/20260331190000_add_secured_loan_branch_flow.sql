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
