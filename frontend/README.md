# AgriLink X Frontend

The frontend is a React + Vite application for farmers, companies, buyers, and admins. It powers the public landing experience and the authenticated dashboard flows.

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

## Main Frontend Areas

- landing pages and authentication
- farmer dashboard flows:
  - my farm
  - marketplace
  - crop scanner
  - products
  - orders
  - messages
  - micro-loans
- company dashboard flows:
  - company hub
  - products
  - partners
  - procurement
  - orders
  - settings
- admin flows:
  - users
  - company verification
  - loans and decisions

## Notable UX Features

- premium "Forest Glass" dashboard styling
- role-aware dashboard routing
- real farm GPS capture on `My Farm`
- map display with saved farm coordinates
- company command-center dashboard layout
- responsive layouts for desktop and mobile

## Setup

```bash
cd frontend
npm install
cp .env.example .env
```

## Environment Variables

At minimum:

```text
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Optional:

```text
VITE_API_URL=http://127.0.0.1:3001/api
```

If `VITE_API_URL` is not set, the app auto-resolves the backend during local development.

## Run Locally

```bash
npm run dev
```

Default dev URL:

```text
http://localhost:8080
```

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run test
npm run test:watch
npm run lint
```

## Project Structure

- `src/pages/`: route-level pages
- `src/components/`: reusable UI and dashboard blocks
- `src/hooks/`: feature and auth hooks
- `src/lib/`: API helpers, utilities, and configuration
- `src/integrations/supabase/`: generated Supabase types and client
- `public/`: static assets

## Development Notes

- The API helper targets the Django backend on port `3001` during local dev
- Company pages expect the company schema and procurement schema to exist in Supabase
- The `My Farm` page stores farm GPS coordinates in the user profile when available
- The map view prefers saved GPS coordinates over plain county geocoding

## Verification

Build the frontend:

```bash
npm run build
```

Run tests:

```bash
npm run test
```

For overall project documentation, see the [root README](../README.md).
