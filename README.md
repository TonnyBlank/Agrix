# AgriLink X

AgriLink X is a multi-role agriculture platform that brings farmer operations, produce trading, messaging, financing, company sourcing, and admin oversight into one system.

This repository contains the full application stack:

- `frontend/`: React + Vite dashboard and public UI
- `backend/`: Django API layer that preserves the REST contract used by the frontend
- `supabase/` and `frontend/supabase/`: SQL schema and migration history for Supabase Postgres

## What The System Does

AgriLink X is designed to support the full agricultural workflow, not just a single marketplace screen.

Core capabilities include:

- farmer profiles with contact, county, payout, and farm operation details
- farm records with GPS coordinates, crop activities, and profile enrichment
- produce listing and marketplace ordering
- M-Pesa-backed order payments and payout release workflow
- messaging between users around sourcing and trade
- ID verification and admin approval flows
- micro-loans with readiness checks, security requirements, repayment tracking, and branch review
- company onboarding, procurement publishing, farmer partnerships, and company order tracking
- admin dashboards for users, companies, financing, transactions, and verification
- AI crop scanning with Gemini support and fallback diagnostics when Gemini is unavailable

## User Roles

The platform is role-aware. The main roles in the codebase are:

- `farmer_free`
  Access to the core farmer dashboard, profile, products, farm tooling, marketplace, and upgrade prompts.
- `farmer_pro`
  Everything in Farmer Free plus live loan readiness and borrowing features.
- `company`
  Company onboarding, company dashboard, procurement, supplier management, product catalog, orders, and profile/settings.
- `admin`
  Platform-wide oversight: users, companies, loan offers, loan decisions, transactions, and verification.

## Main Product Modules

### 1. Identity, Auth, and Profile

Authentication is handled through Supabase Auth. The backend validates the authenticated user and uses Supabase as the system of record.

Profile data supports:

- full name
- phone number
- county
- farm size and farming details
- farm type, irrigation type, soil type
- years farming
- storage and transport flags
- cooperative information
- payout method and payout destination
- farmer bio and profile photo
- farm GPS latitude/longitude

The profile is central to the rest of the product. It influences:

- marketplace trust and public farmer pages
- loan eligibility
- company discovery
- messaging results
- county-based loan targeting

### 2. Farmer Operations

Farmer-facing dashboard features include:

- `My Farm`
  Saves farm profile details and GPS coordinates from browser geolocation.
- `My Products`
  Manage produce listings, images, pricing, stock, and media.
- `Crop Calendar`
  Stores crop events and activity scheduling.
- `Community`
  Content-style dashboard area for engagement and updates.
- `Performance Analytics`
  Farmer dashboard metrics and operational insights.

### 3. Marketplace, Orders, and Payments

The marketplace supports produce discovery, ordering, and fulfillment.

Key flow:

1. A seller creates a product listing.
2. A buyer places an order.
3. The system calculates subtotal, delivery fee, escrow amount, platform commission, and seller payout.
4. The buyer pays via M-Pesa STK push.
5. Payment state is tracked on the order.
6. Delivery and official sign-off drive payout release.

Important order concepts in the schema and backend:

- `payment_status`
- `merchant_request_id`
- `checkout_request_id`
- `escrow_amount`
- `agrilink_commission_rate`
- `agrilink_commission_amount`
- `seller_payout_amount`
- `payout_status`
- `official_verified_at`
- `payout_released_at`

The backend contains logic for:

- M-Pesa payment initiation
- payment status checks
- callback handling
- escrow release logic
- pay-with-produce loan deductions on eligible flows

### 4. Messaging and Discovery

Messaging is a direct user-to-user conversation feature.

Current messaging behavior:

- users can search farmer profiles
- users can open a public farmer profile before chatting
- a conversation is created once per user pair
- messages are stored in `messages`
- conversation summaries are stored in `conversations`
- unread counts are tracked separately for both participants
- realtime updates are delivered through Supabase channel subscriptions

The conversation list is now enriched server-side so profile name/photo loading works even when profile row-level security is strict.

