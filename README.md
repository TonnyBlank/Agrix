# AgriLink X

AgriLink X is a full-stack agricultural operating system for Kenya and African food systems. It brings farmer services, mixed-enterprise farm records, marketplace trade, B2B procurement, logistics visibility, M-Pesa payments, micro-finance, insurance readiness, green credit signals, and AI-assisted agricultural intelligence into one connected platform.

The platform is intentionally broader than a crop marketplace. It supports crops, poultry, eggs, livestock, dairy, fish, honey, inputs, farm services, buyers, retailers, wholesalers, exporters, agribusinesses, transport workflows, and platform administrators.

## Current Stack

- `frontend/` - React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, Radix UI, Framer Motion, React Router, Supabase JS
- `backend/` - Django 5 API layer, Supabase-backed business logic, M-Pesa payment handling, management commands
- `supabase/` - Supabase project config and SQL migrations
- `setup_database.sql` - consolidated Supabase bootstrap script for schema, policies, functions, and seed-safe setup

## Why AgriLink X Stands Out In Kenya

Kenya already has strong agriculture technology platforms. AgriLink X is designed to compete by combining their strongest ideas into one operating system instead of solving only one part of the value chain.

This is a product-positioning comparison, not an audited market-share claim.

| Platform | Publicly visible focus | Where AgriLink X is designed to go further |
| --- | --- | --- |
| DigiFarm by Safaricom | Farmer registration, loans, insurance, weather/practice information, market linkages, USSD/app access | AgriLink X combines farmer services with a richer role-based dashboard, marketplace ordering, carts, escrow-style payment records, company procurement, logistics queues, admin controls, AI advisory, GMCIS mapping, and mixed-enterprise coverage. |
| Apollo Agriculture | Input financing, training, insurance, agrodealer pickup, machine-learning credit decisions | AgriLink X includes financing signals but also covers buyer discovery, direct sales, company sourcing, product listings, logistics tracking, order/payment lifecycle, and platform administration. |
| Twiga Foods | B2B food distribution, farmer/vendor supply-chain efficiency, logistics and cold-chain distribution | AgriLink X is not only a distributor. It is an open software platform for farmers, buyers, companies, and admins, with procurement workflows, marketplace trade, finance readiness, AI intelligence, and farmer-owned product visibility. |
| Mkulima Bora | Digital agriculture marketplace, buyer requests, prices, experts, weather, resources, community | AgriLink X adds deeper transaction infrastructure: stock-safe ordering, persisted carts, M-Pesa payment status handling, refund/cancellation logic, micro-loans, company procurement, admin verification, and AI/GMCIS advisory. |
| Mkulima Young | Online farmer marketplace and advisory/community model | AgriLink X adds formal order lifecycle management, company demand workflows, finance modules, Services Hub intelligence, role-aware dashboards, and admin governance. |
| DigiCow | Dairy record keeping, training, expert consultation, alerts, dairy-focused credit support | AgriLink X covers dairy but also supports crops, poultry, eggs, livestock, fish, honey, inputs, marketplace sales, company sourcing, payments, and broader farm/business intelligence. |

AgriLink X's strongest position is product breadth: it connects the farmer's operation, buyer demand, logistics movement, payment trust, financing readiness, and advisory intelligence in one system.

## Core Product Vision

AgriLink X is built around one practical idea: Kenyan agriculture does not fail because farmers lack effort. It fails when market access, logistics, finance, advisory, pricing, trust, and data live in separate places.

The platform joins those pieces:

- Farmer Services: advisory tools, market access, weather, farm management, fair pricing, and buyer discovery
- Marketplace & Trade: direct buyer channels, agricultural e-commerce, wholesale, B2B, retail, and residential distribution
- Logistics & Supply Chain: transport coordination, storage, cold-chain support, delivery tracking, and dispatch visibility
- Financial Services: microloans, agricultural financing, insurance readiness, repayment records, and green credit signals
- Agricultural Intelligence: GMCIS mapping, climate signals, market data, AI recommendations, and expert/research content

## Main User Roles

### Farmer Free

Entry farmer plan for core market access and basic operations:

