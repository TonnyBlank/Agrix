# AgriLinkX Polish & Consistency Plan

The repo has three apps: `frontend/` (web React + Vite), `mobile/` (React Native / Expo), `backend/` (Django/Python). The goal is a polished, consistent product across web + mobile, on par with leading Kenyan agri-platforms (Twiga, Apollo, DigiFarm, iProcure).

Because the scope is huge, I'll split this into 4 phases. After you approve, I'll execute Phase 1, show you results, then move on.

---

## Phase 1 — Foundation audit (read-only, no code changes)

1. Map current state of `frontend/` (routes, key components, design tokens in `tailwind.config.ts` + `index.css`).
2. Map current state of `mobile/` (screens, navigation, theme.ts).
3. Identify inconsistencies between web and mobile:
   - Colors / typography / spacing
   - Terminology (e.g. "Listings" vs "Products", "Buyer" vs "Company")
   - Marketplace flow (browse → product → cart → checkout → order)
   - Auth & profile fields
4. Identify broken / unfinished screens, runtime errors, TODO items in `TODO.md`.
5. Deliver a short written audit report. **No code changes in this phase.**

## Phase 2 — Shared design system + mobile theme alignment

1. Extract the web's green brand palette and typography into `mobile/src/theme.ts` so colors, radii, spacing, and font weights match.
2. Build a small shared component kit on mobile (Button, Card, Input, Chip, Badge, EmptyState, SectionHeader) mirroring shadcn equivalents on web.
3. Refactor 2–3 highest-impact mobile screens (Dashboard, Marketplace, Cart) to use the new kit. Other screens follow in Phase 3.

## Phase 3 — Marketplace polish (web + mobile in parallel)

Web (`frontend/src/pages/dashboard/Marketplace.tsx` + supporting components):
- Better product card (cover image, organic badge, price/unit, location, seller chip)
- Filters: category, county, price range, organic toggle, search
- Empty / loading / error states
- Sticky cart summary

Mobile (`mobile/src/screens/Marketplace.tsx` + `Products.tsx` + `Cart.tsx`):
- Match web product card layout
- Same filter set
- Add-to-cart parity
- Checkout flow parity with web

## Phase 4 — Remaining mobile screens + final consistency sweep

- Apply theme + component kit to: Activity, Calendar, Discover, Farm, Messages, Notifications, Orders, Scanner.
- Verify terminology parity with web.
- Smoke-test critical flows: signup → list product → buy → order → message.
- Fix any runtime errors surfaced during testing.

---

## What I will NOT touch (unless you tell me to)

- Backend API contracts (`backend/api/*`) — only consume what's already there.
- Auth flow logic.
- Database migrations.
- Payments integration (Stripe/M-Pesa) wiring.
- Admin dashboard internals.

## Open questions

1. Should the brand stay green (`#0f5c2e` / gold accent) or do you want a refresh?
2. Any reference apps you want me to study (Twiga, Apollo, DigiFarm, iProcure, Jumia)?
3. Is there a deadline / single most important screen to nail first?

---

**Next step if you approve:** I start Phase 1 (audit only, no code changes) and report back with findings + recommended Phase 2 changes for your approval.
