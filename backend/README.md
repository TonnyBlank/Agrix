# AgriLink X Backend

This Django 5 ASGI service is the protected business API for AgriLink X. It validates Supabase bearer tokens, resolves application roles, and handles marketplace, orders, M-Pesa, delivery, finance, company, admin, and crop-scanning workflows.

## Run Locally

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver 127.0.0.1:3001
```

Run checks with:

```bash
.venv/bin/python manage.py check
```

The liveness endpoint is `GET /health`. It has no database dependency and is appropriate for Render health checks and external uptime pings.

## Configuration

Use `.env.example` as the template. Required production configuration includes:

```dotenv
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=long-random-server-secret
DJANGO_ALLOWED_HOSTS=agrix-bavp.onrender.com
CLIENT_ORIGIN=https://agrilink-kenya.vercel.app
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
DELIVERY_OTP_SECRET=separate-random-server-secret
```

Add M-Pesa credentials only when running non-mock M-Pesa flows. Never commit `.env`, service-role keys, payment credentials, or Gemini keys.

## Crop Scanner

`POST /api/scanner/crops` accepts authenticated image uploads from `farmer_pro`, `company`, and `admin` users. The server accepts JPEG, PNG, and WebP up to 8 MB, sends the source bytes and MIME type to Gemini, and asks for structured JSON.

- Primary model: `gemini-2.5-flash`
- Rate-limit fallback: `gemini-2.5-flash-lite`
- Lower-confidence model diagnoses are retained with their confidence
- The safe undetermined result is reserved for an invalid image or unusable model response

Gemini keys are read from `GEMINI_API_KEY` (with `GOOGLE_API_KEY` accepted as a compatibility fallback). The model name comes from `GEMINI_MODEL`.

## Important Commands

```bash
# Development server
npm run dev

# ASGI server on the normal local port
npm start

# Django configuration check
npm run check

# Reconcile payment records that remain pending
.venv/bin/python manage.py resolve_stuck_payments
```

## Production on Render

```text
Root Directory: backend
Build Command: pip install -r requirements.txt
Start Command: python -m uvicorn config.asgi:application --host 0.0.0.0 --port $PORT
Health Check Path: /health
```

Use the production origin as `CLIENT_ORIGIN`; it must exactly match the Vercel browser origin with no trailing slash. Render environment variables replace local `.env` values and require a redeploy after changes.

## Main Areas

| Location | Responsibility |
| --- | --- |
| `api/views_core.py` | Marketplace, carts, orders, M-Pesa, scanner, company/procurement, and core workflows. |
| `api/common.py` | Supabase auth, role resolution, validation helpers, and shared responses. |
| `api/views_admin.py` | Protected administration functionality. |
| `api/urls.py` | API routing. |
| `config/settings.py` | Django, CORS, security-header, and environment configuration. |
| `api/management/commands/resolve_stuck_payments.py` | Background payment reconciliation. |

Consult the root [README](../README.md) for full platform, frontend, Supabase, and deployment documentation.
