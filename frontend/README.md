# AgriLink X Frontend

The frontend is the React + Vite application for AgriLink X. It powers the public landing site and the authenticated dashboards for farmers, companies, buyers, and admins.

AgriLink X is built for mixed agriculture: crops, poultry, eggs, livestock, dairy, fish, honey, farm inputs, services, trade, logistics, finance, and AI-assisted intelligence.

## Stack

- React 18
- Vite
- TypeScript
- Tailwind CSS
- shadcn/ui and Radix UI
- Framer Motion
- React Router
- TanStack Query
- React Leaflet
- Supabase JS
- Capacitor Android dependencies are present for future native packaging

## Main Frontend Areas

### Public Site

- landing hero
- features
- services
- agricultural intelligence
- pricing
- auth entry points

The public messaging positions AgriLink X as a full agriculture operating system, not only a crop marketplace.

### Farmer Dashboard

- dashboard home
- Services Hub
- My Farm profile and GPS mapping
- mixed-enterprise profile data
- products/listings
- marketplace
- cart
- orders
- messages
- crop calendar
- AI scanner
- micro-loans
- deal matches
- analytics and community surfaces

### Company Dashboard

- company hub
- company profile and settings
- product catalog
- farmer partners
- procurement requests
- procurement response review
- company orders
- Services Hub

### Admin Dashboard

- users and roles
- ID verification
- company verification
- loans and decisions
- transactions
- orders and payout review
- feature flags
- audit logs

## Services Hub

The Services Hub is the primary mixed-agriculture command center.

It is arranged as:

1. executive summary
2. key metrics
3. AI priority signals
4. operating modules
5. commodity coverage
6. operations detail: GMCIS, market supply, and movement queue

The hub uses live local state from:

- authenticated profile
- products/listings
- orders
- marketplace supply
- weather lookup
- GPS/profile readiness
- storage and transport signals

It supports crops, poultry, eggs, livestock, dairy, fish, honey, inputs, and services.

## Environment Variables

Create `frontend/.env` from `frontend/.env.example`.

Minimum:

```text
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_API_URL=http://127.0.0.1:3001/api
```

The anon key is safe for the browser when Supabase RLS is configured correctly. Never put the Supabase service role key in the frontend.

## Setup

From the repository root:

```bash
cd frontend
npm install
cp .env.example .env
```

For a fresh Supabase project, run the root setup SQL first:

```text
../setup_database.sql
```

## Run Locally

```bash
npm run dev -- --host 127.0.0.1 --port 8080
```

Local URL:

```text
http://localhost:8080
```

If port `8080` is busy, choose another Vite port.

## Scripts

```bash
npm run dev
npm run build
npm run build:dev
npm run preview
npm run lint
npm run test
npm run test:watch
```

## Important Files

- `src/App.tsx` - route wiring and protected dashboards
- `src/pages/dashboard/ServiceHub.tsx` - mixed-agriculture Services Hub
- `src/pages/dashboard/MyFarm.tsx` - farm profile, enterprise data, and GPS mapping
- `src/pages/dashboard/Marketplace.tsx` - marketplace browsing and order entry
- `src/pages/dashboard/Cart.tsx` - persisted cart and checkout handoff
- `src/pages/dashboard/MicroLoans.tsx` - financing workflow
- `src/pages/dashboard/CompanyDashboard.tsx` - company workspace
- `src/components/dashboard/AppSidebar.tsx` - role-aware navigation
- `src/hooks/` - auth, products, orders, weather, messages, and feature hooks
- `src/lib/api.ts` - backend API client
- `src/integrations/supabase/` - Supabase client and generated database types

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```

Known non-blocking warnings may include React Fast Refresh warnings, hook dependency warnings, and a Vite chunk-size warning. The build and typecheck should still pass.

For the complete product, setup, market comparison, and backend notes, see the [root README](../README.md).