Related features around discovery:

- `DiscoveryHub`
- public farmer profile view
- farmer search by name/county/farm size
- company procurement discovery for farmers

### 5. AI Crop Scanner

The scanner supports crop analysis with two operating modes:

- Gemini-backed analysis when `GEMINI_API_KEY` is configured
- a local fallback diagnostic path when Gemini is unavailable or blocked

This keeps the scanner usable in both production and partial local environments.

### 6. Micro-Loans

The financing module is a major part of the system.

It includes:

- live loan readiness checks
- loan offer publishing by admin
- borrower loan applications
- manual review for guarantor/collateral/branch-based loans
- disbursement mode selection
- repayment mode selection
- repayment logging
- amortization schedule generation
- branch review and document handling

#### Loan readiness rules

Borrowing depends on live readiness checks such as:

- verified identity
- payout setup completed
- full contact profile completed
- enough paid or qualified order history
- minimum revenue threshold

#### Loan security types

Loan offers and applications support:

- `unsecured`
- `guarantor`
- `collateral`

Depending on the offer, borrowers may also need:

- branch visit acknowledgement
- collateral item submission
- guarantor details
- required document handover

#### County-targeted loan publishing

Loan offers are now county-aware.

When admin publishes a loan offer, the offer includes:

- `branch_name`
- `branch_location`
- `target_county`
- optional branch instructions
- collateral and required document rules

Borrower visibility rules:

- the offer is shown only when the borrower role matches the offer role
- the offer is active
- the borrower is registered in the same county as the offer `target_county`

Application rules:

- a borrower must have a county saved on their profile
- if the borrower county does not match the offer county, the application is rejected
- the county target is stored on the loan application for traceability

### 7. Company Workflows

Companies have a dedicated operating area with their own dashboard and related APIs.

Current company capabilities include:

- company onboarding and direct admin-created company setup
- company profile settings
- company product catalog management
- supplier / farmer partnership tracking
- procurement request publishing
- company order tracking
- company verification by admin

Company procurement requests support:

- title
- category
- target county
- quantity needed
- unit
- budget range
- needed-by date
- notes
- status

This allows companies to post sourcing demand while farmers discover matching procurement opportunities.

### 8. Admin Operations

The admin area provides platform-level control and review.

Current admin modules include:

- overview and analytics
- user management and role updates
- company verification
- order review and payout release
- loan candidate review
- loan offer publishing
- loan decision workspace
- transaction tracking
- ID verification review

Admin loan tools are split into two clear areas:

- `AdminLoans`
  Publish and maintain reusable loan offers.
- `AdminLoanDecisions`
  Review actual borrower applications and decide approval, rejection, verification, disbursement, and repayment state.

## Technical Architecture

### Frontend

The frontend is built with:

- React 18
- Vite
- TypeScript
- Tailwind CSS
- shadcn/ui + Radix UI
- Framer Motion
- React Router
- TanStack Query
- React Leaflet
- Supabase JS

Main frontend responsibilities:

- route protection by role
- dashboard rendering
- form handling
- realtime subscriptions for messaging
- direct Supabase fallback for some reads when API requests fail
- admin and company workspace UX

### Backend

The backend is built with:

- Django 5
- Python
- uvicorn-compatible ASGI entrypoints

Main backend responsibilities:

- auth-aware request handling
- Supabase data access
- business rules and validation
- payment integration
- serializer-style API shaping for frontend needs
- admin-only enforcement
- RLS-safe data enrichment where client-side reads are insufficient

### Platform Services

The project relies on Supabase for:

- authentication
- Postgres database
- storage buckets
- public/signed URLs

## Key Data Areas

Important tables and domains in the current system include:

- `profiles`
- `user_roles`
- `products`
- `orders`
- `conversations`
- `messages`
- `crop_events`
- `id_verifications`
- `micro_loan_offers`
- `micro_loan_applications`
- `micro_loan_repayments`
- company tables for:
  - `companies`
  - company products
  - partnerships
  - procurement requests
  - company orders

