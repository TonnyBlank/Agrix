# AgriLink X Frontend

The frontend is a React 18, TypeScript, and Vite application for farmers, companies, transporters, buyers, and administrators. It provides the role-aware dashboard, marketplace, cart, orders, messages, operations tools, and AI crop-scanner experience.

## Run Locally

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Useful commands:

```bash
npm run typecheck
npm run build
npm run lint
npm test
```

## Environment

Create `frontend/.env`:

```dotenv
VITE_API_URL=http://127.0.0.1:3001/api
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

Only `VITE_` variables are made available in browser code. Do not add Gemini, Supabase service-role, M-Pesa, Django, or delivery secrets to this file.

## Authentication

The application uses Supabase email/password authentication. Browser sessions are held in memory, not persisted in `localStorage`, to reduce the impact of a successful same-origin XSS attack. Signing in is required again after a full reload or browser restart.

The frontend includes the Supabase access token as a bearer token when calling protected backend endpoints. The backend is the authority for token validation and role authorization.

## Production on Vercel

This repository deploys from the root using [vercel.json](../vercel.json):

```text
Install Command: cd frontend && npm ci
Build Command: cd frontend && npm run build
Output Directory: frontend/dist
```

Set the following Vercel environment variables and redeploy after any change:

```dotenv
VITE_API_URL=https://agrix-bavp.onrender.com/api
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

`VITE_API_URL` must point to the deployed Render API, use HTTPS, include `/api`, and never point to `localhost` in production.

## Key Directories

| Location | Responsibility |
| --- | --- |
| `src/pages/` | Dashboard pages and full application views. |
| `src/pages/dashboard/AIScanner.tsx` | Crop image selection, scan submission, and diagnosis display. |
| `src/integrations/supabase/` | Supabase client and generated types. |
| `src/lib/api.ts` | Backend HTTP client configuration. |
| `src/components/` | Shared UI and workflow components. |

See the root [README](../README.md) for the full system and deployment guide.
