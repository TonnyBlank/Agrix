alter table public.micro_loan_applications
add column if not exists disbursement_method text not null default 'mpesa'
  check (disbursement_method in ('mpesa', 'voucher')),
add column if not exists repayment_method text not null default 'mpesa'
  check (repayment_method in ('mpesa', 'pay_with_produce')),
add column if not exists voucher_code text;