- farm profile
- mixed-enterprise details
- product listings
- marketplace access
- orders
- messages
- AI and upgrade prompts
- Services Hub overview

### Farmer Pro

Advanced farmer plan for stronger commercial use:

- everything in Farmer Free
- financing and loan-readiness flows
- deeper AI/advisory features
- stronger buyer opportunity tooling
- improved deal matching and analytics

### Company

Agribusiness, buyer, processor, exporter, distributor, input supplier, or service provider workspace:

- company onboarding
- company profile
- product catalog
- procurement requests
- farmer partner management
- procurement response review
- company order tracking
- Services Hub for trade, logistics, finance, and intelligence

### Admin

Platform governance workspace:

- users and roles
- company verification
- ID verification
- order review
- payout/transaction oversight
- loan offer publishing
- loan decision workflows
- audit logs
- feature flags

## Services Hub

The Services Hub is the command center for the platform. It is intentionally organized as an operating dashboard, not a brochure.

It includes:

- executive summary
- key metrics
- AI priority signals
- service modules for enterprises, marketplace, movement, finance, and intelligence
- commodity coverage across crops, poultry, eggs, livestock, dairy, fish, honey, inputs, and services
- GMCIS snapshot
- live market supply
- movement queue

The AI advisor currently generates practical signals from real platform data:

- active listings
- enterprise mix
- weather and climate status
- GPS/profile readiness
- active orders
- logistics queue
- storage/transport flags
- financing readiness

Example advisory outputs include:

- refresh prices on active listings
- add supply so buyers can discover the farmer
- prepare crates, cold-chain, or transport for perishables
- check water, shade, feed, or egg pickup timing
- map the farm before relying on climate intelligence
- strengthen finance readiness through profile, storage, transport, and trade history

## Farmer And Producer Capabilities

AgriLink X supports mixed agriculture, not only crops.

Farmer profile and operation records can cover:

- crops and horticulture
- poultry and eggs
- livestock and dairy
- fish, honey, and specialty goods
- farm inputs
- transport, storage, and farm services

Current farmer modules include:

- `My Farm` - county, sub-county, GPS coordinates, farm size, enterprise mix, soil, irrigation, storage, transport, cooperative, and profile story
- `My Products` - listings, pricing, stock, images, videos, availability
- `Marketplace` - product discovery and ordering
- `Cart` - persisted buyer cart with database constraints
- `Orders` - buying and selling order tracking
- `Messages` - user-to-user trade conversations
- `Crop Calendar` - farming events and reminders
- `AI Scanner` - Gemini-supported scanner with fallback diagnostics
- `Services Hub` - farmer services, trade, logistics, finance, and AI intelligence
- `Micro-Loans` - loan readiness, applications, repayment, and review workflows
- `Deal Matches` - buyer opportunity matching and draft offer support

## Marketplace, Orders, And Payments

The marketplace is built for real transaction integrity, not only product visibility.

Simple buyer promise:

```text
Shop normally. Pay safely. Seller is paid only after delivery is confirmed.
```

Behind the scenes, AgriLink X handles:

- cart persistence
- stock-safe checkout
- M-Pesa payment confirmation
- escrow tracking
- seller payout calculation
- delivery confirmation
- dispute and refund handling
- stock restoration when payment fails or an unpaid order is cancelled

Important consistency features:

- `cart_items.quantity > 0` database check
- `UNIQUE(buyer_id, product_id)` database check
- `products.stock >= 0` database check
- stock decrement via PostgreSQL function with row locking
- stock restoration on failed payment, timeout, or eligible cancellation
- subscription payment ledger for paid plans
- refund request flow for paid/cancelled orders

## How Marketplace Buying Works

The buyer flow is intentionally simple, like familiar marketplace apps:

```text
Browse -> Add to Cart -> Checkout -> Pay with M-Pesa -> Collect and Confirm
```

### User-Facing Flow

1. Buyer browses products in Marketplace.
2. Buyer adds items to Cart or taps Buy Now.
3. Cart shows selected items, delivery estimate, and total payable.
4. Buyer checks out and pays with M-Pesa.
5. Buyer tracks the order and collects through the AgriLink county-office flow.
6. Buyer confirms receipt.

