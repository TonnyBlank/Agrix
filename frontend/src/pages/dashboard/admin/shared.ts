import { supabase } from "@/integrations/supabase/client";
import { getStoredRole } from "@/lib/subscription";
import { API_BASE_URL } from "@/lib/api";

export type AppRole = "farmer_free" | "farmer_pro" | "company" | "transporter" | "admin";
export type LoanRole = "farmer_pro" | "company";
export type LoanProductType = "seasonal_working_capital" | "equipment_top_up" | "buyer_contract_financing";
export type LoanSecurityType = "unsecured" | "guarantor" | "collateral";
export type BranchVisitStatus = "not_required" | "pending_customer_visit" | "documents_received" | "valuation_pending" | "verified" | "waived";
export type DeliverySignoffStatus = "pending_proof" | "pending_buyer_confirmation" | "confirmed" | "disputed" | "waived_by_admin";
export type AdminTone = "sky" | "emerald" | "amber" | "violet" | "rose" | "slate";

export type AdminCollateralItem = {
  asset_type: string;
  description?: string | null;
  owner_name?: string | null;
  document_reference?: string | null;
  estimated_value?: number | null;
  location?: string | null;
  notes?: string | null;
};

export type AdminOverview = {
  usersCount: number;
  productsCount: number;
  ordersCount: number;
  loansCount: number;
  pendingLoansCount: number;
  pendingVerificationsCount: number;
  adminCount: number;
  totalApprovedLoanValue: number;
};

export type AdminUser = {
  user_id: string;
  full_name: string | null;
  county: string | null;
  phone: string | null;
  created_at: string;
  email: string | null;
  role: AppRole;
};

export type AdminUserSummary = {
  user: {
    user_id: string;
    email: string | null;
    phone: string | null;
    email_confirmed_at: string | null;
    phone_confirmed_at: string | null;
    last_sign_in_at: string | null;
    created_at: string | null;
    role: AppRole;
    roles: AppRole[];
  };
  profile: {
    user_id: string;
    full_name: string | null;
    phone: string | null;
    county: string | null;
    bio: string | null;
    farm_size: string | null;
    main_crops: string[] | null;
    farm_type: string | null;
    irrigation_type: string | null;
    soil_type: string | null;
    years_farming: number | null;
    has_storage: boolean | null;
    has_transport: boolean | null;
    cooperative_name: string | null;
    farm_gps_lat: number | null;
    farm_gps_lng: number | null;
    photo_url: string | null;
    payout_method: string | null;
    payout_mpesa_number: string | null;
    bank_name: string | null;
    bank_account_name: string | null;
    bank_account_number: string | null;
    plan_started_at: string | null;
    plan_expires_at: string | null;
    created_at: string | null;
    updated_at: string | null;
  } | null;
  id_verification: {
    id: string;
    status: string;
    reviewer_note: string | null;
    submitted_at: string | null;
    reviewed_at: string | null;
    front_doc_url: string | null;
    back_doc_url: string | null;
    doc_url: string | null;
    created_at: string | null;
  } | null;
  company: {
    id: string;
    company_name: string | null;
    company_type: string | null;
    verification_status: string | null;
    verified: boolean | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    headquarters_location: string | null;
    service_areas: string[] | null;
    created_at: string | null;
    updated_at: string | null;
  } | null;
  stats: {
    products_count: number;
    selling_orders_count: number;
    buying_orders_count: number;
    loan_applications_count: number;
    loan_repayments_count: number;
    crop_events_count: number;
    conversations_count: number;
  };
  recent: {
    products: Array<{
      id: string;
      name: string;
      category: string | null;
      price_per_unit: number;
      unit: string | null;
      stock: number;
      is_available: boolean | null;
      created_at: string;
      updated_at: string;
    }>;
    selling_orders: AdminOrder[];
    buying_orders: AdminOrder[];
    loan_applications: Array<{
      id: string;
      applicant_role: string;
      product_title: string;
      requested_amount: number;
      approved_amount: number | null;
      status: string;
      security_type: string | null;
      requires_branch_visit: boolean | null;
      branch_visit_status: string | null;
      target_county: string | null;
      created_at: string;
      updated_at: string;
    }>;
    loan_repayments: Array<{
      id: string;
      loan_application_id: string;
      amount: number;
      payment_method: string | null;
      payment_ref: string | null;
      created_at: string;
    }>;
    crop_events: Array<{
      id: string;
      title: string;
      crop: string;
      type: string;
      event_date: string;
      done: boolean;
      created_at: string;
      updated_at: string;
    }>;
  };
};

