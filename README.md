# AgriLink X

**AgriLink X** is a comprehensive digital ecosystem that combines an intelligent agricultural marketplace, flexible micro-financing, and advanced farm management. Connect directly with verified buyers, secure your transactions with smart escrow, and scale your profits.

## 🌾 About AgriLink X

AgriLink X serves as a comprehensive digital ecosystem for the modern agricultural landscape. By bridging the gap between traditional farming and high-end technology, the platform addresses critical challenges in crop health, market access, and financial inclusion. It provides actionable tools that help farmers grow better, secure financing, sell faster, and thrive financially.

## 🏆 Why AgriLink X?

AgriLink X stands out through its practical implementation of complex workflows tailored for the agricultural sector:

- **Unified Digital Ecosystem**: Combines AI crop diagnostics, micro-financing (with guarantor support), and a full-scale marketplace into a single, seamless experience.
- **Gemini-Powered Diagnostics**: The AI Crop Scanner integrates with **Google Gemini**, providing automated pest and disease identification to help farmers act before losses occur.
- **Comprehensive Farm Profiling**: Farmers can record detailed agricultural data (farm size, soil type, irrigation methods, and experience) which the system uses to evaluate loan eligibility.
- **Resilient Architecture**: Features a robust authentication system with guest-friendly mock-profile fallbacks, ensuring the dashboard remains accessible even without fully initialized data.
- **Premium "Forest Glass" Experience**: A custom design system that reduces cognitive load, making sophisticated farm data accessible and beautiful.

## 🛡 Trusted Transaction Flow

The marketplace runs on a sophisticated escrow and verification system to ensure safety for both farmers and buyers:

- **Secure Escrow**: Buyers do not pay sellers directly. All payments are held securely by AgriLink X until the transaction is successfully completed.
- **Delivery Verification**: Funds are only released to the seller once the buyer has received the goods and provided a digital signature for confirmation.
- **Automated Dispute Resolution**:
    - **Successful Delivery**: The full agreed price is transferred to the seller following digital signature verification.
    - **Buyer Refusal**: If a buyer refuses delivery without a valid claim, **transport costs** and a **refusal penalty** are automatically deducted from their deposited funds before refunding the balance. This ensures sellers and logistics partners are always compensated for their effort.

## 🚀 Key Features

- **AI Crop Scanner**: Powered by Google Gemini AI, offering real-time diagnostics for crop health through user-uploaded images.
- **Micro Loans & Guarantors**: A fully implemented financial portal where farmers can apply for loans, calculate interest, and include guarantors to secure their financing.
- **Dynamic Marketplace**: An e-commerce system allowing farmers to list produce and buyers to place orders backed by our secure escrow logic.
- **Smart Crop Calendar & Farm Management**: Tools to schedule planting seasons and manage daily farm operations.
- **Performance Analytics**: Visual data tracking for revenue and yield trends.
- **Community & Messaging**: Direct communication channels between stakeholders in the supply chain.

## 💸 Innovative Micro-Financing Workflows

AgriLink X actually implements revolutionary lending mechanisms modeled for real-world agricultural financing:

- **"Pay-with-Produce" (In-Kind Repayment) 🌾**: Farmers can pledge a portion of their future harvest instead of cash. When the produce is sold on the AgriLink Marketplace, the escrow system automatically intercepts the transaction, deducts the loan repayment, and forwards the profit to the farmer.
- **The "AgriLink Digital Voucher" System 🎟️**: Loans for specific goods (like "Fertilizer") are disbursed as QR Code digital vouchers rather than cash. Farmers present these vouchers to verified agro-dealers, definitively ensuring the loaned funds are utilized for agricultural purposes.

## 🎨 Design & Experience

AgriLink X features a custom **"Forest Glass"** design system, crafted to feel high-tech yet organic.
- **Premium Palette**: High-contrast emerald and gold-gradient accents for a professional, expensive feel.
- **Glassmorphism**: Subtle backdrops, blurs, and layered elevations that make data easy to digest.
- **Micro-Animations**: Smooth, interactive transitions that provide a "living" interface experience.
- **Mobile-First**: Fully responsive layouts optimized for farmers on the go and enterprise buyers at their desks.



## 📂 Project Structure

The project is divided into two main components:

- `frontend/`: React + Vite + Tailwind CSS + Shadcn UI.
- `backend/`: Python + Django + Supabase (Auth, DB, Storage).

## 🛠 Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Python](https://www.python.org/) (v3.9 or higher)
- [Supabase Account](https://supabase.com/) for authentication and database services.

## 🏁 Quick Start

### 1. Clone the repository
```bash
git clone <repository-url>
cd Agrilink-X-main
```

### 2. Install dependencies and environment files
Backend setup:
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Frontend setup:
```bash
cd ..\frontend
npm install
copy .env.example .env
```

### 3. Run the app
Use two terminals from the repo root after setup is complete.

Terminal 1 - backend:
```bash
cd backend
npm run start
```

Terminal 2 - frontend:
```bash
cd frontend
npm run dev
```

Windows one-command option:
```powershell
.\start-local.ps1
```

### 4. Open the app
- Frontend: `http://localhost:8080`
- Backend health check: `http://127.0.0.1:3001/health`

### 5. Verified local run
This repository was run locally with:

```bash
cd backend
npm run start
```

```bash
cd frontend
npm run dev
```


## 🎨 Design Philosophy

AgriLink X follows a **"Forest Glass"** design system, focusing on:
- High-contrast emerald and gold color palettes.
- Ultra-rounded corners and glassmorphism effects.
- Dynamic micro-animations for a premium user experience.
- Mobile-first responsive layouts.

---
# Agrilink-X-
