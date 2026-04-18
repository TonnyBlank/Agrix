import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Building2,
  CircleAlert,
  Clock3,
  CreditCard,
  Download,
  Eye,
  HandCoins,
  Lock,
  Search,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import QRCode from "react-qr-code";
import { useAuth } from "@/hooks/useAuth";
import { useIdVerification } from "@/hooks/useIdVerification";
import { useOrders } from "@/hooks/useOrders";
import { apiFetch } from "@/lib/api";
import { normalizeKenyanPhone as normalizeKenyanPhoneInput, sanitizeDecimalInput, sanitizePhoneInput } from "@/lib/inputSanitizers";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

const companyBenefits = [
  "Portfolio-level credit review across multiple farms and suppliers",
  "Contract-backed disbursement planning for bulk procurement cycles",
  "Repayment visibility linked to orders, deliveries, and settlement status",
];

const readinessIcons = [BadgeCheck, Clock3, Sparkles, Building2, BadgeCheck];

type LoanStatus = "pending_review" | "approved" | "rejected" | "disbursed" | "repaid";
type LoanSecurityType = "unsecured" | "guarantor" | "collateral";
type BranchVisitStatus = "not_required" | "pending_customer_visit" | "documents_received" | "valuation_pending" | "verified" | "waived";

type LoanRepayment = {
  id: string;
  amount: number;
  payment_method: string | null;
  payment_ref: string | null;
  phone_number: string | null;
  note: string | null;
  created_at: string;
};

type LoanSummary = {
  principal: number;
  annualInterestRate: number;
  scheduledPayment: number;
  scheduledNumberOfPayments: number;
  actualNumberOfPayments: number;
  paymentsPerYear: number;
  startDate: string;
  totalInterest: number;
  totalPayable: number;
  totalRepaid: number;
  remainingBalance: number;
};

type LoanScheduleRow = {
  paymentNumber: number;
  paymentDate: string;
  beginningBalance: number;
  scheduledPayment: number;
  principal: number;
  interest: number;
  endingBalance: number;
  cumulativeInterest: number;
};

type Guarantor = {
  name: string;
  phone: string;
  relationship: string;
  idNumber?: string;
};

type CollateralItem = {
  asset_type: string;
  description?: string | null;
  owner_name?: string | null;
  document_reference?: string | null;
  estimated_value?: number | null;
  location?: string | null;
  notes?: string | null;
};

type LoanApplication = {
  id: string;
  product_type?: string | null;
  product_title: string;
  requested_amount: number;
  approved_amount: number | null;
  speed: string | null;
  interest_rate: number | null;
  repayment_days: number | null;
  status: LoanStatus;
  note: string | null;
  guarantors?: Guarantor[] | null;
  security_type: LoanSecurityType;
  requires_branch_visit: boolean;
  branch_name?: string | null;
  branch_location?: string | null;
  target_county?: string | null;
  branch_instructions?: string | null;
  branch_visit_status: BranchVisitStatus;
  collateral_types: string[];
  required_documents: string[];
  collateral_items: CollateralItem[];
  disbursement_method?: "mpesa" | "voucher";
  repayment_method?: "mpesa" | "pay_with_produce";
  voucher_code?: string | null;
  created_at: string;
  disbursed_at?: string | null;
  repaid_at?: string | null;
  repayments: LoanRepayment[];
  loan_summary: LoanSummary;
  amortization_schedule: LoanScheduleRow[];
};

type FundingOption = {
  key: string;
  productType?: string | null;
  title: string;
  rawAmount: number;
  amount: string;
  detail: string;
  speed: string;
  interestRate: number;
  repaymentDays: number;
  note: string | null;
  securityType: LoanSecurityType;
  requiresBranchVisit: boolean;
  branchName?: string | null;
  branchLocation?: string | null;
  targetCounty?: string | null;
  branchInstructions?: string | null;
  collateralTypes: string[];
  requiredDocuments: string[];
};

type BorrowerRole = Extract<Database["public"]["Enums"]["app_role"], "farmer_pro" | "company">;
type MicroLoanApplicationRow = Database["public"]["Tables"]["micro_loan_applications"]["Row"];
type MicroLoanRepaymentRow = Database["public"]["Tables"]["micro_loan_repayments"]["Row"];
type MicroLoanOfferRow = Database["public"]["Tables"]["micro_loan_offers"]["Row"];

const SECURITY_TYPE_LABELS: Record<LoanSecurityType, string> = {
  unsecured: "Unsecured",
  guarantor: "Guarantor",
  collateral: "Collateral",
};

const BRANCH_STATUS_LABELS: Record<BranchVisitStatus, string> = {
  not_required: "No branch visit needed",
  pending_customer_visit: "Visit branch with documents",
  documents_received: "Branch accepted your file",
  valuation_pending: "Valuation in progress",
  verified: "Branch accepted and cleared",
  waived: "Branch requirement waived",
};

const SAFE_MICRO_LOAN_APPLICATION_SELECT = [
  "id",
  "user_id",
  "applicant_role",
  "product_type",
  "product_title",
  "requested_amount",
  "approved_amount",
  "speed",
  "interest_rate",
  "repayment_days",
  "status",
  "note",
  "guarantors",
  "security_type",
  "requires_branch_visit",
  "branch_name",
  "branch_location",
  "target_county",
  "branch_instructions",
  "branch_visit_status",
  "collateral_types",
  "required_documents",
  "collateral_items",
  "repayment_method",
  "created_at",
  "updated_at",
  "reviewed_at",
  "disbursed_at",
  "repaid_at",
].join(", ");

const COLLATERAL_TYPE_OPTIONS = [
  { value: "title_deed", label: "Title deed" },
  { value: "logbook", label: "Vehicle logbook" },
  { value: "business_assets", label: "Business assets" },
  { value: "livestock", label: "Livestock" },
  { value: "inventory", label: "Stock or inventory" },
  { value: "cash_cover", label: "Cash cover" },
  { value: "shares", label: "Shares or deposits" },
  { value: "other", label: "Other collateral" },
] as const;

const DEFAULT_COLLATERAL_ITEM: CollateralItem = {
  asset_type: "title_deed",
  description: "",
  owner_name: "",
  document_reference: "",
  estimated_value: null,
  location: "",
  notes: "",
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function getLoanPrincipal(approvedAmount: number | null | undefined, requestedAmount: number | null | undefined) {
  return roundMoney(Number(approvedAmount ?? requestedAmount ?? 0));
}

function getLoanPaymentCount(repaymentDays: number | null | undefined) {
  return Math.max(1, Math.ceil(Number(repaymentDays ?? 30) / 30));
}

function buildLoanSchedule(input: {
  approvedAmount: number | null | undefined;
  requestedAmount: number | null | undefined;
  interestRate: number | null | undefined;
  repaymentDays: number | null | undefined;
  startDate: string | null | undefined;
  repayments?: LoanRepayment[];
}) {
  const principal = getLoanPrincipal(input.approvedAmount, input.requestedAmount);
  const annualInterestRate = Number(input.interestRate ?? 0);
  const scheduledNumberOfPayments = getLoanPaymentCount(input.repaymentDays);
  const periodicRate = annualInterestRate > 0 ? annualInterestRate / 100 / 12 : 0;
  const startDate = input.startDate ?? new Date().toISOString();

  const scheduledPayment = principal <= 0
    ? 0
    : periodicRate === 0
      ? roundMoney(principal / scheduledNumberOfPayments)
      : roundMoney((principal * periodicRate) / (1 - Math.pow(1 + periodicRate, -scheduledNumberOfPayments)));

  const schedule: LoanScheduleRow[] = [];
  let beginningBalance = principal;
  let cumulativeInterest = 0;

  for (let index = 0; index < scheduledNumberOfPayments; index += 1) {
    const interest = roundMoney(beginningBalance * periodicRate);
    const principalPayment = index === scheduledNumberOfPayments - 1
      ? roundMoney(beginningBalance)
      : roundMoney(Math.max(scheduledPayment - interest, 0));
    const scheduledPaymentForRow = roundMoney(principalPayment + interest);
    const endingBalance = roundMoney(Math.max(beginningBalance - principalPayment, 0));
    cumulativeInterest = roundMoney(cumulativeInterest + interest);

    const paymentDate = new Date(startDate);
    paymentDate.setMonth(paymentDate.getMonth() + index);

    schedule.push({
      paymentNumber: index + 1,
      paymentDate: paymentDate.toISOString(),
      beginningBalance,
      scheduledPayment: scheduledPaymentForRow,
      principal: principalPayment,
      interest,
      endingBalance,
      cumulativeInterest,
    });

    beginningBalance = endingBalance;
  }

  const repayments = input.repayments ?? [];
  const totalInterest = roundMoney(schedule.reduce((sum, row) => sum + row.interest, 0));
  const totalPayable = roundMoney(principal + totalInterest);
  const totalRepaid = roundMoney(repayments.reduce((sum, repayment) => sum + Number(repayment.amount ?? 0), 0));
  const remainingBalance = roundMoney(Math.max(totalPayable - totalRepaid, 0));

  return {
    summary: {
      principal,
      annualInterestRate,
      scheduledPayment,
      scheduledNumberOfPayments,
      actualNumberOfPayments: repayments.length,
      paymentsPerYear: 12,
      startDate,
      totalInterest,
      totalPayable,
      totalRepaid,
      remainingBalance,
    } satisfies LoanSummary,
    schedule,
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function normalizeCollateralItems(value: unknown): CollateralItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      asset_type: String(item.asset_type ?? "other"),
      description: String(item.description ?? "").trim() || null,
      owner_name: String(item.owner_name ?? "").trim() || null,
      document_reference: String(item.document_reference ?? "").trim() || null,
      estimated_value: item.estimated_value === null || item.estimated_value === undefined || item.estimated_value === "" ? null : Number(item.estimated_value),
      location: String(item.location ?? "").trim() || null,
      notes: String(item.notes ?? "").trim() || null,
    }))
    .filter((item) => Boolean(item.asset_type || item.description || item.document_reference));
}

function getBranchStatusLabel(status: BranchVisitStatus) {
  return BRANCH_STATUS_LABELS[status] ?? BRANCH_STATUS_LABELS.pending_customer_visit;
}

