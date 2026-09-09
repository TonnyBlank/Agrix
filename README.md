# AgriLink X

AgriLink X is a full-stack agriculture operations platform for Kenya. It brings farm records, marketplace trade, procurement, delivery coordination, M-Pesa payments, finance workflows, administration, and AI crop analysis into one application.

It supports mixed farm enterprises, including crops, livestock, poultry, eggs, dairy, fish, honey, farm inputs, and agricultural services.

## What Is Implemented

- Supabase email/password authentication with application roles: `farmer_free`, `farmer_pro`, `company`, `transporter`, and `admin`
- Farmer profiles, farm records, crop events, products, stock-aware carts, buyer and seller orders
- Marketplace product listings, Cart-first M-Pesa checkout, order lifecycle handling, seller/buyer dashboards, and conversations
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
| `farmer_free` | Farm profile, products, marketplace, cart, orders, messages, crop calendar, deal matching, community, and basic tools. |
| `farmer_pro` | Farmer access plus paid/pro features, including AI crop scanning and finance-oriented tools. |
| `company` | Company hub, business products, supplier partnerships, procurement, company orders, marketplace, cart, messages, performance, and risk/credit tools. |
| `transporter` | Dispatch Board, notifications, activity, and profile/settings. Farm, product, marketplace, cart, and order-management tabs are intentionally hidden. |
| `admin` | Platform administration, logistics oversight, verification, roles, disputes, loans, transactions, feature flags, and audit history. |

## Accounts And Access

- Every person must create an account and explicitly sign in with their email and password. Signing up does **not** leave a user logged in: the app clears any signup session and sends the person to the Sign In page.
- A new public account receives the default `farmer_free` role. The signup form does not accept a role, so a browser request cannot make itself an `admin`, `company`, or `transporter`.
- Company users sign in first, then submit the company onboarding information. Company access is granted only through the controlled verification flow.
- Transporter and administrator accounts are assigned by trusted platform administrators. They are not public signup choices.
- Role checks exist in both the browser routes and the Django API. Hiding a menu item is not the security boundary; the API verifies the authenticated user and their current application role.

## How People Use AgriLink X

### Farmers And Buyers

1. Create an account, sign in, and complete the profile with contact and county information.
2. Use **My Farm** to maintain farm details, crops, livestock, and farm events. Use **My Products** to publish stock that is ready to sell. Seller identity verification is required before a product can be listed.
3. Browse **Marketplace**, inspect a listing, choose a quantity, and add it to **Cart**. Marketplace is for discovery and cart building only; it does not charge the buyer or create an order.
4. In **Cart**, select ready items, review product and delivery totals, enter the phone that should receive the M-Pesa prompt, then choose **Place Order & Pay**.
5. Approve the STK prompt on the phone. The Cart page shows the immediate checkout result, while **Orders** is where the buyer later tracks fulfilment, delivery, receipts, cancellations, and refunds/disputes.
6. Use **Messages**, **Notifications**, and **Activity** to stay in contact with counterparties and follow changes. Farmers can also use the crop calendar, deal matching, community, services, performance, and finance tools available to their plan.

### Farmer Sellers

1. Add accurate stock, price, unit, location, and product information in **My Products**.
2. When a paid marketplace order arrives, accept or decline it, then move it through confirmed, processing, and shipped as the product is prepared and handed over.
3. Sellers do not take payment in the Marketplace or Orders pages. Payment begins only from the buyer's Cart checkout.
4. Follow delivery and buyer handover confirmation before payout is released. Use messages and notifications to coordinate any delivery questions.

### Pro Farmers And Crop Analysis

The current dashboard Scanner page is part of the farmer workspace. The protected scanner API accepts `farmer_pro`, `company`, and `admin`, but the Company and Administration sidebars do not yet link to a dedicated scanner screen. A free farmer can see upgrade guidance but cannot call the protected scanner API. The scanner accepts a JPEG, PNG, or WebP image up to 8 MB, and its result is advisory: it should support a grower's decision, not replace an agronomist, lab test, or local extension officer.

### Companies

1. Sign in, complete company onboarding, and wait for platform verification.
2. Use **Company Hub** for a business overview, **Products** for the company catalogue, **Partners** for farmer relationships, and **Procurement** to publish requests and assess supplier responses.
3. Use **Company Orders** for company workflows. Marketplace buying follows the same Cart-first M-Pesa process as every other buyer.
4. Use company profile/settings, messages, performance, notifications, activity, and risk/credit pages to manage the operating account.

### Transporters And Logistics Teams

Transporter accounts are deliberately focused on delivery work. Their landing page is the **Dispatch Board**, and they do not see or have permission to open **My Farm**, farm products, Marketplace, Cart, or buyer/seller Orders.