The user should not feel many internal steps. The technical checks happen quietly in the background.

### The Trust Rule

Money is not released directly to the seller.

When the buyer pays:

- payment goes into AgriLink escrow
- the seller sees that the order is paid
- the seller prepares and delivers the order
- the buyer confirms receipt
- admin/official sign-off releases seller payout

This makes the app simple for the buyer while still protecting the buyer, seller, and platform.

### Behind The Scenes

AgriLink X still keeps marketplace safety strong:

- cart quantities are validated
- duplicate cart rows are prevented
- stock is decremented atomically when an order is placed
- failed or timed-out payments restore stock
- M-Pesa callback/status checks confirm payment
- escrow, commission, and seller payout are recorded
- delivery confirmation controls payout release
- disputes block seller payout until resolved
- refund requests can be reviewed by admin

The goal is a familiar commerce experience on the front end with agricultural trust, escrow, and logistics controls in the background.

## Company And B2B Workflows

Companies can operate as buyers, processors, exporters, distributors, suppliers, or agricultural service providers.

Company modules include:

- onboarding and profile settings
- company product catalog
- supplier/farmer partnerships
- procurement request publishing
- farmer response review
- accept/reject procurement offers
- conversion of accepted procurement responses into marketplace orders
- company order tracking
- company Services Hub
- admin verification

Procurement requests include:

- title
- category
- target county
- quantity needed
- unit
- budget range
- needed-by date
- notes
- status

Procurement response statuses are enforced across backend, frontend, and SQL:

- `submitted`
- `accepted`
- `rejected`
- `withdrawn`

## Finance, Insurance, And Green Credit

AgriLink X treats finance as an outcome of verified operating data.

The financing module includes:

- live readiness checks
- micro-loan offers
- borrower applications
- collateral and guarantor support
- branch visit acknowledgement
- repayment schedules
- repayment logging
- admin loan decision workflow
- county-targeted offers
- financing signals based on profile completeness, trade history, location, storage, transport, and repayment state

Finance readiness can use:

- verified identity
- payout setup
- complete contact and farm profile
- paid or qualified order history
- revenue thresholds
- mapped location
- delivery reliability

## How Microfinance Works

Microfinance in AgriLink X is designed as a data-backed financing workflow. The platform does not simply let a user type an amount and borrow. It first checks whether the borrower has enough verified platform activity to support a loan decision.

### 1. Who Can Borrow

Borrowing is currently available to:

- `farmer_pro`
- `company`

Farmer Free users can see upgrade prompts, but they must upgrade before borrowing.

### 2. Readiness Checks

The system checks the borrower's live data before allowing an application.

Required checks:

- identity verification status is `verified`
- payout details are completed
- full name, phone, and county are saved on the profile
- at least 2 qualified orders in the last 90 days
- at least KES 10,000 qualified revenue in the last 90 days

Qualified orders are recent orders where either:

- `payment_status = paid`
- or order status is `confirmed`, `processing`, `shipped`, or `delivered`

For farmers, the system uses selling orders. For companies, it uses buying/procurement-side orders.

### 3. Eligibility Amount

The eligible amount is based on average monthly revenue from the last 90 days.

Current formula:

```text
revenue_90 = total qualified order value in the last 90 days
average_monthly_revenue = revenue_90 / 3

farmer raw eligibility = average_monthly_revenue * 0.8
company raw eligibility = average_monthly_revenue * 1.1
```

Limits:

```text
Farmer Pro minimum: KES 10,000
Farmer Pro maximum: KES 250,000

Company minimum: KES 25,000
Company maximum: KES 1,200,000
```

The final borrowing room also subtracts outstanding active loan balance.

```text
net_eligible_amount = eligible_amount - active_loan_balance
```

### 4. Loan Offers

Admins can publish loan offers. Offers can be targeted by:

- borrower role
- county
- loan product type
- maximum amount
- interest rate
- repayment days
- security type
- branch visit requirement
- accepted collateral types
- required documents

County targeting matters. If an offer is for Kakamega, a borrower registered in another county cannot apply for that offer.

### 5. Loan Product Types

The platform supports these product types:

- `seasonal_working_capital`
- `equipment_top_up`
- `buyer_contract_financing`

Default product logic exists in the backend, while admin-published offers can define the exact amount, interest, security requirements, county, and repayment window.

### 6. Security Types

Loan offers can be:

- `unsecured`
- `guarantor`
- `collateral`

Rules:

- unsecured loans can be auto-disbursed when readiness checks pass
- guarantor loans require at least one guarantor
- collateral loans require at least one collateral item, such as a title deed, logbook, livestock, inventory, business assets, or other accepted collateral
- offers can require a branch visit before disbursement

Branch visit states:

- `not_required`
- `pending_customer_visit`
- `documents_received`
- `valuation_pending`
- `verified`
- `waived`

Branch-required loans cannot be disbursed until documents are received, verified, or waived.

### 7. Application Flow

The borrower flow is:

1. Borrower opens Micro-Loans.
2. System calculates readiness and eligible amount.
3. Borrower selects an available offer.
4. Borrower enters requested amount.
5. Borrower chooses disbursement method.
6. Borrower chooses repayment method.
7. Borrower adds guarantor or collateral details if required.
8. Borrower acknowledges branch visit if required.
9. Backend validates everything.
10. Application is created.

If no manual review is required, the application can move directly to `disbursed`.

If guarantor, collateral, or branch checks are required, the application starts as `pending_review`.

### 8. Loan Status Lifecycle

Loan applications use these statuses:

- `pending_review` - submitted and waiting for admin/branch/security review
- `approved` - approved but not fully disbursed yet
- `rejected` - declined
- `disbursed` - funds or voucher released
- `repaid` - balance fully paid

### 9. Disbursement Methods

Supported disbursement methods:

- `mpesa`
- `voucher`

Voucher loans receive a generated voucher code when disbursed. M-Pesa disbursement is stored as the selected method for the loan workflow.

### 10. Repayment Methods

Supported repayment methods:

- `mpesa`
- `pay_with_produce`

`pay_with_produce` is only available to Farmer Pro borrowers.

Repayments are stored in `micro_loan_repayments` with:

- loan application ID
- user ID
- amount
- payment method
- payment reference
- phone number for M-Pesa repayments
- note
- timestamp

### 11. Repayment Schedule

The repayment schedule is calculated from:

- approved amount
- interest rate
- repayment days
- disbursement or review date
- repayments already made

The backend converts repayment days into scheduled monthly payments:

```text
scheduled_number_of_payments = ceil(repayment_days / 30)
monthly_rate = annual_interest_rate / 100 / 12
```

The schedule tracks:

- principal
- interest
- scheduled payment
- total payable
- total repaid
- remaining balance

The system blocks repayments that exceed the current remaining balance.

### 12. Pay With Produce

Pay with Produce connects loan repayment to marketplace sales.

When a Farmer Pro loan uses `pay_with_produce`, the platform can deduct repayment from released seller payouts.

Flow:

1. Farmer sells through the marketplace.
2. Order is paid and reaches payout release.
3. System checks whether the farmer has active Pay-with-Produce loans.
4. It calculates the remaining loan balance.
5. It deducts repayment from the seller payout amount.
6. It creates a `micro_loan_repayments` row with payment method `pay_with_produce`.
7. If the remaining balance reaches zero, the loan becomes `repaid`.

This creates a financing model where verified agricultural sales can repay credit automatically.

### 13. Admin Review

Admins can:

- publish loan offers
- target offers by county and role
- require guarantors
- require collateral
- require branch visits
- review applications
- approve, reject, disburse, or mark repayment progress
- manage loan decisions in the admin dashboard

### 14. Current Implementation Status

Implemented:

- eligibility scoring
- loan offer publishing
- county-targeted offers
- borrower applications
- guarantor and collateral validation
- branch visit requirements
- loan statuses
- repayment schedule calculation
- repayment recording
- Pay-with-Produce deductions from seller payout releases
- admin loan review workflows

Important note:

Marketplace M-Pesa payments already support STK push, callbacks, status checks, and stuck-payment recovery. Micro-loan M-Pesa repayment/disbursement is currently recorded in the loan workflow, but the loan module is not yet fully wired to its own M-Pesa STK callback lifecycle. The next production step is to connect the existing M-Pesa engine to `micro_loan_repayments` for real loan repayment STK pushes and callback verification.