function normalizeCountyText(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function isLoanRepayable(application: LoanApplication) {
  return application.status === "disbursed";
}

function enrichLoanApplication(loan: MicroLoanApplicationRow, repayments: LoanRepayment[]): LoanApplication {
  const scheduleData = buildLoanSchedule({
    approvedAmount: loan.approved_amount,
    requestedAmount: loan.requested_amount,
    interestRate: loan.interest_rate,
    repaymentDays: loan.repayment_days,
    startDate: loan.disbursed_at ?? loan.reviewed_at ?? loan.created_at,
    repayments,
  });

  return {
    ...loan,
    status: loan.status as LoanStatus,
    requested_amount: Number(loan.requested_amount ?? 0),
    approved_amount: loan.approved_amount === null ? null : Number(loan.approved_amount),
    interest_rate: loan.interest_rate === null ? null : Number(loan.interest_rate),
    repayment_days: loan.repayment_days === null ? null : Number(loan.repayment_days),
    guarantors: Array.isArray(loan.guarantors) ? (loan.guarantors as Guarantor[]) : [],
    security_type: (loan.security_type as LoanSecurityType) ?? "unsecured",
    requires_branch_visit: Boolean(loan.requires_branch_visit),
    branch_name: loan.branch_name ?? null,
    branch_location: loan.branch_location ?? null,
    target_county: loan.target_county ?? loan.branch_location ?? null,
    branch_instructions: loan.branch_instructions ?? null,
    branch_visit_status: (loan.branch_visit_status as BranchVisitStatus) ?? (loan.requires_branch_visit ? "pending_customer_visit" : "not_required"),
    collateral_types: normalizeStringArray(loan.collateral_types),
    required_documents: normalizeStringArray(loan.required_documents),
    collateral_items: normalizeCollateralItems(loan.collateral_items),
    disbursement_method: loan.disbursement_method as "mpesa" | "voucher" | undefined,
    repayment_method: loan.repayment_method as "mpesa" | "pay_with_produce" | undefined,
    voucher_code: loan.voucher_code as string | null | undefined,
    repayments,
    loan_summary: scheduleData.summary,
    amortization_schedule: scheduleData.schedule,
  };
}

async function loadLoanApplicationsFromSupabase(userId: string) {
  let { data: _loans, error: loansError } = await supabase
    .from("micro_loan_applications")
    .select("*")
    // @ts-expect-error DB types inference too deep for foreign relation eq mapping
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (loansError?.code === "PGRST204" && loansError.message.includes("disbursement_method")) {
    const fallbackResult = await supabase
      .from("micro_loan_applications")
      .select(SAFE_MICRO_LOAN_APPLICATION_SELECT)
      // @ts-expect-error DB types inference too deep for foreign relation eq mapping
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    _loans = fallbackResult.data;
    loansError = fallbackResult.error;
  }

  if (loansError) throw loansError;
  const loans = ((_loans ?? []) as unknown[]).map((loan) => ({
    disbursement_method: "mpesa",
    voucher_code: null,
    ...loan,
  })) as MicroLoanApplicationRow[];

  const loanIds = (loans ?? []).map((loan) => loan.id);
  const { data: _repayments, error: repaymentsError } = loanIds.length
    ? await supabase
        .from("micro_loan_repayments")
        .select("*")
        // @ts-expect-error DB types inference too deep for relation mapping
        .in("loan_application_id", loanIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };
  const repayments = _repayments as unknown as MicroLoanRepaymentRow[];

  if (repaymentsError) throw repaymentsError;

  const repaymentsByLoanId = new Map<string, LoanRepayment[]>();
  for (const repayment of (repayments ?? []) as MicroLoanRepaymentRow[]) {
    const current = repaymentsByLoanId.get(repayment.loan_application_id) ?? [];
    current.push({
      id: repayment.id,
      amount: Number(repayment.amount ?? 0),
      payment_method: repayment.payment_method ?? null,
      payment_ref: repayment.payment_ref ?? null,
      phone_number: repayment.phone_number ?? null,
      note: repayment.note ?? null,
      created_at: repayment.created_at,
    });
    const loanAppId = repayment.loan_application_id;
    repaymentsByLoanId.set(loanAppId, current);
  }

  return (loans ?? []).map((loan) =>
    enrichLoanApplication(loan, repaymentsByLoanId.get(loan.id) ?? []));
}

async function loadLoanOffersFromSupabase(role: BorrowerRole, availableAmount: number, borrowerCounty: string | null | undefined) {
  const { data: _data, error } = await supabase
    .from("micro_loan_offers")
    .select("*")
    // @ts-expect-error DB types inference too deep for relation mapping
    .eq("is_active", true)
    // @ts-expect-error DB types inference too deep for relation mapping
    .eq("applicant_role", role)
    .order("created_at", { ascending: false });
  const data = _data as unknown as MicroLoanOfferRow[];

  if (error) throw error;

  const normalizedBorrowerCounty = normalizeCountyText(borrowerCounty);

  return (data ?? [])
    .filter((offer) => {
      const targetCounty = offer.target_county ?? offer.branch_location ?? null;
      return Boolean(normalizedBorrowerCounty) && normalizeCountyText(targetCounty) === normalizedBorrowerCounty;
    })
    .map((offer) => {
    const available = Math.min(Math.max(0, availableAmount), Number(offer.max_amount ?? 0));
    return {
      key: offer.id,
      productType: offer.product_type,
      title: offer.product_title,
      rawAmount: available,
      amount: new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency: "KES",
        maximumFractionDigits: 0,
      }).format(available),
      detail: offer.note || "Published by admin and available to qualified borrowers.",
      speed: offer.speed || "Admin review",
      interestRate: Number(offer.interest_rate ?? 0),
      repaymentDays: Number(offer.repayment_days ?? 0),
      note: offer.note,
      securityType: (offer.security_type as LoanSecurityType) ?? "unsecured",
      requiresBranchVisit: Boolean(offer.requires_branch_visit),
      branchName: offer.branch_name ?? null,
      branchLocation: offer.branch_location ?? null,
      targetCounty: offer.target_county ?? offer.branch_location ?? null,
      branchInstructions: offer.branch_instructions ?? null,
      collateralTypes: normalizeStringArray(offer.collateral_types),
      requiredDocuments: normalizeStringArray(offer.required_documents),
    } satisfies FundingOption;
  });
}

