# AgriLink X Backend

The backend is a Django API layer for AgriLink X. It keeps Supabase as the system of record while enforcing business rules that should not live directly in the browser.

It supports farmers, companies, buyers, admins, marketplace trade, M-Pesa payments, subscriptions, micro-loans, company procurement, verification, messaging, AI scanner endpoints, and background payment resolution.

## Stack

- Django 5
- Python
- Supabase for auth, Postgres, storage, realtime, and RLS-backed data
- uvicorn-compatible ASGI entrypoints
- M-Pesa sandbox/production-compatible payment flow
- optional Gemini API integration for AI scanner analysis

## What The Backend Handles

- authenticated profile reads and updates
- products/listings
- marketplace orders
- cart APIs
- atomic stock decrement and restoration
- M-Pesa STK push initiation
- M-Pesa callback handling
- manual M-Pesa status checks
- subscription payment activation
- stuck-payment resolution
- buyer cancellation and refund request flows
- messages and conversation enrichment
- crop event APIs
- AI scanner APIs
- ID verification APIs
- micro-loan offers, applications, decisions, and repayments
- company onboarding and profile APIs
- company product catalog APIs
- company partner APIs
- company procurement request APIs
- farmer procurement response APIs
- admin APIs for users, loans, transactions, verification, feature flags, and audit logs

## Environment Variables

Create `backend/.env` from `backend/.env.example`.

Minimum local values:

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

Never expose the service role key to the frontend or commit it to the repo.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Before using the API with a new Supabase project, run the root SQL bootstrap:

```text
../setup_database.sql
```

## Run Locally

```bash
npm run dev
```

The dev server runs on:

```text
http://127.0.0.1:3001
```

Health check:

```text
http://127.0.0.1:3001/health
```

## Main API Areas

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

Canonical route wiring lives in:

```text
backend/config/urls.py
```

## Payments And Stock Safety

The backend protects marketplace consistency by coordinating with SQL functions and order/payment state.

Important behavior:

- stock is decremented atomically when an order is placed
- failed or timed-out M-Pesa payments restore stock
- buyer cancellation can restore stock when eligible
- paid orders keep escrow, commission, and seller payout fields
- refund requests are logged for admin review
- subscription payments use a ledger before role activation

## Background Jobs

Resolve orders stuck in `initiated` or `pending_confirmation` payment state:

```bash
.venv/bin/python manage.py resolve_stuck_payments
.venv/bin/python manage.py resolve_stuck_payments --timeout-minutes 30
.venv/bin/python manage.py resolve_stuck_payments --dry-run
```

Recommended cron:

```bash
*/10 * * * * cd /path/to/backend && .venv/bin/python manage.py resolve_stuck_payments >> /var/log/agrilink/stuck_payments.log 2>&1
```

## Important Files

- `manage.py` - Django management entrypoint
- `main.py` - ASGI compatibility shim
- `config/settings.py` - Django settings
- `config/urls.py` - route wiring
- `api/views_core.py` - core profile, marketplace, orders, payments, loans, and scanner logic
- `api/views_companies.py` - company and procurement flows
- `api/views_admin.py` - admin endpoints
- `api/management/commands/resolve_stuck_payments.py` - payment recovery command

## Verification

```bash
npm run check
```

For frontend and complete product documentation, see the [root README](../README.md).
