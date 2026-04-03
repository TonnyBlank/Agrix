# AgriLink X Frontend

The frontend for AgriLink X is built with React, Vite, and Tailwind CSS, featuring a premium design system called **"Forest Glass"**.

## 🛠 Tech Stack

- **Framework**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [Shadcn UI](https://ui.shadcn.com/) (Radix UI)
- **State Management**: [TanStack Query](https://tanstack.com/query/latest) (React Query)
- **Routing**: [React Router v6](https://reactrouter.com/)
- **State/Auth Hooks**: Custom hooks for Supabase integration.
- **Icons**: [Lucide React](https://lucide.dev/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the `frontend/` directory (use `.env.example` as a template):
```text
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. Run Development Server
```bash
npm run dev
```
The app will be available at `http://localhost:8080`.

## 📂 Key Directories

- `src/components/`: Reusable UI components, layout shells, and dashboard features.
- `src/pages/`: Main application pages (Dashboard, Marketplace, AI Scanner, etc.).
- `src/hooks/`: Custom React hooks for authentication, data fetching, and more.
- `src/lib/`: Utility functions and third-party configurations.
- `src/types/`: TypeScript definitions for the project's data models.

## 🎨 Design System

AgriLink X uses a custom theme configured in `tailwind.config.ts`.
- **Primary Color**: Emerald-500 (#10b981)
- **Secondary Color**: Gold-gradient for premium features.
- **Typography**: Display fonts for headers and sans-serif for readability.
- **Glassmorphism**: Subtle backdrops and blurs used in dashboard cards.

---

For overall project documentation, see the [Root README](../README.md).