export type AdminLoan = {
  id: string;
  product_title: string;
  product_type: LoanProductType;
  requested_amount: number;
  approved_amount: number | null;
  interest_rate: number | null;
  repayment_days: number | null;
  status: string;
  note: string | null;
  guarantors: Array<Record<string, unknown>>;
  security_type: LoanSecurityType;
  requires_branch_visit: boolean;
  branch_name: string | null;
  branch_location: string | null;
  target_county: string | null;
  branch_instructions: string | null;
  branch_visit_status: BranchVisitStatus;
  collateral_types: string[];
  required_documents: string[];
  collateral_items: AdminCollateralItem[];
  created_at: string;
  profile: {
    full_name: string | null;
    county: string | null;
  } | null;
};

export type AdminLoanOffer = {
  id: string;
  applicant_role: LoanRole;
  product_type: LoanProductType;
  product_title: string;
  max_amount: number;
  interest_rate: number | null;
  repayment_days: number | null;
  speed: string | null;
  note: string | null;
  security_type: LoanSecurityType;
  requires_branch_visit: boolean;
  branch_name: string | null;
  branch_location: string | null;
  target_county: string | null;
  branch_instructions: string | null;
  collateral_types: string[];
  required_documents: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminLoanCandidate = {
  user_id: string;
  full_name: string | null;
  county: string | null;
  phone: string | null;
  role: LoanRole;
  eligibleAmount: number;
  averageMonthlyRevenue: number;
  totalQualifiedOrders: number;
};

export type AdminOrder = {
  id: string;
  status?: string;
  total_price: number;
  delivery_fee?: number | null;
  delivery_distance_km?: number | null;
  delivery_mode?: string | null;
  pickup_county?: string | null;
  pickup_office_label?: string | null;
  delivery_disclaimer?: string | null;
  payment_status: string;
  payment_ref?: string | null;
  paid_at?: string | null;
  payment_verification_started_at?: string | null;
  payment_verified_at?: string | null;
  escrow_amount?: number | null;
  agrilink_commission_rate?: number | null;
  agrilink_commission_amount?: number | null;
  seller_payout_amount?: number | null;
  payout_status?: string | null;
  escrow_received_at?: string | null;
  delivery_proof_photo_url?: string | null;
  delivery_proof_geo_lat?: number | null;
  delivery_proof_geo_lng?: number | null;
  delivery_proof_submitted_at?: string | null;
  delivery_proof_submitted_by?: string | null;
  delivery_proof_note?: string | null;
  buyer_delivery_otp_requested_at?: string | null;
  buyer_delivery_otp_expires_at?: string | null;
  buyer_delivery_otp_verified_at?: string | null;
  buyer_delivery_otp_attempts?: number | null;
  delivery_signoff_status?: DeliverySignoffStatus | string | null;
  dispute_reason?: string | null;
  dispute_opened_at?: string | null;
  dispute_opened_by?: string | null;
  dispute_resolved_at?: string | null;
  dispute_resolution_note?: string | null;
  dispute_deadline_at?: string | null;
  official_verified_at?: string | null;
  official_verified_by?: string | null;
  official_note?: string | null;
  payout_released_at?: string | null;
  created_at: string;
  product: { name: string | null } | null;
  buyer_profile: { full_name: string | null } | null;
  farmer_profile: { full_name: string | null } | null;
};

export type AdminAnalytics = {
  orderTrend: { month: string; orders: number; revenue: number }[];
  cropDemand: { crop: string; orders: number; quantity: number; revenue: number }[];
  topCrop: { crop: string; orders: number; quantity: number; revenue: number } | null;
};

export type AdminVerification = {
  id: string;
  user_id: string;
  status: "unverified" | "pending" | "pending_review" | "verified" | "rejected";
  reviewer_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  front_doc_url: string | null;
  back_doc_url: string | null;
  doc_url: string | null;
  created_at: string;
  profile: {
    user_id: string;
    full_name: string | null;
    county: string | null;
    phone: string | null;
  } | null;
};

export type AdminFeatureFlag = {
  id: string;
  feature_key: string;
  enabled_for: AppRole[];
  description: string | null;
  created_at: string;
};

export type AdminAuditLog = {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_profile: {
    user_id: string;
    full_name: string | null;
  } | null;
};

export type LoanOfferFormState = {
  applicant_role: LoanRole;
  product_type: LoanProductType;
  product_title: string;
  max_amount: string;
  interest_rate: string;
  repayment_days: string;
  speed: string;
  note: string;
  security_type: LoanSecurityType;
  requires_branch_visit: boolean;
  branch_name: string;
  branch_location: string;
  target_county: string;
  branch_instructions: string;
  collateral_types_input: string;
  required_documents_input: string;
};

export const ROLE_OPTIONS: AppRole[] = ["farmer_free", "farmer_pro", "company", "transporter", "admin"];
export const LOAN_STATUS_OPTIONS = ["pending_review", "approved", "rejected", "disbursed", "repaid"];
export const BRANCH_VISIT_STATUS_OPTIONS: BranchVisitStatus[] = ["not_required", "pending_customer_visit", "documents_received", "valuation_pending", "verified", "waived"];
export const LOAN_SECURITY_OPTIONS: LoanSecurityType[] = ["unsecured", "guarantor", "collateral"];
export const LOAN_PRODUCT_TITLES: Record<LoanProductType, string> = {
  seasonal_working_capital: "Seasonal Working Capital",
  equipment_top_up: "Equipment Top-Up",
  buyer_contract_financing: "Buyer Contract Financing",
};

export const initialLoanOfferForm: LoanOfferFormState = {
  applicant_role: "farmer_pro",
  product_type: "seasonal_working_capital",
  product_title: LOAN_PRODUCT_TITLES.seasonal_working_capital,
  max_amount: "",
  interest_rate: "",
  repayment_days: "",
  speed: "",
  note: "",
  security_type: "unsecured",
  requires_branch_visit: false,
  branch_name: "",
  branch_location: "",
  target_county: "",
  branch_instructions: "",
  collateral_types_input: "",
  required_documents_input: "",
};

const ADMIN_TONES: Record<
  AdminTone,
  {
    card: string;
    softPanel: string;
    iconWrap: string;
    icon: string;
    badge: string;
    badgeStrong: string;
  }
> = {
  sky: {
    card: "border-sky-200/80 bg-[linear-gradient(135deg,rgba(240,249,255,0.98),rgba(255,255,255,0.94))] shadow-[0_18px_36px_-28px_rgba(14,165,233,0.36)] dark:border-sky-500/25 dark:bg-[linear-gradient(135deg,rgba(14,165,233,0.16),rgba(15,23,42,0.94))]",
    softPanel: "border-sky-200/80 bg-sky-50/80 dark:border-sky-500/20 dark:bg-sky-500/10",
    iconWrap: "bg-sky-500/15 dark:bg-sky-500/20",
    icon: "text-sky-700 dark:text-sky-300",
    badge: "border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
    badgeStrong: "bg-sky-600 text-white dark:bg-sky-500 dark:text-slate-950",
  },
  emerald: {
    card: "border-emerald-200/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.98),rgba(255,255,255,0.94))] shadow-[0_18px_36px_-28px_rgba(16,185,129,0.32)] dark:border-emerald-500/25 dark:bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(15,23,42,0.94))]",
    softPanel: "border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-500/20 dark:bg-emerald-500/10",
    iconWrap: "bg-emerald-500/15 dark:bg-emerald-500/20",
    icon: "text-emerald-700 dark:text-emerald-300",
    badge: "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
    badgeStrong: "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950",
  },
  amber: {
    card: "border-amber-200/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.98),rgba(255,255,255,0.94))] shadow-[0_18px_36px_-28px_rgba(245,158,11,0.32)] dark:border-amber-500/25 dark:bg-[linear-gradient(135deg,rgba(245,158,11,0.15),rgba(15,23,42,0.94))]",
    softPanel: "border-amber-200/80 bg-amber-50/80 dark:border-amber-500/20 dark:bg-amber-500/10",
    iconWrap: "bg-amber-500/15 dark:bg-amber-500/20",
    icon: "text-amber-700 dark:text-amber-300",
    badge: "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    badgeStrong: "bg-amber-500 text-slate-950 dark:bg-amber-400 dark:text-slate-950",
  },
  violet: {
    card: "border-violet-200/80 bg-[linear-gradient(135deg,rgba(245,243,255,0.98),rgba(255,255,255,0.94))] shadow-[0_18px_36px_-28px_rgba(139,92,246,0.32)] dark:border-violet-500/25 dark:bg-[linear-gradient(135deg,rgba(139,92,246,0.16),rgba(15,23,42,0.94))]",
    softPanel: "border-violet-200/80 bg-violet-50/80 dark:border-violet-500/20 dark:bg-violet-500/10",
    iconWrap: "bg-violet-500/15 dark:bg-violet-500/20",
    icon: "text-violet-700 dark:text-violet-300",
    badge: "border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
    badgeStrong: "bg-violet-600 text-white dark:bg-violet-500 dark:text-slate-950",
  },
  rose: {
    card: "border-rose-200/80 bg-[linear-gradient(135deg,rgba(255,241,242,0.98),rgba(255,255,255,0.94))] shadow-[0_18px_36px_-28px_rgba(244,63,94,0.32)] dark:border-rose-500/25 dark:bg-[linear-gradient(135deg,rgba(244,63,94,0.16),rgba(15,23,42,0.94))]",
    softPanel: "border-rose-200/80 bg-rose-50/80 dark:border-rose-500/20 dark:bg-rose-500/10",
    iconWrap: "bg-rose-500/15 dark:bg-rose-500/20",
    icon: "text-rose-700 dark:text-rose-300",
    badge: "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
    badgeStrong: "bg-rose-600 text-white dark:bg-rose-500 dark:text-slate-950",
  },
  slate: {
    card: "border-slate-200/80 bg-[linear-gradient(135deg,rgba(248,250,252,0.98),rgba(255,255,255,0.94))] shadow-[0_18px_36px_-28px_rgba(100,116,139,0.25)] dark:border-slate-500/20 dark:bg-[linear-gradient(135deg,rgba(100,116,139,0.15),rgba(15,23,42,0.94))]",
    softPanel: "border-slate-200/80 bg-slate-50/80 dark:border-slate-500/20 dark:bg-slate-500/10",
    iconWrap: "bg-slate-500/15 dark:bg-slate-500/20",
    icon: "text-slate-700 dark:text-slate-300",
    badge: "border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-300",
    badgeStrong: "bg-slate-800 text-white dark:bg-slate-300 dark:text-slate-950",
  },
};

export function adminTone(tone: AdminTone) {
  return ADMIN_TONES[tone];
}

export function adminRoleTone(role: AppRole): AdminTone {
  if (role === "admin") return "rose";
  if (role === "transporter") return "sky";
  if (role === "farmer_pro") return "emerald";
  if (role === "company") return "emerald";
  return "amber";
}

export function adminRoleBadgeClass(role: AppRole) {
  return adminTone(adminRoleTone(role)).badge;
}

export function adminRoleSurfaceClass(role: AppRole) {
  return adminTone(adminRoleTone(role)).softPanel;
}

export function adminRoleRowClass(role: AppRole) {
  const tone = adminRoleTone(role);
  if (tone === "rose") return "bg-rose-50/55 hover:bg-rose-50 dark:bg-rose-500/8 dark:hover:bg-rose-500/12";
  if (tone === "sky") return "bg-sky-50/55 hover:bg-sky-50 dark:bg-sky-500/8 dark:hover:bg-sky-500/12";
  if (tone === "emerald") return "bg-emerald-50/55 hover:bg-emerald-50 dark:bg-emerald-500/8 dark:hover:bg-emerald-500/12";
  if (tone === "violet") return "bg-violet-50/55 hover:bg-violet-50 dark:bg-violet-500/8 dark:hover:bg-violet-500/12";
  return "bg-amber-50/55 hover:bg-amber-50 dark:bg-amber-500/8 dark:hover:bg-amber-500/12";
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Never";
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

export function formatCount(value: number) {
  return new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(value);
}

function parseFilename(contentDisposition: string | null) {
  return contentDisposition?.match(/filename="?([^"]+)"?/i)?.[1] ?? `agrilink-transaction-receipts-${new Date().toISOString().slice(0, 10)}.csv`;
}

export async function downloadReceiptsCsv() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("You need to sign in again before downloading receipts.");
  }

  const headers = new Headers({ Authorization: `Bearer ${session.access_token}` });
  const localRole = getStoredRole(session.user.id);
  if (localRole) headers.set("X-AgriLink-Role", localRole);

  const response = await fetch(`${API_BASE_URL}/admin/receipts/export`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Receipt export failed with status ${response.status}.`);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = parseFilename(response.headers.get("content-disposition"));
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}