## Repository Structure

- `frontend/src/pages/`
  Route-level pages for public screens, farmer flows, company flows, and admin areas.
- `frontend/src/components/`
  Reusable UI blocks, dashboard shells, dialogs, and shared visual components.
- `frontend/src/hooks/`
  Data-fetching and app behavior hooks such as auth, orders, messages, and verification.
- `frontend/src/lib/`
  API helpers, sanitizers, config, and utility functions.
- `frontend/src/integrations/supabase/`
  Supabase client and generated TypeScript database types.
- `backend/api/`
  Core request handlers and business logic.
- `backend/config/`
  Django settings, routing, and framework glue.
- `supabase/migrations/`
  Timestamped backend-facing SQL migrations.
- `frontend/supabase/migrations/`
  Frontend-facing migration history kept with the app.

## Main Backend API Areas

These are the main route groups exposed by the Django backend:

- `/health`
- `/api/scanner/crops`
- `/api/products`
- `/api/orders`
- `/api/payments`
- `/api/profiles`
- `/api/messages`
- `/api/crop-events`
- `/api/id-verification`
- `/api/micro-loans`
- `/api/companies`
- `/api/farmer/companies`
- `/api/farmer/procurement`
- `/api/admin`

The canonical route wiring lives in:

- `backend/config/urls.py`

## Local Development Setup

### Prerequisites

- Node.js 18+
- Python 3.9+
- a Supabase project with matching environment variables

### 1. Clone and enter the repo

```bash
git clone <repository-url>
cd Agrilink-X-main
```

### 2. Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

### 3. Frontend setup

```bash
cd ../frontend
npm install
cp .env.example .env
```

### 4. Run the backend

```bash
cd backend
.venv/bin/python manage.py runserver 127.0.0.1:3001
```

### 5. Run the frontend

```bash
cd frontend
npm run dev
```

### 6. Open locally

- frontend: `http://localhost:8080`
- backend health check: `http://127.0.0.1:3001/health`

## Environment Variables

### Frontend

Minimum frontend env:

```text
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Optional frontend env:

```text
VITE_API_URL=http://127.0.0.1:3001/api
```

### Backend

The backend expects Supabase configuration and, optionally, payment/scanner credentials in `.env`.

Common backend env groups:

- Supabase URL / keys
- M-Pesa credentials and callback URL
- Gemini API key and model name

Relevant optional scanner env:

```text
GEMINI_API_KEY=your-google-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
```

## Database and Migration Strategy

The repository contains both bootstrap SQL and granular migration history.

Important files:

- `setup_database.sql`
- `supabase/migrations/`
- `frontend/supabase_migration.sql`
- `frontend/supabase/migrations/`

Recommended rule:

- use one migration strategy consistently per environment
- do not blindly run every SQL file twice

Practical guidance:

- use `setup_database.sql` when bootstrapping a fresh environment quickly
- use timestamped migrations in `supabase/migrations/` and `frontend/supabase/migrations/` when you want step-by-step schema history

Recent financing schema additions include support for:

- branch-based secured loan review
- disbursement and repayment method fields
- voucher disbursement
- county-targeted loan offers and applications

## Current Operational Notes

- messaging depends on both API routes and realtime Supabase channels
- farmer profile data is important for discovery, loans, and messaging identity
- loan readiness depends heavily on verified identity, payout setup, and order history
- county-based loans will not appear for borrowers without a matching county on profile
- company dashboards depend on company-related tables being present in Supabase
- the map on `My Farm` prefers saved GPS coordinates over generic county display
- M-Pesa can run in sandbox or mock-backed mode depending on backend configuration

## Verification Commands

Backend checks:

```bash
cd backend
.venv/bin/python manage.py check
python3 -m py_compile api/views_core.py api/views_social.py api/views_loans.py api/views_admin.py api/views_companies.py
```

Frontend checks:

```bash
cd frontend
npm run build
npm run test
npm run lint
```

## Related Docs

- [Backend README](./backend/README.md)
- [Frontend README](./frontend/README.md)