## Agricultural Intelligence And AI

AgriLink X uses intelligence in two ways:

1. Diagnostic AI
   - Gemini-supported crop scanner
   - fallback diagnostic logic when Gemini is not configured

2. Operational AI advisory
   - Services Hub recommendations
   - market action signals
   - production watch signals
   - logistics movement signals
   - finance readiness signals

GMCIS, the Geo-Mapping and Climate Intelligence System, ties farm location, coordinates, weather, enterprise type, and market movement into decision support.

The intelligence layer is designed to inform the farmer before the next decision, not only diagnose problems after they happen.

## Admin And Governance

Admin capabilities include:

- user management
- role updates with audit logs
- ID verification review
- company verification
- loan offer management
- loan application decisions
- transaction tracking
- order/payout review
- refund request review
- feature flags
- audit log viewer
- receipts export

All admin role changes are recorded in `admin_audit_logs`.

## Technical Architecture

### Frontend

The frontend is responsible for:

- public landing pages
- authentication screens
- role-aware dashboard routing
- farmer dashboard
- company dashboard
- admin dashboard
- marketplace UI
- cart and checkout UI
- M-Pesa payment handoff UI
- messaging UI
- maps and GPS capture
- Services Hub and AI advisory presentation

### Backend

The backend is responsible for:

- auth-aware API handling
- Supabase data access
- business rule enforcement
- atomic ordering and stock control
- M-Pesa payment initiation
- M-Pesa callback handling
- manual payment status checks
- automatic stuck payment resolution
- RLS-safe data enrichment
- admin-only endpoints
- company and procurement logic
- micro-loan workflows

### Supabase

Supabase provides:

- authentication
- Postgres database
- row-level security
- storage buckets
- realtime channels
- SQL functions and constraints

## Key Data Areas

Important tables and domains include:

- `profiles`
- `user_roles`
- `products`
- `cart_items`
- `orders`
- `subscription_payments`
- `conversations`
- `messages`
- `crop_events`
- `id_verifications`
- `micro_loan_offers`
- `micro_loan_applications`
- `micro_loan_repayments`
- `refund_requests`
- `admin_audit_logs`
- company and procurement tables

Important database functions include:

- marketplace order placement
- stock decrement with locking
- stock increment/restoration
- payment reconciliation support

## Main API Areas

The canonical backend route wiring lives in `backend/config/urls.py`.

Main routes include:

- `/health`
- `/api/products`
- `/api/cart`
- `/api/orders`
- `/api/orders/<id>/cancel`
- `/api/orders/<id>/refund-request`
- `/api/payments/orders/<id>/mpesa`
- `/api/payments/orders/<id>/mpesa-status`
- `/api/payments/mpesa/callback`
- `/api/payments/subscriptions`
- `/api/scanner/crops`
- `/api/profiles`
- `/api/messages`
- `/api/crop-events`
- `/api/id-verification`
- `/api/micro-loans`
- `/api/companies`
- `/api/farmer/companies`
- `/api/farmer/procurement`
- `/api/admin`

## Local Development Setup

### Prerequisites

- Node.js 18+
- Python 3.9+
- Supabase project
- Supabase anon key
- Supabase service role key for backend only
- optional Gemini API key
- optional M-Pesa sandbox credentials

Never expose or commit the Supabase service role key. If it is accidentally pasted in chat, logs, screenshots, or a public repo, rotate it in Supabase before production use.

### 1. Install frontend dependencies

```bash
cd frontend
npm install
cp .env.example .env
```

Minimum frontend `.env`:

```text
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_API_URL=http://127.0.0.1:3001/api
```

### 2. Install backend dependencies

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Minimum backend `.env`:

```text
DEBUG=true
SECRET_KEY=change-me
PORT=3001
CLIENT_ORIGIN=http://localhost:8080

SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

MPESA_ENV=sandbox
MPESA_MOCK_MODE=true
MPESA_SHORTCODE=174379
MPESA_PASSKEY=
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_CALLBACK_URL=http://localhost:3001/api/payments/mpesa/callback
```