1. An administrator creates a dispatch for an order as `open` or assigns it directly to a transporter.
2. The transporter sees open work or their own assignments, accepts a dispatch, and updates it through **Accepted**, **Picked Up**, **In Transit**, and **Delivered**. A dispatch can be cancelled only while it is still active.
3. Pickup and delivery updates can include coordinates. At delivery, the transporter can add a delivery note and upload a JPEG, PNG, or WebP proof photo directly from the phone camera or gallery. The photo is required before a transporter can mark the dispatch delivered.
4. After an order is marked delivered, the transporter requests and verifies the buyer's delivery OTP to confirm handover. OTPs expire and failed attempts are limited; exhausting the allowed attempts flags the case for administrator review.
5. Transporters use Notifications and Activity for new assignments and handover updates, and Profile & Settings for their own account details.

### Platform Administrators

Administrators operate the platform rather than buying or selling through the ordinary farmer workspace. They use the Administration area to:

- verify companies and identity submissions;
- assign and review roles, including transporter access;
- create, assign, reassign, and oversee logistics dispatches;
- review transactions, delivery exceptions, refunds/disputes, and official delivery sign-off;
- manage loan offers, loan decisions, risk/credit workflows, and feature flags; and
- inspect audit logs for sensitive actions.

Use the controlled admin role workflow after the first platform owner is bootstrapped in Supabase. Never grant roles by trusting a value sent from a public signup form or browser storage.

## Marketplace, Payment, And Delivery Lifecycle

The application keeps each stage in its proper place:

| Stage | Where it happens | What happens |
| --- | --- | --- |
| Discover | Marketplace | Buyers browse products and add them to Cart. No payment is initiated here. |
| Review and pay | Cart | The buyer selects items, confirms delivery information and phone number, and starts M-Pesa checkout. |
| Order follow-up | Orders / Company Orders | Buyers track, cancel eligible unpaid orders, view receipts, and follow delivery. Sellers accept, process, ship, or cancel their orders. There is no normal pay button here. |
| Dispatch | Dispatch Board | Admin creates or assigns delivery work; the transporter accepts and updates the handover journey. |
| Delivery confirmation | Dispatch Board and Orders | Delivery proof plus the buyer's OTP confirm handover. An unresolved problem goes to admin dispute review. |
| Payout | Admin operations | A paid delivered order stays protected until the required delivery sign-off and operational review are complete. |

Important current behavior:

- Selected Cart items create **separate product orders**. M-Pesa sends **one STK prompt per order**, and the buyer must approve each prompt.
- If an M-Pesa prompt cannot start, the unpaid order remains visible in Orders so the buyer can cancel it before adding the product to Cart again.
- Buyers can cancel only eligible unpaid, unshipped orders. A paid cancelled order follows the refund/dispute workflow rather than an ordinary cancellation.
- The current checkout flow uses AgriLink county-office pickup/delivery details and calculates delivery charges from the selected route.
- Sandbox or mock M-Pesa payment status is not proof of a real production payment. See the production payment checklist below before accepting real money.

## Other Workspaces

| Workspace | Who uses it | Purpose |
| --- | --- | --- |
| Services Hub | Farmers and companies | Entry point for operational services and role-relevant platform tools. |
| Performance | Farmers and companies | Tracks business/farm activity, order performance, and operational signals available to the account. |
| Crop Calendar | Farmers | Plans crop events and seasonal farm activity. |
| Deal Matches | Farmers | Surfaces relevant demand and trade opportunities from available platform information. |
| Community and Discover | Authenticated users | Share and discover agricultural activity, opportunities, and community content within the role permissions. |
| Micro-Loans | Farmers | Handles loan application, repayment, and loan-status journeys. Some plan features may require Pro access. Admin offers target a selected Kenyan county or all Kenyan counties. |
| Risk & Credit | Companies and eligible users | Shows risk/credit-related records and tools; administrators manage the corresponding governance workflows. |
| Verification | Applicants and administrators | Collects identity/company verification information and provides admin review queues. |
| Notifications and Activity | All authenticated users | Shows actionable changes, status updates, assignments, and an account activity trail. The sidebar shows unread notification and message counts; Cart shows its current total item quantity. |

Features shown as Pro in the user interface still enforce their access rule in the backend. A display badge is guidance, not authorization.

Administrators can remove an inappropriate or duplicate generated item from the shared Activity timeline. This hides the timeline entry without deleting the underlying order, product, loan, profile, or audit record, and the moderation action is itself recorded in `admin_audit_logs`.

## AI Crop Scanner

The scanner accepts a crop image and returns a structured, cautious assessment:

- Supported formats: JPEG, PNG, and WebP
- Upload limit: 8 MB
- API access: `farmer_pro`, `company`, and `admin`; the current dashboard page is linked from the farmer workspace
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

In Supabase, also complete these operational settings before inviting real users:

- Configure the authentication Site URL and allowed redirect URLs for the deployed Vercel application and local development.
- Keep email confirmation and password-reset links pointed only at allowed AgriLink origins.
- In **Authentication > Password Security**, require a minimum of 8 characters with uppercase, lowercase, numeric, and special characters. The signup form checks the same rules before it submits, but Supabase must enforce them too for requests that bypass the browser.
- Keep Row Level Security enabled for every application table and Storage bucket. The browser uses only the publishable/anonymous key; the service-role key is backend-only.
- Bootstrap the first administrator only from the Supabase SQL Editor using a project-owner account. After that, use the protected Administration > User Roles workflow for role changes and retain the audit trail.

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

