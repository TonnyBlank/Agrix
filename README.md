# AgriLink X

AgriLink X is an agriculture platform that combines farmer tooling, a produce marketplace, micro-loans, company sourcing workflows, and admin verification into one product.

## Overview

The project is split into two apps:

- `frontend/`: React + Vite + Tailwind dashboard and public product UI
- `backend/`: Django API layer that keeps the existing REST shape while using Supabase for auth, data, storage, and admin workflows

## Current Product Areas

- AI crop scanner with Gemini support and fallback diagnostics
- Farmer dashboards for profile, farm operations, products, messaging, and loans
- Farm GPS capture on `My Farm`, so farmers can save the real farm point from browser geolocation
- Marketplace flows for listings, ordering, and delivery confirmation
- Company workflows for:
  - onboarding
  - company dashboard
  - product catalog
  - farmer partnerships
  - procurement requests
  - order tracking
- Admin workflows for:
  - user management
  - company verification
  - loan review and decisions

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion, React Leaflet
- Backend: Django 5, Python, uvicorn
- Platform services: Supabase Auth, Postgres, Storage

## Local Setup

### Prerequisites

- Node.js 18+
- Python 3.9+
- A Supabase project with the required env values

### 1. Clone the repository

```bash
git clone <repository-url>
cd Agrilink-X-main
```

### 2. Backend setup

```bash
cd backend
python -m venv .venv
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

### 4. Run both apps

Backend:

```bash
cd backend
python manage.py runserver
```

Frontend:

```bash
cd frontend
npm run dev
```

### 5. Open locally

- Frontend: `http://localhost:8080`
- Backend health check: `http://127.0.0.1:3001/health`

## Database Notes

The repo already includes SQL and migrations for the major profile and company features, including:

- extended farmer profile fields
- `farm_gps_lat` and `farm_gps_lng`
- companies
- company products
- company orders
- farmer-company relations
- company contracts
- company procurement requests

Relevant schema files include:

- `setup_database.sql`
- `add_farm_details.sql`
- `supabase/migrations/`
- `frontend/supabase/migrations/`

## Key Folders

- `frontend/src/pages/`: route-level pages
- `frontend/src/components/`: reusable UI and dashboard components
- `frontend/src/hooks/`: auth and feature hooks
- `backend/api/`: route handlers and business logic
- `backend/config/`: Django settings and URL config
- `supabase/` and `frontend/supabase/`: SQL migrations

## Development Notes

- The backend defaults to `127.0.0.1:3001`
- The frontend automatically targets port `3001` for API calls during local dev when running on port `8080`
- The company dashboard and admin company verification pages depend on the company tables being present in Supabase
- The farm map prefers saved GPS coordinates when present and falls back to county/sub-county geocoding for display

## Quick Commands

Backend checks:

```bash
cd backend
.venv/bin/python manage.py check
```

Frontend build:

```bash
cd frontend
npm run build
```

Frontend tests:

```bash
cd frontend
npm run test
```

## Related Docs

- [Backend README](./backend/README.md)
- [Frontend README](./frontend/README.md)