### 3. Bootstrap Supabase

Open the Supabase SQL Editor and run the full root script:

```sql
-- Run the complete contents of:
setup_database.sql
```

This script is the consolidated setup source for a fresh Supabase project.

### 4. Create an admin user

After signing up one user through the app, run this in Supabase SQL Editor:

```sql
insert into public.user_roles (user_id, role)
values ('YOUR_AUTH_USER_UUID', 'admin')
on conflict (user_id, role) do nothing;
```

### 5. Run backend

```bash
cd backend
npm run dev
```

Backend URL:

```text
http://127.0.0.1:3001
```

Health check:

```text
http://127.0.0.1:3001/health
```

### 6. Run frontend

```bash
cd frontend
npm run dev -- --host 0.0.0.0 --port 8080
```

Frontend URL:

```text
http://localhost:8080
```

If port `8080` is unavailable, use another Vite port.

## Useful Commands

Frontend:

```bash
cd frontend
npm run dev
npm run lint
npm run build
npm run test
```

Backend:

```bash
cd backend
npm run dev
npm run check
```

Resolve stuck M-Pesa payments:

```bash
cd backend
.venv/bin/python manage.py resolve_stuck_payments
.venv/bin/python manage.py resolve_stuck_payments --timeout-minutes 30
.venv/bin/python manage.py resolve_stuck_payments --dry-run
```

Recommended cron example:

```bash
*/10 * * * * cd /path/to/backend && .venv/bin/python manage.py resolve_stuck_payments >> /var/log/agrilink/stuck_payments.log 2>&1
```

## Verification

Current expected checks:

```bash
cd frontend
npm run lint
npm run build
```

Known non-blocking warnings may include:

- React Fast Refresh warnings in shared UI helper files
- hook dependency warnings in existing dashboard modules
- Vite chunk-size warning
- Tailwind ambiguity warning for `duration-[1.5s]`

## Repository Structure

```text
.
├── backend/
│   ├── api/
│   ├── config/
│   ├── manage.py
│   ├── package.json
│   └── README.md
├── frontend/
│   ├── src/
│   ├── supabase/
│   ├── package.json
│   └── README.md
├── supabase/
├── setup_database.sql
├── package.json
└── README.md
```

## Production Notes

Before production:

- rotate any exposed Supabase service role keys
- set `DEBUG=false`
- set a strong backend `SECRET_KEY`
- configure production CORS origin
- configure real M-Pesa credentials and callback URL
- verify Supabase RLS policies
- configure storage buckets and upload limits
- schedule stuck-payment resolution
- run the full frontend build
- review admin users and role assignments

## Roadmap

High-value next improvements:

- transporter role workspace
- richer cold-chain dispatch management
- stronger commodity price intelligence
- AI chat advisor trained on farmer profile, orders, weather, and marketplace signals
- downloadable farmer/company operating reports
- insurer and lender dashboards
- farmer cooperative/group management
- offline-first mobile field workflows

## Market References

These public sources were used to frame the market-positioning section:

- [DigiFarm FAQ - Safaricom](https://www.safaricom.co.ke/media-center-landing/frequently-asked-questions/digifarm-faqs?tmpl=component)
- [DigiFarm Terms - Safaricom](https://www.safaricom.co.ke/media-center-landing/terms-and-conditions/terms-and-conditions-for-digifarm-platform)
- [Apollo Agriculture - About](https://www.apolloagriculture.com/about)
- [Apollo Agriculture - Farmer Loans](https://www.apolloagriculture.com/farmer)
- [Twiga Foods - IFC project description](https://disclosures.ifc.org/project-detail/ESRS/43108/twiga-foods-ltd)
- [Twiga Foods - GAFSP project profile](https://www.gafspfund.org/projects/technology-connects-kenyan-smallholders-market-access)
- [Mkulima Bora - Services](https://portal.mkulimabora.org/services)
- [Mkulima Young - Marketplace](https://www.mkulimayoung.com/market?featured=1)
- [DigiCow - Google Play listing](https://play.google.com/store/apps/details?hl=en_US&id=info.digicow.com)
