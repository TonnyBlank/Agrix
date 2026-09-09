# AgriLink X

AgriLink X is a full-stack agriculture operations platform for Kenya. It brings farm records, marketplace trade, procurement, delivery coordination, M-Pesa payments, finance workflows, administration, and AI crop analysis into one application.

It supports mixed farm enterprises, including crops, livestock, poultry, eggs, dairy, fish, honey, farm inputs, and agricultural services.

## What Is Implemented

- Supabase email/password authentication with application roles: `farmer_free`, `farmer_pro`, `company`, `transporter`, and `admin`
- Farmer profiles, farm records, crop events, products, stock-aware carts, buyer and seller orders
- Marketplace product listings, order lifecycle handling, seller/buyer dashboards, and conversations
- M-Pesa STK Push integration with sandbox/mock support and payment-status handling
- Delivery tracking and delivery confirmation OTPs
- Company onboarding, verification support, procurement requests, supplier responses, and company order workflows
- Finance features for loan requests, repayment records, insurance readiness, and green-credit signals
- Admin controls, verification workflows, moderation views, and audit-log support
- AI crop scanning for JPEG, PNG, and WebP images, using Gemini structured output with a reliable model fallback
- Crop calendar, deal matching, recommendations, analytics, services hub, and ID-verification workflows

## Architecture

```text
React + Vite frontend (Vercel)
        |
        | HTTPS / Bearer access token
        v
Django API (Render)
        |------------------> Supabase Auth + Postgres + Storage
        |------------------> Safaricom Daraja / M-Pesa
        |------------------> Google Gemini crop analysis
        v
Role-aware farmer, company, transporter, and admin experiences
```

The frontend authenticates with Supabase. The Django API validates the access token for protected endpoints and resolves the user's application role from the database.

For security, browser sessions are kept in memory rather than persisted in `localStorage`. A user must sign in again after a full page reload or browser restart.

## User Roles

| Role | Intended access |
| --- | --- |
| `farmer_free` | Farm profile, products, marketplace, carts, orders, messages, and basic tools. |
| `farmer_pro` | Farmer access plus paid/pro features, including AI crop scanning and finance-oriented tools. |
| `company` | Company profile, procurement, supplier responses, business product and order workflows. |
| `transporter` | Delivery and logistics-related workflows. |
| `admin` | Moderation, verification, role governance, sensitive operational actions, and audit history. |

New accounts receive the default farmer role. Elevated roles are assigned through controlled backend/admin flows, not supplied by the public signup form.

## AI Crop Scanner

The scanner accepts a crop image and returns a structured, cautious assessment:

- Supported formats: JPEG, PNG, and WebP
- Upload limit: 8 MB
- Access: `farmer_pro`, `company`, and `admin`
- Primary model: `gemini-2.5-flash`
- Rate-limit fallback: `gemini-2.5-flash-lite`
- Output: crop, possible issue, confidence, severity, visible symptoms, recommended action, organic alternatives, and prevention notes

The scanner preserves a usable lower-confidence diagnosis when Gemini returns one. It returns **Unable to determine** only when the image or model response cannot support a reliable assessment. Results are advisory, not a replacement for an agronomist, lab test, or local extension officer.

## Technology

| Area | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router |
| Backend | Django 5, ASGI/Uvicorn, Python |
| Authentication and data | Supabase Auth, Postgres, Storage |
| Payments | Safaricom Daraja / M-Pesa, with local mock support |
| AI | Google Gemini API |
| Production hosting | Vercel (frontend) and Render (backend) |

## Repository Layout

```text
frontend/                 React/Vite application
backend/                  Django API and business logic
backend/api/              API endpoints, auth, payments, scanner, commands
backend/config/           Django settings, routes, ASGI configuration
supabase/                 Supabase configuration and migrations
setup_database.sql        Consolidated database bootstrap script
render.yaml               Render Blueprint configuration
vercel.json               Vercel build and API configuration
```

## Local Development

### 1. Prerequisites

- Node.js 20 or later
- Python 3.11 or later
- A Supabase project
- A Gemini API key for crop scanning
- Daraja sandbox credentials only when testing live M-Pesa requests

### 2. Database and Supabase

Open the Supabase SQL Editor and run [setup_database.sql](setup_database.sql). The script creates the required tables, functions, role policies, and triggers.

Then copy the Supabase project URL, anonymous key, and service-role key into the frontend and backend environment files as appropriate.

### 3. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver 127.0.0.1:3001
```

The API health endpoint is `http://127.0.0.1:3001/health`. It performs no database query and is suitable for uptime checks.

### 4. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

The development frontend normally runs at `http://localhost:5173` and calls the backend at `http://127.0.0.1:3001/api`.

## Environment Variables

Never commit real credentials. `.env` files are ignored by Git; production values belong in the Render and Vercel dashboards.

