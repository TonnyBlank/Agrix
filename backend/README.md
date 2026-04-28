# AgriLink X Backend

The backend is a Django application that preserves the REST API shape expected by the frontend while using Supabase as the system of record.

## Stack

- Django 5
- Python
- uvicorn for ASGI serving
- Supabase for auth, database, storage, and admin-backed data

## What It Handles

- profile and auth-backed user data
- marketplace and order APIs
- cart APIs with stock-aware validation
- micro-loans and repayment flows
- M-Pesa sandbox or mock-backed payment flows
- paid-plan subscription payment activation and ledger tracking
- company APIs for:
  - company profile creation
  - company dashboard data
  - company products
  - company partners
  - company procurement requests
  - admin company verification
- crop scanner endpoints with Gemini support

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Before running APIs on a fresh Supabase project, run the root bootstrap SQL once:

- `../setup_database.sql`

## Run Locally

```bash
cd backend
python manage.py runserver
```

The development server defaults to:

```text
http://127.0.0.1:3001
```

Health check:

```text
http://127.0.0.1:3001/health
```

## Main API Areas

- `/api/products`
- `/api/scanner/crops`
- `/api/orders`
- `/api/cart`
- `/api/messages`
- `/api/crop-events`
- `/api/profiles`
- `/api/id-verification`
- `/api/micro-loans`
- `/api/payments`
- `/api/payments/subscriptions`
- `/api/companies`
- `/api/farmer/companies`
- `/api/admin`

## Important Files

- `manage.py`: main development entrypoint
- `main.py`: ASGI compatibility shim
- `config/settings.py`: Django settings
- `config/urls.py`: API route wiring
- `api/views_core.py`: shared user, profile, product, order, and loan logic
- `api/views_companies.py`: company and admin-company flows
- `api/views_admin.py`: admin endpoints

## Environment Notes

The backend expects Supabase configuration in `.env`.

For the crop scanner, Gemini is optional:

```text
GEMINI_API_KEY=your-google-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
```

If `GEMINI_API_KEY` is missing, the scanner falls back to heuristic output.

## Useful Commands

Check Django config:

```bash
.venv/bin/python manage.py check
```

Run with explicit host and port:

```bash
.venv/bin/python manage.py runserver 127.0.0.1:3001
```

Run ASGI app directly:

```bash
.venv/bin/python -m uvicorn config.asgi:application --host 127.0.0.1 --port 3001
```

## Notes

- `manage.py` is the main local entrypoint
- Profile updates support extended fields including farm operations and GPS coordinates
- Company dashboard data depends on the company and procurement tables being present in Supabase

For the overall project, see the [root README](../README.md).
