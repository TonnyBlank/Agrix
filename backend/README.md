# AgriLink X Backend

The backend runtime is now Python + Django.

It keeps the existing REST API shape used by the frontend while continuing to use Supabase for auth, data, storage, and admin user management. That keeps the migration focused on the server framework instead of forcing a database rewrite at the same time.

## Quick Start

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Run the backend:

```bash
npm run start
```

Optional attached development server:

```bash
npm run dev
```

Health check:

```text
http://localhost:3001/health
```

## Gemini Crop Scanner

The crop scanner can use Gemini when you add these values to `backend/.env`:

```text
GEMINI_API_KEY=your-google-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
```

If `GEMINI_API_KEY` is not set, the scanner falls back to the built-in heuristic response.

## What Changed

- FastAPI is replaced by Django
- Supabase remains the system of record
- Existing `/api/*` frontend routes are preserved
- M-Pesa flow is supported with sandbox/mock fallback
- `main.py` now exposes the Django ASGI application for `uvicorn` compatibility

## Main Route Groups

- `/api/products`
- `/api/scanner/crops`
- `/api/orders`
- `/api/messages`
- `/api/crop-events`
- `/api/profiles`
- `/api/id-verification`
- `/api/micro-loans`
- `/api/payments`
- `/api/admin`

## Notes

- The active Django project lives in `backend/config/`.
- `backend/manage.py` is the standard development entrypoint.
- `backend/main.py` is kept as a small ASGI shim for compatibility with existing process commands.

---

For overall project documentation, see the [Root README](../README.md).