The Vite configuration uses `http://localhost:8080` by default and calls the backend at `http://127.0.0.1:3001/api`.

## Environment Variables

Never commit real credentials. `.env` files are ignored by Git; production values belong in the Render and Vercel dashboards.

### Backend: `backend/.env`

```dotenv
DJANGO_DEBUG=true
DJANGO_SECRET_KEY=generate-a-long-random-value
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
CLIENT_ORIGIN=http://localhost:8080

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

`VITE_SUPABASE_ANON_KEY` is also accepted for existing installations, but `VITE_SUPABASE_PUBLISHABLE_KEY` is the preferred name. Only values beginning with `VITE_` are exposed to the browser. The Supabase anonymous/publishable key is expected to be public; it is protected by Supabase Row Level Security. No administrative key belongs here.

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

## Production Readiness And Operations

### Production Configuration Checklist

Before opening the platform to real users, confirm all of the following:

| Area | Required production state |
| --- | --- |
| Frontend | Vercel has the production `VITE_API_URL`, Supabase URL, and publishable key, followed by a fresh deployment. |
| Backend | Render has every server-only environment variable, `DJANGO_DEBUG=false`, the exact `DJANGO_ALLOWED_HOSTS`, and the exact Vercel `CLIENT_ORIGIN`. |
| CORS and redirects | No wildcard production origin. Supabase Site URL, redirect URLs, Django `CLIENT_ORIGIN`, and Vercel domain must agree exactly, without an extra trailing slash. |
| Database | `setup_database.sql` and any Django migrations are applied to the production Supabase project. RLS remains enabled. |
| Authentication | Email/password provider, confirmation/reset redirect URLs, password rules, and rate limits are configured in Supabase Auth. Test sign-up, sign-in, sign-out, password reset, and an expired session. |
| Payments | Use sandbox/mock mode only for testing. For live payments, set `MPESA_ENV=live`, `MPESA_MOCK_MODE=false`, live Daraja credentials, the production shortcode/passkey, and a public HTTPS callback URL. Test the whole callback and payment-status path with an approved production test transaction before accepting customer payments. |
| AI scanner | Set `GEMINI_API_KEY` only in Render and keep `GEMINI_MODEL=gemini-2.5-flash`. Never expose the Gemini key in Vercel or browser code. Check Render logs for quota, permission, or timeout errors after a test crop scan. |
| Delivery | Assign a test transporter, exercise pickup, in-transit, delivery proof, buyer OTP handover, dispute review, and final payout release. |
| Security | Rotate any secret ever pasted into a chat, commit, screenshot, terminal capture, or public document. Review Supabase users, role assignments, RLS policies, and audit logs. |

### M-Pesa Modes

The repository's Render Blueprint starts with `MPESA_ENV=sandbox` and `MPESA_MOCK_MODE=true`. That configuration is deliberately for development and demonstration; it must not be described to customers as a real payment service.

For a live rollout, platform operators must switch to live credentials and a verified public callback URL, then monitor callback failures and pending payments. The `resolve_stuck_payments` command below helps reconcile records left pending after a callback or network problem; it does not replace Daraja reconciliation or financial controls.

### AI Scanner Operations

The crop scanner calls Gemini from Django, never from the browser. It accepts JPEG, PNG, and WebP only, limits uploads to 8 MB, asks `gemini-2.5-flash` for structured agricultural guidance, and has a lighter-model fallback for an eligible upstream failure.

Gemini quotas, billing limits, invalid API keys, and upstream timeouts can still prevent an answer. The scanner records a cautious fallback instead of inventing a diagnosis. Inspect Render application logs for `Gemini crop scan request failed` to see the upstream status and message; do not log API keys or raw user passwords.

### Health Checks And Service Sleep

`GET /health` returns quickly and performs no Supabase database call. It is the correct endpoint for Render health checks and an external uptime monitor.

Render free services can sleep after inactivity, so the first request may take roughly a minute while the process starts. A monitor such as cron-job.org can request `https://your-render-service.onrender.com/health` periodically without consuming scanner or Supabase database work. Paid Render plans avoid this free-instance sleep behavior.

### Support And Incident Handling

- **A user cannot sign in:** verify the email/password in Supabase Auth, confirmation state, redirect URLs, and Supabase Auth rate-limit settings. Never ask a user to send their password to support.
- **A role looks wrong:** inspect the protected Administration > User Roles page and audit logs. Role changes require a fresh role/profile refresh or a new sign-in before every interface updates.
- **A marketplace payment is pending:** keep the user in the order record, check the M-Pesa status endpoint and Render callback logs, then use the payment-resolution command where appropriate.
- **A delivery handover is disputed:** do not release payout automatically. Review delivery proof, coordinates, OTP attempt history, messages, and the dispute record from the Administration area.
- **The scanner says it is unavailable:** inspect Render scanner logs for the Gemini HTTP status. A `429` generally means quota/rate limit; an empty timeout points to an upstream network/API wait; a `401` or `403` points to an invalid or restricted key.

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