### Backend: `backend/.env`

```dotenv
DJANGO_DEBUG=true
DJANGO_SECRET_KEY=generate-a-long-random-value
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
CLIENT_ORIGIN=http://localhost:5173

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash

MPESA_ENV=sandbox
MPESA_MOCK_MODE=true
MPESA_CONSUMER_KEY=your-daraja-consumer-key
MPESA_CONSUMER_SECRET=your-daraja-consumer-secret
MPESA_SHORTCODE=your-shortcode
MPESA_PASSKEY=your-passkey
MPESA_CALLBACK_URL=https://your-api.example.com/api/payments/mpesa/callback

DELIVERY_OTP_SECRET=generate-a-separate-random-secret
```

`SUPABASE_SERVICE_ROLE_KEY`, M-Pesa secrets, `DJANGO_SECRET_KEY`, `DELIVERY_OTP_SECRET`, and `GEMINI_API_KEY` must remain server-only. Do not place them in a Vite variable or browser code.

### Frontend: `frontend/.env`

```dotenv
VITE_API_URL=http://127.0.0.1:3001/api
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

Only values beginning with `VITE_` are exposed to the browser. The Supabase anonymous/publishable key is expected to be public; it is protected by Supabase Row Level Security. No administrative key belongs here.

## Production Deployment

### Render: Django API

The provided [render.yaml](render.yaml) configures the API service. For a manually configured Render web service, use:

| Setting | Value |
| --- | --- |
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `python -m uvicorn config.asgi:application --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/health` |

Set every backend environment variable above in **Render > Environment**. In production, set:

```dotenv
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=agrix-bavp.onrender.com
CLIENT_ORIGIN=https://agrilink-kenya.vercel.app
GEMINI_MODEL=gemini-2.5-flash
```

Use your actual Render and Vercel domains. `CLIENT_ORIGIN` must exactly match the browser origin, including `https` and without a trailing slash.

Render free instances sleep after inactivity. The first request after sleep can take roughly a minute. A lightweight external monitor can request `/health` periodically without consuming Supabase database resources.

### Vercel: Frontend

[vercel.json](vercel.json) is configured for this monorepo. The deployed build uses:

| Setting | Value |
| --- | --- |
| Install Command | `cd frontend && npm ci` |
| Build Command | `cd frontend && npm run build` |
| Output Directory | `frontend/dist` |

Set these Vercel environment variables, then redeploy:

```dotenv
VITE_API_URL=https://agrix-bavp.onrender.com/api
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

After changing Render variables, save and redeploy the backend. After changing Vercel `VITE_` variables, redeploy the frontend because Vite embeds them during the build.

## Security Notes

- Supabase Auth performs password hashing. The app does not maintain a custom password store.
- New and changed passwords are checked for at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character.
- In Supabase **Authentication > Password Security**, set the minimum length to `8` and require digits, lowercase letters, uppercase letters, and symbols. This is the server-side enforcement for direct Supabase Auth requests.
- Browser tokens are memory-only and are attached to protected API calls as bearer tokens.
- The backend validates protected requests through Supabase token verification and role resolution.
- The Django API sends `X-Content-Type-Options`, `X-Frame-Options`, referrer, permissions, CSP, and production HSTS headers.
- CORS is restricted by `CLIENT_ORIGIN`; do not use a wildcard origin in production.
- Crop uploads are validated for MIME type and maximum size server-side.
- Keep Supabase Row Level Security enabled and review policies before exposing a new table or Storage bucket.
- Rotate any key that was pasted into a chat, issue, commit, or screenshot. Treat it as compromised.

## Operations

### Background Payment Resolution

Use the management command to reconcile payment records left pending after callback/network problems:

```bash
cd backend
.venv/bin/python manage.py resolve_stuck_payments
```

Schedule it through your worker/cron system in production where needed.

### Useful Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Cheap service liveness check. |
| `GET /api/health` | API health information. |
| `POST /api/scanner/crops` | Authenticated Gemini crop analysis. |
| `GET /api/products` | Marketplace products. |
| `GET /api/messages/conversations` | Authenticated message conversations. |
| `POST /api/payments/mpesa/stk-push` | Authenticated M-Pesa payment initiation. |

See [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md) for component-level setup.

## Verification

```bash
cd frontend && npm run typecheck && npm run build
cd ../backend && .venv/bin/python manage.py check
```

Before a production release, verify:

- the database migration/schema is applied in Supabase
- Render has every required backend secret
- Vercel has the three required `VITE_` variables
- `CLIENT_ORIGIN` and the Vercel origin match exactly
- `/health` returns `200`
- a buyer, seller, company, and admin test account have the intended permissions
- an M-Pesa sandbox payment and a crop-scan image work end to end

## License

No license file is currently included. Obtain project-owner approval before redistributing or using the code outside the intended deployment.