function formatScheduleDate(value: string) {
  return new Date(value).toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function downloadLoanReceipt(application: LoanApplication) {
  const currency = new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  });

  const scheduleRows = application.amortization_schedule
    .map(
      (row) => `
        <tr>
          <td>${row.paymentNumber}</td>
          <td>${formatScheduleDate(row.paymentDate)}</td>
          <td>${currency.format(row.beginningBalance)}</td>
          <td>${currency.format(row.scheduledPayment)}</td>
          <td>${currency.format(row.principal)}</td>
          <td>${currency.format(row.interest)}</td>
          <td>${currency.format(row.endingBalance)}</td>
          <td>${currency.format(row.cumulativeInterest)}</td>
        </tr>`,
    )
    .join("");

  const repaymentRows = application.repayments.length
    ? application.repayments
        .map(
          (repayment) => `
            <tr>
              <td>${repayment.payment_ref || "Manual repayment"}</td>
              <td>${currency.format(repayment.amount)}</td>
              <td>${formatScheduleDate(repayment.created_at)}</td>
              <td>${repayment.phone_number || repayment.payment_method || "Repayment"}</td>
            </tr>`,
        )
        .join("")
    : `<tr><td colspan="4">No repayments posted yet.</td></tr>`;

  const branchSection = application.requires_branch_visit
    ? `
      <div class="section">
        <h3>Branch Review</h3>
        <p>Status: ${getBranchStatusLabel(application.branch_visit_status)}</p>
        <p>Branch: ${application.branch_name || "To be assigned"}${application.branch_location ? ` - ${application.branch_location}` : ""}</p>
        <p>Instructions: ${application.branch_instructions || "Bring all required collateral documents to the branch for review."}</p>
        <p>Required documents: ${application.required_documents.length ? application.required_documents.join(", ") : "As advised by the branch."}</p>
      </div>`
    : "";

  const collateralSection = application.collateral_items.length
    ? `
      <div class="section">
        <h3>Collateral</h3>
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Description</th>
              <th>Reference</th>
              <th>Owner</th>
              <th>Est. Value</th>
            </tr>
          </thead>
          <tbody>
            ${application.collateral_items
              .map(
                (item) => `
                  <tr>
                    <td>${item.asset_type}</td>
                    <td>${item.description || "-"}</td>
                    <td>${item.document_reference || "-"}</td>
                    <td>${item.owner_name || "-"}</td>
                    <td>${item.estimated_value ? currency.format(item.estimated_value) : "-"}</td>
                  </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>`
    : "";

  const receiptWindow = window.open("", "_blank", "width=1200,height=900");
  if (!receiptWindow) return;

  receiptWindow.document.write(`
    <html>
      <head>
        <title>AgriLink Loan Receipt</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #1f2937; }
          h1, h2, h3 { margin: 0 0 12px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
          .badge { display: inline-block; padding: 6px 12px; border-radius: 999px; background: #e8f5ee; color: #1d7a55; font-size: 12px; font-weight: 700; text-transform: uppercase; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0; }
          .card { border: 1px solid #d9e2dd; border-radius: 12px; padding: 12px; }
          .label { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #6b7280; margin-bottom: 6px; }
          .value { font-size: 18px; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
          th, td { border: 1px solid #d9e2dd; padding: 10px; text-align: left; }
          th { background: #f5f8f6; text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; color: #6b7280; }
          .section { margin-top: 28px; }
          @media print {
            body { margin: 12px; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>Loan Amortization Schedule</h1>
            <p>${application.product_title}</p>
            <p>Loan ID: ${application.id}</p>
          </div>
          <span class="badge">${application.status.replace("_", " ")}</span>
        </div>

        <div class="grid">
          <div class="card"><div class="label">Loan Amount</div><div class="value">${currency.format(application.loan_summary.principal)}</div></div>
          <div class="card"><div class="label">Annual Interest</div><div class="value">${application.loan_summary.annualInterestRate.toFixed(2)}%</div></div>
          <div class="card"><div class="label">Scheduled Payment</div><div class="value">${currency.format(application.loan_summary.scheduledPayment)}</div></div>
          <div class="card"><div class="label">Start Date</div><div class="value">${formatScheduleDate(application.loan_summary.startDate)}</div></div>
          <div class="card"><div class="label">Scheduled Payments</div><div class="value">${application.loan_summary.scheduledNumberOfPayments}</div></div>
          <div class="card"><div class="label">Actual Repayments</div><div class="value">${application.loan_summary.actualNumberOfPayments}</div></div>
          <div class="card"><div class="label">Total Interest</div><div class="value">${currency.format(application.loan_summary.totalInterest)}</div></div>
          <div class="card"><div class="label">Loan Balance</div><div class="value">${currency.format(application.loan_summary.remainingBalance)}</div></div>
        </div>

        <div class="section">
          <h3>Amortization Schedule</h3>
          <table>
            <thead>
              <tr>
                <th>Payment #</th>
                <th>Payment Date</th>
                <th>Beginning Balance</th>
                <th>Scheduled Payment</th>
                <th>Principal</th>
                <th>Interest</th>
                <th>Ending Balance</th>
                <th>Cumulative Interest</th>
              </tr>
            </thead>
            <tbody>${scheduleRows}</tbody>
          </table>
        </div>

        <div class="section">
          <h3>Repayment History</h3>
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Phone / Method</th>
              </tr>
            </thead>
            <tbody>${repaymentRows}</tbody>
          </table>
        </div>
        ${branchSection}
        ${collateralSection}
      </body>
    </html>
  `);
  receiptWindow.document.close();
  receiptWindow.focus();
  receiptWindow.print();
}

function ProGate() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative max-w-lg overflow-hidden rounded-[1.75rem] border border-border/70 bg-white/95 p-7 text-center shadow-[0_20px_50px_-35px_rgba(15,23,42,0.22)] dark:bg-card/95"
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.2rem] bg-emerald-100 text-primary shadow-inner">
          <Lock className="h-8 w-8" />
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground">Micro Loans</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Upgrade to Pro to unlock revenue-based financing, loan readiness scoring, and faster access to working capital tools.
        </p>
        <div className="mt-6 grid gap-3 text-left text-sm text-muted-foreground sm:grid-cols-2">
          <div className="rounded-[1rem] border border-white/70 bg-white/75 p-3 dark:border-white/10 dark:bg-background/60">
            <p className="font-semibold text-foreground">Financing readiness</p>
            <p className="mt-1">Track the exact profile, payout, and revenue checks lenders use.</p>
          </div>
          <div className="rounded-[1rem] border border-white/70 bg-white/75 p-3 dark:border-white/10 dark:bg-background/60">
            <p className="font-semibold text-foreground">Credit visibility</p>
            <p className="mt-1">See your estimated loan ceiling update as your order history grows.</p>
          </div>
        </div>
        <Button asChild className="mt-8 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
          <Link to="/dashboard/upgrade">
            <Zap className="mr-2 h-4 w-4" />
            Upgrade to Pro
          </Link>
        </Button>
      </motion.div>
    </div>
  );
}

function MicroLoansDashboard() {
  const [searchParams] = useSearchParams();
  const isIsolated = searchParams.get("isolated") === "true";
  const { user, role, profile, refreshProfile } = useAuth();
  const { sellingOrders, buyingOrders, loading: ordersLoading, refetch: refetchOrders } = useOrders();
  const { verification, loading: verificationLoading, refetch: refetchVerification } = useIdVerification();
  const hasAccess = isIsolated || role === "farmer_pro" || role === "company";
  const isCompanyBorrower = role === "company";
  const canUseProduceRepayment = role === "farmer_pro";
  const loading = ordersLoading || verificationLoading;
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [applications, setApplications] = useState<LoanApplication[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const [loanOffers, setLoanOffers] = useState<FundingOption[]>([]);
  const [loanOffersLoading, setLoanOffersLoading] = useState(true);
  const [applyingProduct, setApplyingProduct] = useState<string | null>(null);
  const [repayingLoanId, setRepayingLoanId] = useState<string | null>(null);
  const [repaymentDialogLoan, setRepaymentDialogLoan] = useState<LoanApplication | null>(null);
  const [repaymentAmount, setRepaymentAmount] = useState("");
  const [repaymentPhone, setRepaymentPhone] = useState("");
  const [selectedLoanReceipt, setSelectedLoanReceipt] = useState<LoanApplication | null>(null);
  const [currentLoanStep, setCurrentLoanStep] = useState(1);
  const [loanSidebarView, setLoanSidebarView] = useState<"active" | "closed">("active");
  const [loanListSearch, setLoanListSearch] = useState("");
  const [isLoanRequestDialogOpen, setIsLoanRequestDialogOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<FundingOption | null>(null);
  const [requestedLoanAmount, setRequestedLoanAmount] = useState("");
  const [disbursementMethod, setDisbursementMethod] = useState<"mpesa" | "voucher">("mpesa");
  const [repaymentMethod, setRepaymentMethod] = useState<"mpesa" | "pay_with_produce">("mpesa");
  const [guarantors, setGuarantors] = useState<Guarantor[]>([{ name: "", phone: "", relationship: "" }]);
  const [collateralItems, setCollateralItems] = useState<CollateralItem[]>([{ ...DEFAULT_COLLATERAL_ITEM }]);
  const [branchVisitAcknowledged, setBranchVisitAcknowledged] = useState(false);

  const currency = new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  });

  const eligibility = useMemo(() => {
    const qualifiedStatuses = new Set(["confirmed", "processing", "shipped", "delivered"]);
    const now = new Date();
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(now.getDate() - 90);
    const financingOrders = isCompanyBorrower ? buyingOrders : sellingOrders;

    const qualifiedOrders = financingOrders.filter((order) => {
      const createdAt = new Date(order.created_at);
      const hasQualifiedPayment = order.payment_status === "paid" || qualifiedStatuses.has(order.status);
      return hasQualifiedPayment && createdAt >= ninetyDaysAgo;
    });

    const revenue90 = qualifiedOrders.reduce((sum, order) => sum + order.total_price, 0);
    const totalQualifiedOrders = qualifiedOrders.length;
    const averageMonthlyRevenue = revenue90 / 3;

    const hasPayout =
      profile?.payout_method === "mpesa"
        ? Boolean(profile?.payout_mpesa_number?.trim())
        : profile?.payout_method === "bank"
          ? Boolean(
              profile?.bank_name?.trim() &&
                profile?.bank_account_name?.trim() &&
                profile?.bank_account_number?.trim(),
            )
          : false;

    const readinessChecks = [
      { label: "Verified identity", met: verification?.status === "verified" },
      { label: "Payout details completed", met: hasPayout },
      {
        label: "Contact profile completed",
        met: Boolean(profile?.full_name?.trim() && profile?.phone?.trim() && profile?.county?.trim()),
      },
      { label: "At least 2 successful orders in 90 days", met: totalQualifiedOrders >= 2 },
      { label: "At least KES 10,000 revenue in 90 days", met: revenue90 >= 10000 },
    ];

    const allChecksMet = readinessChecks.every((check) => check.met);
    const scoreMultiplier = isCompanyBorrower ? 1.1 : 0.8;
    const rawEligibleAmount = averageMonthlyRevenue * scoreMultiplier;
    const minimumEligibleAmount = isCompanyBorrower ? 25000 : 10000;
    const maxEligibleAmount = isCompanyBorrower ? 1200000 : 250000;
    const eligibleAmount = allChecksMet
      ? Math.max(minimumEligibleAmount, Math.min(maxEligibleAmount, Math.round(rawEligibleAmount / 1000) * 1000))
      : 0;

    return {
      revenue90,
      totalQualifiedOrders,
      averageMonthlyRevenue,
      readinessChecks,
      missingRequirements: readinessChecks.filter((check) => !check.met),
      isEligible: hasAccess && allChecksMet,
      eligibleAmount,
      nextReviewWindow: isCompanyBorrower ? "Priority review within 24 hours" : "Standard review within 24-48 hours",
    };
  }, [buyingOrders, hasAccess, isCompanyBorrower, profile, sellingOrders, verification?.status]);

  const readinessScore = Math.round(
    (eligibility.readinessChecks.filter((item) => item.met).length / eligibility.readinessChecks.length) * 100,
  );

  const activeLoanBalance = applications.reduce((sum, application) => {
    if (application.status === "rejected" || application.status === "repaid") return sum;
    return sum + Number(application.loan_summary?.remainingBalance ?? 0);
  }, 0);
  const netEligibleAmount = Math.max(0, eligibility.eligibleAmount - activeLoanBalance);
  const totalBorrowedAmount = applications.reduce(
    (sum, application) => sum + Number(application.approved_amount ?? application.requested_amount ?? 0),
    0,
  );

  const decision = !hasAccess
    ? {
        title: "Upgrade required",
        amount: "Unlock on paid plan",
        detail: "Upgrade to Farmer Pro to unlock live credit tracking and borrowing.",
        tone: "amber",
      }
    : loading
      ? {
          title: "Checking live eligibility",
          amount: "Calculating...",
          detail: "Syncing your orders, verification state, and payout profile.",
          tone: "slate",
        }
      : eligibility.isEligible
        ? {
            title: "Eligible",
            amount: currency.format(netEligibleAmount),
            detail: eligibility.nextReviewWindow,
            tone: "emerald",
          }
        : {
            title: "Not eligible yet",
            amount: currency.format(netEligibleAmount),
            detail: "Finish the missing checks below and keep growing revenue to unlock financing.",
            tone: "red",
          };


  const fundingOptions = loanOffers;

  useEffect(() => {
    if (!loading) {
      setLastUpdated(new Date());
    }
  }, [loading, netEligibleAmount, eligibility.revenue90, readinessScore]);

  useEffect(() => {
    const interval = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const formatRelativeTime = (value: string | Date | null) => {
    if (!value) return "just now";

    const date = typeof value === "string" ? new Date(value) : value;
    const diffMs = Math.max(0, nowTick - date.getTime());
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) return "just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const loadApplications = async () => {
    if (!hasAccess) {
      setApplications([]);
      setApplicationsLoading(false);
      return;
    }

    setApplicationsLoading(true);
    try {
      const data = await apiFetch<LoanApplication[]>("/micro-loans/applications");
      setApplications(data);
    } catch (error) {
      console.error("Failed to load loan applications from API, falling back to Supabase", error);
      if (!profile?.user_id) {
        toast.error(`Failed to load loan applications: ${(error as Error).message}`);
      } else {
        try {
          const fallbackData = await loadLoanApplicationsFromSupabase(profile.user_id);
          setApplications(fallbackData);
        } catch (fallbackError) {
          toast.error(`Failed to load loan applications: ${(fallbackError as Error).message}`);
        }
      }
    } finally {
      setApplicationsLoading(false);
    }
  };

  const loadOffers = async () => {
    if (!hasAccess) {
      setLoanOffers([]);
      setLoanOffersLoading(false);
      return;
    }

    setLoanOffersLoading(true);
    try {
      const data = await apiFetch<Array<{
        id: string;
        product_type?: string | null;
        product_title: string;
        available_amount: number;
        speed: string | null;
        interest_rate: number | null;
        repayment_days: number | null;
        note: string | null;
        security_type: LoanSecurityType;
        requires_branch_visit: boolean;
        branch_name?: string | null;
        branch_location?: string | null;
        target_county?: string | null;
        branch_instructions?: string | null;
        collateral_types: string[];
        required_documents: string[];
      }>>("/micro-loans/offers");

      setLoanOffers(
        data.map((offer) => ({
          key: offer.id,
          productType: typeof offer.product_type === "string" ? offer.product_type : null,
          title: offer.product_title,
          rawAmount: offer.available_amount,
          amount: currency.format(offer.available_amount),
          detail: offer.note || "Published by admin and available to qualified borrowers.",
          speed: offer.speed || "Admin review",
          interestRate: Number(offer.interest_rate ?? 0),
          repaymentDays: Number(offer.repayment_days ?? 0),
          note: offer.note,
          securityType: offer.security_type ?? "unsecured",
          requiresBranchVisit: Boolean(offer.requires_branch_visit),
          branchName: offer.branch_name ?? null,
          branchLocation: offer.branch_location ?? null,
          targetCounty: offer.target_county ?? offer.branch_location ?? null,
          branchInstructions: offer.branch_instructions ?? null,
          collateralTypes: normalizeStringArray(offer.collateral_types),
          requiredDocuments: normalizeStringArray(offer.required_documents),
        })),
      );
    } catch (error) {
      console.error("Failed to load loan offers from API, falling back to Supabase", error);
      if (role !== "farmer_pro" && role !== "company") {
        setLoanOffers([]);
      } else {
        try {
          const fallbackData = await loadLoanOffersFromSupabase(role, eligibility.isEligible ? netEligibleAmount : 0, profile?.county ?? null);
          setLoanOffers(fallbackData);
        } catch (fallbackError) {
          toast.error(`Failed to load loan offers: ${(fallbackError as Error).message}`);
        }
      }
    } finally {
      setLoanOffersLoading(false);
    }
  };

  useEffect(() => {
    void loadApplications();
    void loadOffers();
  }, [hasAccess]);

  useEffect(() => {
    if (!hasAccess) return;

    const interval = window.setInterval(() => {
      void refetchOrders();
      void refetchVerification();
      void refreshProfile();
      void loadApplications();
      void loadOffers();
    }, 60000);

    return () => window.clearInterval(interval);
  }, [hasAccess, refetchOrders, refetchVerification, refreshProfile]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchOrders(), refetchVerification(), refreshProfile(), loadApplications(), loadOffers()]);
      setLastUpdated(new Date());
      toast.success("Micro loan data refreshed.");
    } finally {
      setRefreshing(false);
    }
  };

  const resetLoanRequestForm = () => {
    setRequestedLoanAmount("");
    setGuarantors([{ name: "", phone: "", relationship: "" }]);
    setCollateralItems([{ ...DEFAULT_COLLATERAL_ITEM, asset_type: "title_deed" }]);
    setBranchVisitAcknowledged(false);
    setSelectedOffer(null);
    setDisbursementMethod("mpesa");
    setRepaymentMethod("mpesa");
  };

  const handleBorrow = (offerId: string, amount: string) => {
    const offer = loanOffers.find((o) => o.key === offerId);
    if (!offer) return;
    setSelectedOffer(offer);
    setRequestedLoanAmount(String(offer.rawAmount));
    
    // Always start with one empty guarantor for the loan application
    setGuarantors([{ name: "", phone: "", relationship: "" }]);
    setCollateralItems([{ ...DEFAULT_COLLATERAL_ITEM, asset_type: offer.collateralTypes[0]?.toLowerCase().replace(/\s+/g, "_") || "title_deed" }]);
    setBranchVisitAcknowledged(false);
    setDisbursementMethod("mpesa");
    setRepaymentMethod("mpesa");
    
    setIsLoanRequestDialogOpen(true);
  };

  const handleConfirmBorrow = async () => {
    if (!selectedOffer) return;
    setApplyingProduct(selectedOffer.key);
    try {
      const amount = Number(requestedLoanAmount);
      if (isNaN(amount) || amount <= 0) {
        toast.error("Please enter a valid amount.");
        setApplyingProduct(null);
        return;
      }
      if (selectedOffer.securityType === "guarantor" && !guarantors.some((g) => g.name.trim())) {
        toast.error("Add at least one guarantor before submitting this loan.");
        setApplyingProduct(null);
        return;
      }
      const hasCollateral = collateralItems.some((item) =>
        [item.asset_type, item.description, item.document_reference, item.owner_name].some((value) => String(value ?? "").trim()),
      );
      if (selectedOffer.securityType === "collateral" && !hasCollateral) {
        toast.error("Add at least one collateral item, for example a title deed or logbook.");
        setApplyingProduct(null);
        return;
      }
      if (selectedOffer.requiresBranchVisit && !branchVisitAcknowledged) {
        toast.error("Confirm the branch visit requirement before submitting this loan.");
        setApplyingProduct(null);
        return;
      }

      await apiFetch<LoanApplication>("/micro-loans/applications", {
        method: "POST",
        body: {
          offerId: selectedOffer.key,
          requestedAmount: amount,
          disbursementMethod,
          repaymentMethod,
          guarantors: guarantors.filter(g => g.name.trim() !== ""),
          collateralItems: collateralItems
            .map((item) => ({
              ...item,
              estimated_value: item.estimated_value ? Number(item.estimated_value) : null,
            }))
            .filter((item) => [item.asset_type, item.description, item.document_reference, item.owner_name].some((value) => String(value ?? "").trim())),
          branchVisitAcknowledged,
        } as unknown as BodyInit,
      });
      toast.success(selectedOffer.requiresBranchVisit || selectedOffer.securityType !== "unsecured" ? "Secured loan request submitted for branch review." : "Loan application submitted successfully.");
      setIsLoanRequestDialogOpen(false);
      resetLoanRequestForm();
      await loadApplications();
      await loadOffers();
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to create loan application", error);
      toast.error((error as Error).message);
    } finally {
      setApplyingProduct(null);
    }
  };

  const openRepaymentDialog = (application: LoanApplication) => {
    if (!isLoanRepayable(application)) {
      toast.error(application.requires_branch_visit ? "This loan is still waiting for branch verification or disbursement." : "This loan is not disbursed yet.");
      return;
    }
    const remainingBalance = Number(application.loan_summary?.remainingBalance ?? 0);
    if (remainingBalance <= 0) {
      toast.success("This loan is already fully repaid.");
      return;
    }
    setRepaymentDialogLoan(application);
    setRepaymentAmount(String(Math.min(remainingBalance, application.loan_summary?.scheduledPayment ?? remainingBalance)));
    setRepaymentPhone(profile?.phone || profile?.payout_mpesa_number || "");
  };

  const handleRepayment = async () => {
    if (!repaymentDialogLoan) return;

    const amount = Number(repaymentAmount.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid repayment amount.");
      return;
    }

    if (!repaymentPhone.trim()) {
      toast.error("Enter the M-Pesa number to receive the STK prompt.");
      return;
    }

    setRepayingLoanId(repaymentDialogLoan.id);
    try {
      const response = await apiFetch<{ message: string; loan: LoanApplication }>(`/micro-loans/applications/${repaymentDialogLoan.id}/repay`, {
        method: "POST",
        body: JSON.stringify({ amount, phoneNumber: repaymentPhone }) as unknown as BodyInit,
      });
      setApplications((current) => current.map((item) => (item.id === repaymentDialogLoan.id ? response.loan : item)));
      setSelectedLoanReceipt((current) => (current?.id === repaymentDialogLoan.id ? response.loan : current));
      toast.success(response.message);
      setLastUpdated(new Date());
      setRepaymentDialogLoan(null);
      setRepaymentAmount("");
      setRepaymentPhone("");
    } catch (error) {
      console.error("Failed to post loan repayment from API, falling back to Supabase", error);
      if (!user) {
        toast.error((error as Error).message);
      } else {
        try {
          const normalizedPhone = normalizeKenyanPhoneInput(repaymentPhone);
          const remainingBalance = Number(repaymentDialogLoan.loan_summary?.remainingBalance ?? 0);
          if (amount > remainingBalance) {
            throw new Error(`Repayment exceeds the current balance of KES ${remainingBalance.toFixed(2)}.`);
          }

          const paymentRef = `LN-${Date.now()}`;
          const { data: _insertedRepayment, error: repaymentError } = await supabase
            .from("micro_loan_repayments")
            .insert({
              loan_application_id: repaymentDialogLoan.id,
              user_id: user.id,
              amount,
              payment_method: "mpesa",
              payment_ref: paymentRef,
              phone_number: normalizedPhone,
              note: `M-Pesa repayment posted to ${repaymentDialogLoan.product_title}.`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as unknown as any)
            .select("*")
            .single();
          const insertedRepayment = _insertedRepayment as unknown as MicroLoanRepaymentRow;

          if (repaymentError) throw repaymentError;

          const updatedRepayments = [
            ...repaymentDialogLoan.repayments,
            {
              id: insertedRepayment.id,
              amount: Number(insertedRepayment.amount ?? 0),
              payment_method: insertedRepayment.payment_method ?? null,
              payment_ref: insertedRepayment.payment_ref ?? null,
              phone_number: insertedRepayment.phone_number ?? null,
              note: insertedRepayment.note ?? null,
              created_at: insertedRepayment.created_at,
            } satisfies LoanRepayment,
          ];

          const nextSchedule = buildLoanSchedule({
            approvedAmount: repaymentDialogLoan.approved_amount,
            requestedAmount: repaymentDialogLoan.requested_amount,
            interestRate: repaymentDialogLoan.interest_rate,
            repaymentDays: repaymentDialogLoan.repayment_days,
            startDate: repaymentDialogLoan.disbursed_at ?? repaymentDialogLoan.created_at,
            repayments: updatedRepayments,
          });

          const nextStatus: LoanStatus =
            nextSchedule.summary.remainingBalance <= 0
              ? "repaid"
              : repaymentDialogLoan.status === "approved" || repaymentDialogLoan.status === "disbursed"
                ? repaymentDialogLoan.status
                : "disbursed";

          const { data: _updatedLoanRow, error: loanUpdateError } = await supabase
            .from("micro_loan_applications")
            .update({
              status: nextStatus as string,
              disbursed_at: repaymentDialogLoan.disbursed_at ?? repaymentDialogLoan.created_at,
              repaid_at: nextStatus === "repaid" ? new Date().toISOString() : null,
              updated_at: new Date().toISOString(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as unknown as any)
            // @ts-expect-error DB types inference too deep for relation mapping
            .eq("id", repaymentDialogLoan.id)
            .select("*")
            .single();
          const updatedLoanRow = _updatedLoanRow as unknown as MicroLoanApplicationRow;

          if (loanUpdateError) throw loanUpdateError;

          const updatedLoan = enrichLoanApplication(updatedLoanRow, updatedRepayments);
          setApplications((current) => current.map((item) => (item.id === repaymentDialogLoan.id ? updatedLoan : item)));
          setSelectedLoanReceipt((current) => (current?.id === repaymentDialogLoan.id ? updatedLoan : current));
          toast.success(`Repayment of KES ${amount.toFixed(2)} received successfully.`);
          setLastUpdated(new Date());
          setRepaymentDialogLoan(null);
          setRepaymentAmount("");
          setRepaymentPhone("");
        } catch (fallbackError) {
          toast.error((fallbackError as Error).message);
        }
      }
    } finally {
      setRepayingLoanId(null);
    }
  };

  const liveApplicationsCount = applications.filter((application) =>
    ["pending_review", "approved", "disbursed"].includes(application.status),
  ).length;
  const activeLoanTypes = new Set(
    applications
      .filter((application) => ["pending_review", "approved", "disbursed"].includes(application.status))
      .map((application) => application.product_type)
      .filter(Boolean),
  );
  const loanSteps = [
    {
      title: "Prepare Profile",
      detail: "Only needed if readiness items are still missing.",
    },
    {
      title: "Choose Product",
      detail: "Review financing products and borrow.",
    },
    {
      title: "Manage Loan",
      detail: "Open receipts, follow schedule, and repay.",
    },
  ];

  const normalizedLoanListSearch = loanListSearch.trim().toLowerCase();
  const filteredApplications = applications.filter((application) => {
    if (!normalizedLoanListSearch) return true;
    const haystack = [
      application.id,
      application.product_title,
      application.status,
      application.note,
      application.repayments.map((repayment) => repayment.payment_ref).join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedLoanListSearch);
  });
  const activeApplications = filteredApplications.filter((application) => application.status !== "repaid" && application.status !== "rejected");
  const repayableApplications = activeApplications.filter((application) => isLoanRepayable(application));
  const closedApplications = filteredApplications.filter((application) => application.status === "repaid" || application.status === "rejected");
  const latestApplication = applications[0] ?? null;
  const latestRepayableApplication = repayableApplications[0] ?? null;
  const requestedSection = searchParams.get("section");
  const isOverviewSection = !requestedSection;
  const isBorrowSection = requestedSection === "borrow";
  const isRepaySection = requestedSection === "repay";
  const isStatusSection = requestedSection === "status";
  const isFocusedActionSection = isRepaySection || isStatusSection;
  const showPrepareProfileSection = (isOverviewSection || isBorrowSection) && !eligibility.isEligible;
  const showBorrowLoanSection = isOverviewSection || isBorrowSection;
  const showManageLoanSection = isOverviewSection || isFocusedActionSection;
  const focusedSectionIntro = isOverviewSection
    ? {
        title: "Micro Loan Overview",
        detail: "Check readiness, review live offers, and manage current loans from one place.",
      }
    : isBorrowSection
    ? {
        title: "Borrow Loan",
        detail: "Choose a financing product, review terms, and submit your loan request from here.",
      }
    : isRepaySection
      ? {
          title: "Repay Loan",
          detail: "Open active loans, check balances, and make repayments quickly from this page.",
        }
      : isStatusSection
        ? {
            title: "Loan Status",
            detail: "Track current and closed loan status clearly, with balances, repayment progress, and receipts.",
          }
        : null;

  useEffect(() => {
    if (!requestedSection || requestedSection === "borrow") {
      setCurrentLoanStep(1);
      return;
    }

    if (requestedSection === "repay") {
      setCurrentLoanStep(2);
      setLoanSidebarView("active");
      return;
    }

    if (requestedSection === "status") {
      setCurrentLoanStep(2);
      setLoanSidebarView("active");
      return;
    }

    if (!hasAccess) {
      setCurrentLoanStep(1);
      return;
    }

    if (applications.length > 0) {
      setCurrentLoanStep(2);
      return;
    }

    if (eligibility.isEligible) {
      setCurrentLoanStep(1);
      return;
    }

    setCurrentLoanStep(0);
  }, [applications.length, eligibility.isEligible, hasAccess, requestedSection]);

  useEffect(() => {
    if (loanSidebarView === "active" && !activeApplications.length && closedApplications.length) {
      setLoanSidebarView("closed");
      return;
    }

    if (loanSidebarView === "closed" && !closedApplications.length && activeApplications.length) {
      setLoanSidebarView("active");
    }
  }, [activeApplications.length, closedApplications.length, loanSidebarView]);

  return (
    <div className="space-y-5">


      {focusedSectionIntro ? (
        <section className="rounded-[1.2rem] border border-border/70 bg-white/95 p-4 shadow-[0_16px_28px_-24px_rgba(15,23,42,0.16)] dark:bg-card/90">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">Micro Loans</p>
              <h2 className="mt-3 font-display text-2xl font-bold text-foreground">{focusedSectionIntro.title}</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{focusedSectionIntro.detail}</p>
            </div>
            <div className="rounded-[0.95rem] border border-sky-200/70 bg-white/80 px-4 py-3 dark:border-sky-500/20 dark:bg-background/70">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {isOverviewSection
                  ? activeLoanBalance > 0
                    ? "Outstanding"
                    : "Loan Ceiling"
                  : isBorrowSection
                    ? "Loan Ceiling"
                    : isRepaySection
                      ? "Outstanding"
                      : "Tracked Loans"}
              </p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {isOverviewSection
                  ? activeLoanBalance > 0
                    ? currency.format(activeLoanBalance)
                    : currency.format(netEligibleAmount)
                  : isBorrowSection
                  ? currency.format(netEligibleAmount)
                  : isRepaySection
                    ? currency.format(activeLoanBalance)
                    : String(applications.length)}
              </p>
            </div>
          </div>
        </section>
      ) : null}


      {showPrepareProfileSection ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="space-y-4"
          >
            <div className="rounded-[1.1rem] border border-border/70 bg-white/90 p-3.5 shadow-[0_16px_28px_-24px_rgba(15,23,42,0.18)] dark:bg-card/90">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[0.9rem] bg-primary/10">
                <HandCoins className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-foreground">Step 1: Prepare Profile</h3>
                <p className="text-sm text-muted-foreground">
                  Use the financing checks below to improve approval odds.
                </p>
              </div>
            </div>

            <p className="text-sm leading-7 text-muted-foreground">
              {hasAccess
                ? isCompanyBorrower
                  ? "Your Pro financing estimate uses revenue history, readiness signals, and order patterns to estimate credit capacity."
                  : "Your financing estimate is driven by recent platform revenue and updates as more qualifying orders come in."
                : "Upgrade your plan to unlock financing readiness tracking and live credit estimates from this dashboard."}
            </p>

            {hasAccess && !loading && !eligibility.isEligible && eligibility.missingRequirements.length > 0 && (
              <div className="mt-4 rounded-[1rem] border border-amber-200 bg-amber-50/80 p-3.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100">
                  <CircleAlert className="h-4 w-4" />
                  Missing requirements
                </div>
                <div className="mt-3 space-y-2">
                  {eligibility.missingRequirements.map((requirement) => (
                    <p key={requirement.label} className="text-sm text-amber-900 dark:text-amber-100">
                      {requirement.label}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {isCompanyBorrower && (
              <div className="mt-4 rounded-[1rem] border border-border bg-background/70 p-3.5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Company credit notes
                </p>
                <div className="mt-3 space-y-3">
                  {companyBenefits.map((benefit) => (
                    <div key={benefit} className="flex items-start gap-3 text-sm text-foreground">
                      <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{benefit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              {hasAccess ? (
                <>
                  <Button asChild className="rounded-xl">
                    <Link to="/dashboard/profile?section=payout">
                      {eligibility.isEligible ? "Update Financing Profile" : "Prepare Financing Profile"}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="rounded-xl">
                    <Link to="/dashboard/profile?section=verification">Open Verification</Link>
                  </Button>
                </>
              ) : (
                <Button asChild className="rounded-xl">
                  <Link to="/dashboard/upgrade">
                    Upgrade Plan
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="space-y-4"
          >
            <div className="rounded-[1.1rem] border border-border/70 bg-white/90 p-3.5 shadow-[0_16px_28px_-24px_rgba(15,23,42,0.18)] dark:bg-card/90">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[0.9rem] bg-primary/10">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-bold text-foreground">Loan Readiness</h3>
                  <p className="text-sm text-muted-foreground">The operational checks that shape approval.</p>
                </div>
              </div>

              <div className="space-y-3">
                {eligibility.readinessChecks.map((item, index) => {
                  const Icon = readinessIcons[index] ?? BadgeCheck;
                  return (
                    <div
                      key={item.label}
                      className="flex flex-wrap items-center gap-3 rounded-[0.95rem] border border-border bg-background/70 px-3.5 py-2.5"
                    >
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                          item.met ? "bg-emerald-100 dark:bg-emerald-500/10" : "bg-amber-100 dark:bg-amber-500/10"
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 ${
                            item.met ? "text-primary" : "text-amber-600 dark:text-amber-300"
                          }`}
                        />
                      </div>
                      <span className="min-w-0 flex-1 text-sm leading-6 text-foreground">{item.label}</span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                          item.met
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                        }`}
                      >
                        {item.met ? "Ready" : "Missing"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[1.1rem] border border-border/70 bg-white/90 p-3.5 shadow-[0_16px_28px_-24px_rgba(15,23,42,0.18)] dark:bg-card/90">
              <h3 className="font-display text-xl font-bold text-foreground">Why This Score Moves</h3>
              <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                <p>Paid and completed orders strengthen your financing history and raise the revenue ceiling.</p>
                <p>Verified identity and complete payout details reduce approval friction for disbursement.</p>
                <p>Contact details and county information improve lender confidence in your operating profile.</p>
              </div>
            </div>
          </motion.aside>
        </div>
      ) : null}

      {showBorrowLoanSection ? (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-[1.1rem] border border-sky-100/80 bg-white/95 p-3.5 shadow-[0_16px_28px_-24px_rgba(14,165,233,0.22)] dark:border-sky-500/20 dark:bg-card/90"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[0.9rem] bg-sky-100">
                <Banknote className="h-5 w-5 text-sky-700" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-foreground">Borrow Loan</h3>
                <p className="text-sm text-muted-foreground">
                  Review financing products and borrow the right option.
                </p>
              </div>
            </div>

            <div className="rounded-full border border-border bg-background/80 px-4 py-2 text-sm font-medium text-muted-foreground">
              {eligibility.isEligible
                ? "Financing window open"
                : hasAccess
                  ? "Complete readiness to unlock more"
                  : "Upgrade to unlock live financing"}
            </div>
          </div>

          {loanOffersLoading ? (
            <div className="rounded-[1rem] border border-border bg-background/60 p-4 text-sm text-muted-foreground">
              Loading published loan offers...
            </div>
          ) : fundingOptions.length === 0 ? (
            <div className="rounded-[1rem] border border-dashed border-sky-200 bg-sky-50/60 p-4 text-sm text-muted-foreground">
              No published loan offers are live yet. Once admin creates one, it will appear here for qualified borrowers.
            </div>
          ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {fundingOptions.map((option) => {
              const optionHasDuplicate = Boolean(option.productType && activeLoanTypes.has(option.productType));

              return (
                <div
                  key={option.title}
                  className="flex h-full min-w-0 flex-col rounded-[1rem] border border-border/70 bg-white/95 p-3.5 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-card/95"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="rounded-full bg-foreground/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:bg-white/5 dark:text-slate-300">
                      Product
                    </span>
                    <span className="text-sm font-medium text-muted-foreground">{option.speed}</span>
                  </div>

                  <p className="mt-3 max-w-full break-words font-display text-[1.25rem] font-bold leading-tight text-foreground sm:text-[1.4rem]">
                    {option.title}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${option.securityType === "collateral" ? "bg-amber-100 text-amber-800" : option.securityType === "guarantor" ? "bg-fuchsia-100 text-fuchsia-800" : "bg-slate-100 text-slate-700"}`}>
                      {SECURITY_TYPE_LABELS[option.securityType]}
                    </span>
                    {option.requiresBranchVisit ? (
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                        Branch visit required
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 rounded-[0.95rem] border border-border bg-background p-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Amount Available
                    </p>
                    <p className="mt-2 break-words font-display text-[1.45rem] font-black leading-tight tracking-tight text-foreground sm:text-[1.7rem]">
                      {option.amount}
                    </p>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                      Published by admin and adjusted to your current eligibility limit.
                    </p>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{option.detail}</p>
                  {option.requiresBranchVisit || option.securityType !== "unsecured" ? (
                    <div className="mt-3 rounded-[0.85rem] border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-sm text-amber-900">
                      {option.branchInstructions || "Bring the required collateral documents to the branch. Once the branch accepts your file, the loan can be released."}
                    </div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <div className="rounded-[0.85rem] border border-border bg-background px-3 py-2.5 dark:border-white/10 dark:bg-slate-950/80">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Interest
                      </p>
                      <p className="mt-1 text-sm font-semibold leading-6 text-foreground">{option.interestRate}% p.a.</p>
                    </div>
                    <div className="rounded-[0.85rem] border border-border bg-background px-3 py-2.5 dark:border-white/10 dark:bg-slate-950/80">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Repayment
                      </p>
                      <p className="mt-1 text-sm font-semibold leading-6 text-foreground">
                        {option.repaymentDays} days
                      </p>
                    </div>
                  </div>

                  <div className="mt-auto pt-5">
                    <div className="flex flex-wrap gap-3">
                      <div className="rounded-[0.85rem] border border-border bg-background px-3 py-2.5 dark:border-white/10 dark:bg-slate-950/80">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Speed
                        </p>
                        <p className="mt-1 text-sm font-semibold leading-6 text-foreground">{option.speed}</p>
                      </div>
                      <div className="rounded-[0.85rem] border border-border bg-background px-3 py-2.5 dark:border-white/10 dark:bg-slate-950/80">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Status
                        </p>
                        <p className="mt-1 text-sm font-semibold leading-6 text-foreground">
                          {optionHasDuplicate ? "Already applied" : eligibility.isEligible ? "Available" : hasAccess ? "Needs readiness" : "Plan locked"}
                        </p>
                      </div>
                    </div>

                    {optionHasDuplicate ? (
                      <div className="mt-4 rounded-[0.85rem] border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-800">
                        You already have this loan type in progress. You can still apply for another posted loan.
                      </div>
                    ) : null}

                    <Button
                      type="button"
                      className="mt-4 w-full rounded-xl"
                      disabled={!eligibility.isEligible || optionHasDuplicate || option.rawAmount <= 0 || applyingProduct === option.key}
                      onClick={() => void handleBorrow(option.key, option.amount)}
                    >
                      {applyingProduct === option.key ? "Submitting..." : "Borrow This Loan"}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </motion.section>
      ) : null}

      {showManageLoanSection ? (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="space-y-4"
        >
          <div className="grid gap-4 grid-cols-1">
            <div className="rounded-[1.1rem] border border-border/70 bg-white/90 p-3.5 shadow-[0_16px_28px_-24px_rgba(15,23,42,0.18)] dark:bg-card/90">
              <div className="mb-4 flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-[0.9rem] ${isRepaySection ? "bg-sky-100" : "bg-primary/10"}`}>
                  <CreditCard className={`h-5 w-5 ${isRepaySection ? "text-sky-700" : "text-primary"}`} />
                </div>
                <div>
                  <h3 className="font-display text-xl font-bold text-foreground">{isRepaySection ? "Repay Loan" : "Loan Status"}</h3>
                  <p className="text-sm text-muted-foreground">
                    {isRepaySection
                      ? "Use this page for repayment actions on active loans only."
                      : "Use this page to monitor the current status of all your loans."}
                  </p>
                </div>
              </div>

              <div className={`mb-3 rounded-[0.95rem] border p-3 ${isRepaySection ? "border-sky-100 bg-sky-50/60 dark:border-sky-500/20 dark:bg-sky-500/10" : "border-border/70 bg-background/70 dark:border-white/10 dark:bg-background/60"}`}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-foreground">{isRepaySection ? "Repayment Center" : "Loan Status Center"}</p>
                    <p className="text-xs text-muted-foreground">
                      {isRepaySection
                        ? "Search active loans, check balances, and pay the next installment."
                        : "Search loans, review balances, and track active or closed loan status."}
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="rounded-[0.85rem] border border-border bg-background px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isRepaySection ? "Repayable" : "Active"}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{isRepaySection ? repayableApplications.length : activeApplications.length}</p>
                      </div>
                      <div className="rounded-[0.85rem] border border-border bg-background px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Outstanding</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{currency.format(activeLoanBalance)}</p>
                      </div>
                      <div className="rounded-[0.85rem] border border-border bg-background px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isRepaySection ? "Latest Loan" : "Borrowed"}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{isRepaySection ? (latestRepayableApplication ? latestRepayableApplication.id.slice(0, 8).toUpperCase() : "None") : currency.format(totalBorrowedAmount)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="w-full xl:max-w-sm">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={loanListSearch}
                        onChange={(event) => setLoanListSearch(event.target.value)}
                        placeholder={isRepaySection ? "Search active loans" : "Search loans"}
                        className="h-10 rounded-xl pl-9"
                      />
                    </div>
                  </div>
                </div>
              </div>

            <Tabs value={isRepaySection ? "active" : loanSidebarView} onValueChange={(value) => !isRepaySection && setLoanSidebarView(value as "active" | "closed")} className="w-full">
              {!isRepaySection ? (
                <TabsList className="grid w-full grid-cols-2 rounded-[0.85rem] bg-muted p-1">
                  <TabsTrigger value="active" className="rounded-[0.8rem]">Active Loans</TabsTrigger>
                  <TabsTrigger value="closed" className="rounded-[0.8rem]">Closed Loans</TabsTrigger>
                </TabsList>
              ) : null}

              <TabsContent value="active" className="mt-5 space-y-3">
                {applicationsLoading ? (
                  <div className="rounded-[0.95rem] border border-border bg-background/70 p-3 text-sm text-muted-foreground">
                    Loading active loans...
                  </div>
                ) : !activeApplications.length ? (
                  <div className="rounded-[0.95rem] border border-dashed border-border bg-background/50 p-3 text-sm text-muted-foreground">
                    {loanListSearch ? "No active loans match that search." : "No active loans yet. Borrow a product in Step 2 to manage it here."}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-[0.95rem] border border-border/70 bg-white/95 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-card/90 dark:shadow-[0_12px_24px_-24px_rgba(0,0,0,0.45)]">
                    <table className="w-full min-w-[1180px] border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-sky-50/70 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:bg-primary/5">
                          <th className="px-3 py-3">#</th>
                          <th className="px-3 py-3">Loan No</th>
                          <th className="px-3 py-3">Loan Date</th>
                          <th className="px-3 py-3">Product</th>
                          <th className="px-3 py-3">Loan Amt</th>
                          <th className="px-3 py-3">Int P.A</th>
                          <th className="px-3 py-3">Balance</th>
                          <th className="px-3 py-3">Repay</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeApplications.map((application, index) => (
                          <tr key={application.id} className="border-b border-border/70 align-middle last:border-b-0 hover:bg-muted/20">
                            <td className="px-3 py-3 text-sm font-semibold text-foreground">{index + 1}</td>
                            <td className="px-3 py-3 text-sm font-medium text-foreground">{application.id.slice(0, 8).toUpperCase()}</td>
                            <td className="px-3 py-3 text-sm text-muted-foreground">
                              {formatScheduleDate(application.loan_summary.startDate)}
                            </td>
                            <td className="px-3 py-3">
                              <p className="font-medium text-foreground">{application.product_title}</p>
                              <p className="text-xs text-muted-foreground">
                                {application.repayment_days ?? 0} day term
                              </p>
                            </td>
                            <td className="px-3 py-3 text-sm font-semibold text-foreground">
                              {currency.format(application.approved_amount ?? application.requested_amount)}
                            </td>
                            <td className="px-3 py-3 text-sm text-foreground">
                              {application.interest_rate !== null ? `${application.interest_rate}%` : "Pending"}
                            </td>
                            <td className="px-3 py-3">
                              <p className="text-sm font-semibold text-foreground">{currency.format(application.loan_summary.remainingBalance)}</p>
                              <p className="text-xs text-muted-foreground">
                                Repaid {currency.format(application.loan_summary.totalRepaid)}
                              </p>
                            </td>
                            <td className="px-3 py-3">
                              <p className="text-sm font-semibold text-foreground">{currency.format(application.loan_summary.scheduledPayment)}</p>
                              <p className="text-xs text-muted-foreground">
                                {application.loan_summary.actualNumberOfPayments} payment{application.loan_summary.actualNumberOfPayments === 1 ? "" : "s"}
                              </p>
                            </td>
                            <td className="px-3 py-3">
                              <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                                {application.status.replace("_", " ")}
                              </span>
                              {application.requires_branch_visit ? (
                                <p className="mt-1 text-xs text-muted-foreground">{getBranchStatusLabel(application.branch_visit_status)}</p>
                              ) : null}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg"
                                  onClick={() => setSelectedLoanReceipt(application)}
                                  title="Open receipt"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg"
                                  onClick={() => downloadLoanReceipt(application)}
                                  title="Download receipt"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg"
                                  disabled={repayingLoanId === application.id || !isLoanRepayable(application)}
                                  onClick={() => openRepaymentDialog(application)}
                                  title="Pay loan"
                                >
                                  <Banknote className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {!isRepaySection ? (
              <TabsContent value="closed" className="mt-5 space-y-3">
                {applicationsLoading ? (
                  <div className="rounded-[0.95rem] border border-border bg-background/70 p-3 text-sm text-muted-foreground">
                    Loading closed loans...
                  </div>
                ) : !closedApplications.length ? (
                  <div className="rounded-[0.95rem] border border-dashed border-border bg-background/50 p-3 text-sm text-muted-foreground">
                    {loanListSearch ? "No closed loans match that search." : "Closed or fully repaid loans will appear here."}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-[0.95rem] border border-border/70 bg-white/95 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-card/90 dark:shadow-[0_12px_24px_-24px_rgba(0,0,0,0.45)]">
                    <table className="w-full min-w-[1080px] border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:bg-primary/5">
                          <th className="px-3 py-3">#</th>
                          <th className="px-3 py-3">Loan No</th>
                          <th className="px-3 py-3">Product</th>
                          <th className="px-3 py-3">Amount</th>
                          <th className="px-3 py-3">Total Repaid</th>
                          <th className="px-3 py-3">Closed On</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {closedApplications.map((application, index) => (
                          <tr key={application.id} className="border-b border-border/70 align-middle last:border-b-0 hover:bg-muted/20">
                            <td className="px-3 py-3 text-sm font-semibold text-foreground">{index + 1}</td>
                            <td className="px-3 py-3 text-sm font-medium text-foreground">{application.id.slice(0, 8).toUpperCase()}</td>
                            <td className="px-3 py-3">
                              <p className="font-medium text-foreground">{application.product_title}</p>
                              <p className="text-xs text-muted-foreground">
                                Started {formatScheduleDate(application.loan_summary.startDate)}
                              </p>
                            </td>
                            <td className="px-3 py-3 text-sm font-semibold text-foreground">
                              {currency.format(application.approved_amount ?? application.requested_amount)}
                            </td>
                            <td className="px-3 py-3 text-sm text-foreground">
                              {currency.format(application.loan_summary.totalRepaid)}
                            </td>
                            <td className="px-3 py-3 text-sm text-muted-foreground">
                              {application.repaid_at ? formatScheduleDate(application.repaid_at) : "Closed"}
                            </td>
                            <td className="px-3 py-3">
                              <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                                {application.status.replace("_", " ")}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg"
                                  onClick={() => setSelectedLoanReceipt(application)}
                                  title="Open receipt"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg"
                                  onClick={() => downloadLoanReceipt(application)}
                                  title="Download receipt"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>
              ) : null}
            </Tabs>
            </div>
          </div>
        </motion.section>
      ) : null}

      <Dialog open={Boolean(selectedLoanReceipt)} onOpenChange={(open) => !open && setSelectedLoanReceipt(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[2rem] sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Loan Receipt</DialogTitle>
            <DialogDescription>
              Full loan schedule, repayment history, and downloadable receipt details.
            </DialogDescription>
          </DialogHeader>

          {selectedLoanReceipt ? (
            <div className="space-y-4">
              {selectedLoanReceipt.disbursement_method === "voucher" && selectedLoanReceipt.voucher_code ? (
                <div className="mb-4 flex flex-col items-center justify-center rounded-[1.25rem] border border-emerald-200 bg-emerald-50/50 p-6 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                  <p className="mb-4 font-semibold text-emerald-800">AgriLink Digital Voucher</p>
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                    <QRCode value={selectedLoanReceipt.voucher_code} size={150} />
                  </div>
                  <p className="mt-4 font-mono text-xl font-bold tracking-widest text-emerald-900">{selectedLoanReceipt.voucher_code}</p>
                  <p className="mt-2 text-center text-sm text-emerald-700/80">Show this QR code at a verified Agro-vet dealer to collect your items.</p>
                </div>
              ) : null}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-2xl font-bold text-foreground">{selectedLoanReceipt.product_title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Requested {currency.format(selectedLoanReceipt.requested_amount)}
                    {selectedLoanReceipt.approved_amount ? ` | Approved ${currency.format(selectedLoanReceipt.approved_amount)}` : ""}
                  </p>
                </div>
                  <div className="flex flex-wrap gap-2">
                  {isLoanRepayable(selectedLoanReceipt) ? (
                    <Button type="button" className="rounded-xl" onClick={() => { setSelectedLoanReceipt(null); openRepaymentDialog(selectedLoanReceipt); }}>
                      Pay with M-Pesa
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => downloadLoanReceipt(selectedLoanReceipt)}>
                    Download Receipt
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[1rem] border border-border bg-background px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Loan Balance</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{currency.format(selectedLoanReceipt.loan_summary.remainingBalance)}</p>
                </div>
                <div className="rounded-[1rem] border border-border bg-background px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Scheduled Payment</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{currency.format(selectedLoanReceipt.loan_summary.scheduledPayment)}</p>
                </div>
                <div className="rounded-[1rem] border border-border bg-background px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Total Repaid</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{currency.format(selectedLoanReceipt.loan_summary.totalRepaid)}</p>
                </div>
                <div className="rounded-[1rem] border border-border bg-background px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Start Date</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{formatScheduleDate(selectedLoanReceipt.loan_summary.startDate)}</p>
                </div>
                <div className="rounded-[1rem] border border-border bg-background px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Repayment Mode</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {selectedLoanReceipt.repayment_method === "pay_with_produce" ? "Pay-with-Produce" : "Standard M-Pesa"}
                  </p>
                </div>
              </div>

              {(selectedLoanReceipt.requires_branch_visit || selectedLoanReceipt.security_type !== "unsecured") ? (
                <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50/70 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-800">Security Review</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[1rem] border border-amber-200 bg-white/80 px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Security Type</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{SECURITY_TYPE_LABELS[selectedLoanReceipt.security_type]}</p>
                      </div>
                      <div className="rounded-[1rem] border border-amber-200 bg-white/80 px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Branch Status</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{getBranchStatusLabel(selectedLoanReceipt.branch_visit_status)}</p>
                      </div>
                      <div className="rounded-[1rem] border border-amber-200 bg-white/80 px-4 py-3 sm:col-span-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Eligible County</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{selectedLoanReceipt.target_county || "County to be confirmed"}</p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-[1rem] border border-amber-200 bg-white/80 px-4 py-3 text-sm text-muted-foreground">
                      <p className="font-semibold text-foreground">{selectedLoanReceipt.branch_name || "Branch assignment pending"}{selectedLoanReceipt.branch_location ? ` | ${selectedLoanReceipt.branch_location}` : ""}</p>
                      <p className="mt-2">{selectedLoanReceipt.branch_instructions || "Bring the required documents to the branch. Once the branch accepts and clears your file, the loan is released."}</p>
                    </div>
                  </div>
                  <div className="rounded-[1.5rem] border border-border bg-background/80 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Document Checklist</p>
                    <div className="mt-3 space-y-2">
                      {(selectedLoanReceipt.required_documents.length ? selectedLoanReceipt.required_documents : ["Original ID", "KRA PIN", "Collateral ownership document"]).map((item) => (
                        <div key={`${selectedLoanReceipt.id}-${item}`} className="rounded-[0.9rem] border border-border bg-background px-3 py-2 text-sm text-foreground">{item}</div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="rounded-[1.5rem] border border-border bg-background/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-foreground">Loan Amortization Schedule</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      A receipt-style repayment schedule based on your approved amount, interest, and term.
                    </p>
                  </div>
                  <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                    {selectedLoanReceipt.interest_rate !== null
                      ? `${selectedLoanReceipt.interest_rate}% p.a. | ${(selectedLoanReceipt.interest_rate / 12).toFixed(2)}% monthly`
                      : "Interest pending"}
                  </span>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[980px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="px-3 py-2">Payment #</th>
                        <th className="px-3 py-2">Payment Date</th>
                        <th className="px-3 py-2">Beginning Balance</th>
                        <th className="px-3 py-2">Scheduled Payment</th>
                        <th className="px-3 py-2">Principal</th>
                        <th className="px-3 py-2">Interest</th>
                        <th className="px-3 py-2">Ending Balance</th>
                        <th className="px-3 py-2">Cumulative Interest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedLoanReceipt.amortization_schedule.map((row) => (
                        <tr key={`${selectedLoanReceipt.id}-${row.paymentNumber}`} className="border-b border-border/60 last:border-b-0">
                          <td className="px-3 py-2.5">{row.paymentNumber}</td>
                          <td className="px-3 py-2.5">{formatScheduleDate(row.paymentDate)}</td>
                          <td className="px-3 py-2.5">{currency.format(row.beginningBalance)}</td>
                          <td className="px-3 py-2.5">{currency.format(row.scheduledPayment)}</td>
                          <td className="px-3 py-2.5">{currency.format(row.principal)}</td>
                          <td className="px-3 py-2.5">{currency.format(row.interest)}</td>
                          <td className="px-3 py-2.5">{currency.format(row.endingBalance)}</td>
                          <td className="px-3 py-2.5">{currency.format(row.cumulativeInterest)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[1rem] border border-border bg-background px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Loan amount</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{currency.format(selectedLoanReceipt.loan_summary.principal)}</p>
                  </div>
                  <div className="rounded-[1rem] border border-border bg-background px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Scheduled payments</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{selectedLoanReceipt.loan_summary.scheduledNumberOfPayments}</p>
                  </div>
                  <div className="rounded-[1rem] border border-border bg-background px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Actual repayments</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{selectedLoanReceipt.loan_summary.actualNumberOfPayments}</p>
                  </div>
                  <div className="rounded-[1rem] border border-border bg-background px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Total interest</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{currency.format(selectedLoanReceipt.loan_summary.totalInterest)}</p>
                  </div>
                </div>

                {selectedLoanReceipt.guarantors && selectedLoanReceipt.guarantors.length > 0 && (
                  <div className="mt-4 rounded-[1rem] border border-border bg-background/50 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-3">Guarantors</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                       {selectedLoanReceipt.guarantors.map((guarantor, idx) => (
                         <div key={idx} className="flex flex-col rounded-lg border border-border/50 bg-background/30 p-2.5">
                           <p className="text-sm font-semibold text-foreground">{guarantor.name}</p>
                           <p className="mt-0.5 text-xs text-muted-foreground">{guarantor.relationship} • {guarantor.phone}</p>
                         </div>
                       ))}
                    </div>
                  </div>
                )}

                {selectedLoanReceipt.collateral_items.length > 0 && (
                  <div className="mt-4 rounded-[1rem] border border-border bg-background/50 p-4">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Collateral</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {selectedLoanReceipt.collateral_items.map((item, idx) => (
                        <div key={`${selectedLoanReceipt.id}-item-${idx}`} className="rounded-lg border border-border/50 bg-background/30 p-3">
                          <p className="text-sm font-semibold text-foreground">{item.asset_type.replace(/_/g, " ")}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{item.description || item.document_reference || "Collateral item submitted during application."}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{item.owner_name || "Owner not specified"}{item.estimated_value ? ` | ${currency.format(item.estimated_value)}` : ""}</p>
                          {item.location ? <p className="mt-1 text-xs text-muted-foreground">Location: {item.location}</p> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Repayment History</p>
                  <div className="mt-3 space-y-2">
                    {selectedLoanReceipt.repayments.length ? selectedLoanReceipt.repayments.map((repayment) => (
                      <div key={repayment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border border-border bg-background px-4 py-3 text-sm">
                        <div>
                          <p className="font-semibold text-foreground">{currency.format(repayment.amount)}</p>
                          <p className="text-muted-foreground">{repayment.payment_ref || "Manual repayment"}</p>
                        </div>
                        <div className="text-left text-muted-foreground md:text-right">
                          <p>{formatScheduleDate(repayment.created_at)}</p>
                          <p>{repayment.phone_number || repayment.payment_method || "Repayment"}</p>
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-[1rem] border border-dashed border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                        No repayments posted yet. Use the Pay with M-Pesa button to record the next payment.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(repaymentDialogLoan)} onOpenChange={(open) => !open && setRepaymentDialogLoan(null)}>
        <DialogContent className="rounded-[2rem] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Repay Loan via M-Pesa</DialogTitle>
            <DialogDescription>
              Enter the amount and the phone number that should receive the STK push prompt on the SIM card.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-[1.25rem] border border-border bg-background/70 p-4 text-sm">
              <p className="font-semibold text-foreground">{repaymentDialogLoan?.product_title}</p>
              <p className="mt-1 text-muted-foreground">
                Current balance: {currency.format(repaymentDialogLoan?.loan_summary.remainingBalance ?? 0)}
              </p>
              <p className="mt-1 text-muted-foreground">
                Interest: {repaymentDialogLoan?.interest_rate !== null && repaymentDialogLoan?.interest_rate !== undefined
                  ? `${repaymentDialogLoan.interest_rate}% per annum`
                  : "Pending"}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="repayment-amount">Amount to pay</label>
              <input
                id="repayment-amount"
                type="text"
                inputMode="decimal"
                value={repaymentAmount}
                onChange={(event) => setRepaymentAmount(sanitizeDecimalInput(event.target.value, { maxDecimals: 2 }))}
                placeholder="KES amount"
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="repayment-phone">M-Pesa number</label>
              <input
                id="repayment-phone"
                type="tel"
                inputMode="tel"
                value={repaymentPhone}
                onChange={(event) => setRepaymentPhone(sanitizePhoneInput(event.target.value))}
                placeholder="07XXXXXXXX"
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
              />
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setRepaymentDialogLoan(null)}>
              Cancel
            </Button>
            <Button type="button" className="rounded-xl" disabled={repayingLoanId === repaymentDialogLoan?.id} onClick={() => void handleRepayment()}>
              {repayingLoanId === repaymentDialogLoan?.id ? "Sending prompt..." : "Send M-Pesa Prompt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isLoanRequestDialogOpen} onOpenChange={(open) => { setIsLoanRequestDialogOpen(open); if (!open) resetLoanRequestForm(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[2rem] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Finalize Loan Request</DialogTitle>
            <DialogDescription>
              Review your loan details, then add the branch, guarantor, or collateral information needed for this application.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="rounded-[1.25rem] border border-sky-100 bg-sky-50/50 p-4 dark:border-sky-500/20 dark:bg-sky-500/10">
              <p className="font-display text-lg font-bold text-foreground">{selectedOffer?.title}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${selectedOffer?.securityType === "collateral" ? "bg-amber-100 text-amber-800" : selectedOffer?.securityType === "guarantor" ? "bg-fuchsia-100 text-fuchsia-800" : "bg-slate-100 text-slate-700"}`}>
                  {selectedOffer ? SECURITY_TYPE_LABELS[selectedOffer.securityType] : "Loan"}
                </span>
                {selectedOffer?.requiresBranchVisit ? (
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                    Branch visit required
                  </span>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Interest Rate</p>
                  <p className="font-semibold text-foreground">{selectedOffer?.interestRate}% p.a.</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Repayment Period</p>
                  <p className="font-semibold text-foreground">{selectedOffer?.repaymentDays} days</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-foreground" htmlFor="loan-amount">Requested Amount (KES)</label>
              <Input
                id="loan-amount"
                type="text"
                inputMode="decimal"
                value={requestedLoanAmount}
                onChange={(e) => setRequestedLoanAmount(sanitizeDecimalInput(e.target.value, { maxDecimals: 2 }))}
                placeholder="Enter amount"
                className="h-12 rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                Maximum available: {selectedOffer?.amount}
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-foreground">Disbursement Method</label>
              <div className="grid grid-cols-2 gap-3">
                <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 ${disbursementMethod === "mpesa" ? "border-primary bg-primary/5 text-primary" : "border-border bg-background text-muted-foreground"}`}>
                  <input type="radio" className="hidden" checked={disbursementMethod === "mpesa"} onChange={() => setDisbursementMethod("mpesa")} />
                  <Banknote className="h-4 w-4" />
                  <span className="text-sm font-medium">M-Pesa Cash</span>
                </label>
                <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 ${disbursementMethod === "voucher" ? "border-primary bg-primary/5 text-primary" : "border-border bg-background text-muted-foreground"}`}>
                  <input type="radio" className="hidden" checked={disbursementMethod === "voucher"} onChange={() => setDisbursementMethod("voucher")} />
                  <CreditCard className="h-4 w-4" />
                  <span className="text-sm font-medium">Agro-vet Voucher</span>
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-foreground">Repayment Method</label>
              <div className={`grid grid-cols-1 gap-3 ${canUseProduceRepayment ? "sm:grid-cols-2" : ""}`}>
                <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 ${repaymentMethod === "mpesa" ? "border-primary bg-primary/5 text-primary" : "border-border bg-background text-muted-foreground"}`}>
                  <input type="radio" className="hidden" checked={repaymentMethod === "mpesa"} onChange={() => setRepaymentMethod("mpesa")} />
                  <Banknote className="h-4 w-4" />
                  <span className="text-sm font-medium">Standard (M-Pesa)</span>
                </label>
                {canUseProduceRepayment ? (
                  <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 ${repaymentMethod === "pay_with_produce" ? "border-primary bg-primary/5 text-primary" : "border-border bg-background text-muted-foreground"}`}>
                    <input type="radio" className="hidden" checked={repaymentMethod === "pay_with_produce"} onChange={() => setRepaymentMethod("pay_with_produce")} />
                    <Sparkles className="h-4 w-4" />
                    <span className="text-sm font-medium">Pay with Produce</span>
                  </label>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {repaymentMethod === "pay_with_produce" 
                  ? "Your outstanding loan balance will be automatically deducted from your future verified marketplace sales." 
                  : canUseProduceRepayment
                    ? "You will manually initiate repayments via M-Pesa push prompts."
                    : "This loan currently repays through M-Pesa only."}
              </p>
            </div>

            {(selectedOffer?.requiresBranchVisit || (selectedOffer?.requiredDocuments.length ?? 0) > 0) ? (
              <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50/70 p-4">
                <p className="text-sm font-semibold text-foreground">Branch Verification</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {selectedOffer?.branchInstructions || "Visit the branch with the listed documents so the team can review ownership and collateral paperwork before disbursement."}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1rem] border border-amber-200 bg-white/80 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Branch</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{selectedOffer?.branchName || "Assigned after submission"}</p>
                    {selectedOffer?.branchLocation ? <p className="mt-1 text-xs text-muted-foreground">{selectedOffer.branchLocation}</p> : null}
                  </div>
                  <div className="rounded-[1rem] border border-amber-200 bg-white/80 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Eligible County</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{selectedOffer?.targetCounty || "County to be confirmed"}</p>
                  </div>
                  <div className="rounded-[1rem] border border-amber-200 bg-white/80 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Required Documents</p>
                    <div className="mt-2 space-y-2">
                      {(selectedOffer?.requiredDocuments.length ? selectedOffer.requiredDocuments : ["Original ID", "KRA PIN", "Collateral ownership document"]).map((item) => (
                        <div key={`required-${item}`} className="rounded-[0.8rem] border border-border bg-background px-3 py-2 text-xs text-foreground">{item}</div>
                      ))}
                    </div>
                  </div>
                </div>
                {selectedOffer?.requiresBranchVisit ? (
                  <label className="mt-4 flex items-start gap-3 rounded-[1rem] border border-amber-200 bg-white/80 px-4 py-3 text-sm text-foreground">
                    <input type="checkbox" checked={branchVisitAcknowledged} onChange={(event) => setBranchVisitAcknowledged(event.target.checked)} className="mt-1 h-4 w-4 rounded border-border" />
                    <span>I understand this loan will stay under branch review until I bring the required documents and collateral paperwork.</span>
                  </label>
                ) : null}
              </div>
            ) : null}

            {selectedOffer?.securityType === "collateral" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-foreground">Collateral Details</label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg text-xs"
                    onClick={() => setCollateralItems([...collateralItems, { ...DEFAULT_COLLATERAL_ITEM, asset_type: collateralItems[0]?.asset_type || "title_deed" }])}
                  >
                    Add Collateral
                  </Button>
                </div>

                {selectedOffer?.collateralTypes.length ? (
                  <div className="rounded-[1rem] border border-border bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                    Accepted security: {selectedOffer.collateralTypes.join(", ")}
                  </div>
                ) : null}

                {collateralItems.map((item, index) => (
                  <div key={`collateral-${index}`} className="relative space-y-3 rounded-xl border border-border p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Asset Type</p>
                        <select
                          value={item.asset_type}
                          onChange={(event) => {
                            const next = [...collateralItems];
                            next[index].asset_type = event.target.value;
                            setCollateralItems(next);
                          }}
                          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                        >
                          {COLLATERAL_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Reference Number</p>
                        <Input
                          value={item.document_reference ?? ""}
                          onChange={(event) => {
                            const next = [...collateralItems];
                            next[index].document_reference = event.target.value;
                            setCollateralItems(next);
                          }}
                          placeholder="Title deed / logbook number"
                          className="h-10 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Owner Name</p>
                        <Input
                          value={item.owner_name ?? ""}
                          onChange={(event) => {
                            const next = [...collateralItems];
                            next[index].owner_name = event.target.value;
                            setCollateralItems(next);
                          }}
                          placeholder="Registered owner"
                          className="h-10 rounded-lg text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Estimated Value (KES)</p>
                        <Input
                          type="number"
                          value={item.estimated_value ?? ""}
                          onChange={(event) => {
                            const next = [...collateralItems];
                            next[index].estimated_value = event.target.value ? Number(event.target.value) : null;
                            setCollateralItems(next);
                          }}
                          placeholder="Estimated collateral value"
                          className="h-10 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Description</p>
                      <Input
                        value={item.description ?? ""}
                        onChange={(event) => {
                          const next = [...collateralItems];
                          next[index].description = event.target.value;
                          setCollateralItems(next);
                        }}
                        placeholder="Plot details, asset description, livestock type, etc."
                        className="h-10 rounded-lg text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Location</p>
                        <Input
                          value={item.location ?? ""}
                          onChange={(event) => {
                            const next = [...collateralItems];
                            next[index].location = event.target.value;
                            setCollateralItems(next);
                          }}
                          placeholder="Property or asset location"
                          className="h-10 rounded-lg text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Notes</p>
                        <Input
                          value={item.notes ?? ""}
                          onChange={(event) => {
                            const next = [...collateralItems];
                            next[index].notes = event.target.value;
                            setCollateralItems(next);
                          }}
                          placeholder="Extra branch notes"
                          className="h-10 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    {collateralItems.length > 1 ? (
                      <button
                        type="button"
                        className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600 shadow-sm hover:bg-red-200"
                        onClick={() => setCollateralItems(collateralItems.filter((_, i) => i !== index))}
                      >
                        x
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-foreground">
                  Guarantors {selectedOffer?.securityType === "guarantor" ? "(required)" : "(optional)"}
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg text-xs"
                  onClick={() => setGuarantors([...guarantors, { name: "", phone: "", relationship: "" }])}
                >
                  Add Another
                </Button>
              </div>

              {guarantors.map((guarantor, index) => (
                <div key={index} className="relative space-y-3 rounded-xl border border-border p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Full Name</p>
                      <Input
                        value={guarantor.name}
                        onChange={(e) => {
                          const newG = [...guarantors];
                          newG[index].name = e.target.value;
                          setGuarantors(newG);
                        }}
                        placeholder="Guarantor Name"
                        className="h-10 rounded-lg text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Phone Number</p>
                      <Input
                        type="tel"
                        inputMode="tel"
                        value={guarantor.phone}
                        onChange={(e) => {
                          const newG = [...guarantors];
                          newG[index].phone = sanitizePhoneInput(e.target.value);
                          setGuarantors(newG);
                        }}
                        placeholder="07XXXXXXXX"
                        className="h-10 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Relationship</p>
                    <Input
                      value={guarantor.relationship}
                      onChange={(e) => {
                        const newG = [...guarantors];
                        newG[index].relationship = e.target.value;
                        setGuarantors(newG);
                      }}
                      placeholder="e.g. Spouse, Business Partner"
                      className="h-10 rounded-lg text-sm"
                    />
                  </div>
                  {guarantors.length > 1 && (
                    <button
                      type="button"
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600 shadow-sm hover:bg-red-200"
                      onClick={() => setGuarantors(guarantors.filter((_, i) => i !== index))}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="mt-8 flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setIsLoanRequestDialogOpen(false);
                resetLoanRequestForm();
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              disabled={applyingProduct === selectedOffer?.key}
              onClick={() => void handleConfirmBorrow()}
            >
              {applyingProduct === selectedOffer?.key ? "Submitting Request..." : selectedOffer?.requiresBranchVisit || selectedOffer?.securityType !== "unsecured" ? "Submit for Branch Review" : "Confirm & Request Loan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function MicroLoans() {
  const [searchParams] = useSearchParams();
  const isIsolated = searchParams.get("isolated") === "true";
  const { role } = useAuth();
  const hasAccess = isIsolated || role === "farmer_pro" || role === "company";

  return <DashboardShell title="Micro Loans">{hasAccess ? <MicroLoansDashboard /> : <ProGate />}</DashboardShell>;
}
