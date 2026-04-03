import { useEffect, useState } from "react";
import { Search, Trash2, Wallet } from "lucide-react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { AdminLoanOffer, adminTone, initialLoanOfferForm, LoanOfferFormState, LoanProductType, LoanSecurityType, LoanRole, LOAN_PRODUCT_TITLES, LOAN_SECURITY_OPTIONS, formatCount, formatDateTime, formatMoney } from "./shared";

function loanTypeTone(type: LoanProductType) {
  if (type === "equipment_top_up") return "bg-sky-500/10 text-sky-700 dark:text-sky-300";
  if (type === "buyer_contract_financing") return "bg-violet-500/10 text-violet-700 dark:text-violet-300";
  return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
}

function securityTone(type: LoanSecurityType) {
  if (type === "collateral") return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (type === "guarantor") return "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300";
  return "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

function loanApplicantTone(role: LoanRole) {
  return role === "buyer_enterprise" ? adminTone("sky") : adminTone("emerald");
}

function listToMultiline(items: string[] | null | undefined) {
  return (items ?? []).join("\n");
}

function parseLineList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function LoanOfferCard({
  offer,
  savingKey,
  onUpdate,
  onDelete,
  onSave,
  fullWidth = false,
}: {
  offer: AdminLoanOffer;
  savingKey: string | null;
  onUpdate: (updates: Partial<AdminLoanOffer>) => void;
  onDelete: () => void;
  onSave: () => void;
  fullWidth?: boolean;
}) {
  const applicantTone = loanApplicantTone(offer.applicant_role);
  return (
    <div
      className={`rounded-[1.5rem] border p-5 dark:bg-card/90 dark:shadow-[0_18px_34px_-30px_rgba(0,0,0,0.5)] ${applicantTone.card} ${
        fullWidth ? "w-full" : "w-[360px] shrink-0"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground">{offer.product_title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {offer.applicant_role === "farmer_pro" ? "Visible to qualified farmers" : "Visible to qualified buyer enterprises"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${loanTypeTone(offer.product_type)}`}>
            {LOAN_PRODUCT_TITLES[offer.product_type]}
          </span>
          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${securityTone(offer.security_type)}`}>
            {offer.security_type}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
              offer.is_active ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {offer.is_active ? "active" : "inactive"}
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className={`rounded-[1rem] border px-4 py-3 ${applicantTone.softPanel}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Offer ceiling</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{formatMoney(offer.max_amount)}</p>
        </div>
        <div className="rounded-[1rem] border border-border bg-white/80 px-4 py-3 dark:bg-background/70">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Updated</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{formatDateTime(offer.updated_at)}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <input value={offer.product_title} onChange={(event) => onUpdate({ product_title: event.target.value })} placeholder="Product title" className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground dark:bg-background/70" />
        <input value={offer.max_amount} onChange={(event) => onUpdate({ max_amount: Number(event.target.value) || 0 })} placeholder="Maximum amount" className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground dark:bg-background/70" />
        <input value={offer.interest_rate ?? ""} onChange={(event) => onUpdate({ interest_rate: event.target.value ? Number(event.target.value) : null })} placeholder="Interest rate" className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground dark:bg-background/70" />
        <input value={offer.repayment_days ?? ""} onChange={(event) => onUpdate({ repayment_days: event.target.value ? Number(event.target.value) : null })} placeholder="Repayment days" className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground dark:bg-background/70" />
        <input value={offer.speed ?? ""} onChange={(event) => onUpdate({ speed: event.target.value })} placeholder="Review speed" className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground md:col-span-2 dark:bg-background/70" />
        <select value={offer.security_type} onChange={(event) => onUpdate({ security_type: event.target.value as LoanSecurityType })} className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground dark:bg-background/70">
          {LOAN_SECURITY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm text-muted-foreground dark:bg-background/70">
          <input type="checkbox" checked={offer.requires_branch_visit} onChange={(event) => onUpdate({ requires_branch_visit: event.target.checked })} className="h-4 w-4 rounded border-border" />
          Branch visit required
        </label>
        <input value={offer.branch_name ?? ""} onChange={(event) => onUpdate({ branch_name: event.target.value || null })} placeholder="Branch name" className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground dark:bg-background/70" />
        <input value={offer.branch_location ?? ""} onChange={(event) => onUpdate({ branch_location: event.target.value || null })} placeholder="Branch location" className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground dark:bg-background/70" />
      </div>
      <textarea value={offer.note ?? ""} onChange={(event) => onUpdate({ note: event.target.value })} placeholder="Offer note" className="mt-3 min-h-[96px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground dark:bg-background/70" />
      <textarea value={offer.branch_instructions ?? ""} onChange={(event) => onUpdate({ branch_instructions: event.target.value || null })} placeholder="Branch instructions shown to borrower" className="mt-3 min-h-[88px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground dark:bg-background/70" />
      <div className="mt-3 grid gap-3">
        <textarea value={listToMultiline(offer.collateral_types)} onChange={(event) => onUpdate({ collateral_types: parseLineList(event.target.value) })} placeholder="Accepted collateral types, one per line" className="min-h-[88px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground dark:bg-background/70" />
        <textarea value={listToMultiline(offer.required_documents)} onChange={(event) => onUpdate({ required_documents: parseLineList(event.target.value) })} placeholder="Required documents, one per line" className="min-h-[88px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground dark:bg-background/70" />
      </div>
      <div className="mt-3 flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={offer.is_active} onChange={(event) => onUpdate({ is_active: event.target.checked })} className="h-4 w-4 rounded border-border" />
          Show this offer to borrowers
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="rounded-xl" disabled={savingKey === `delete-offer-${offer.id}`} onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
          <Button type="button" className="rounded-xl" disabled={savingKey === `offer-${offer.id}`} onClick={onSave}>
            Save Offer
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoans() {
  const [loanOffers, setLoanOffers] = useState<AdminLoanOffer[]>([]);
  const [offerSearch, setOfferSearch] = useState("");
  const [offerRoleFilter, setOfferRoleFilter] = useState<"all" | "farmer_pro" | "buyer_enterprise">("all");
  const [loanOfferForm, setLoanOfferForm] = useState<LoanOfferFormState>(initialLoanOfferForm);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadPage = async () => {
    setErrorMessage(null);
    try {
      const offersData = await apiFetch<AdminLoanOffer[]>("/admin/loan-offers");
      setLoanOffers(offersData);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load admin loans.");
    }
  };

  useEffect(() => {
    void loadPage();
  }, []);

  const createLoanOffer = async () => {
    setSavingKey("create-offer");
    try {
      await apiFetch("/admin/loan-offers", {
        method: "POST",
        body: {
          applicant_role: loanOfferForm.applicant_role,
          product_type: loanOfferForm.product_type,
          product_title: loanOfferForm.product_title.trim(),
          max_amount: Number(loanOfferForm.max_amount),
          interest_rate: loanOfferForm.interest_rate ? Number(loanOfferForm.interest_rate) : null,
          repayment_days: loanOfferForm.repayment_days ? Number(loanOfferForm.repayment_days) : null,
          speed: loanOfferForm.speed.trim() || null,
          note: loanOfferForm.note.trim() || null,
          security_type: loanOfferForm.security_type,
          requires_branch_visit: loanOfferForm.requires_branch_visit,
          branch_name: loanOfferForm.branch_name.trim() || null,
          branch_location: loanOfferForm.branch_location.trim() || null,
          branch_instructions: loanOfferForm.branch_instructions.trim() || null,
          collateral_types: parseLineList(loanOfferForm.collateral_types_input),
          required_documents: parseLineList(loanOfferForm.required_documents_input),
        },
      });
      setLoanOfferForm(initialLoanOfferForm);
      await loadPage();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not publish loan offer.");
    } finally {
      setSavingKey(null);
    }
  };

  const updateLoanOffer = async (offer: AdminLoanOffer) => {
    setSavingKey(`offer-${offer.id}`);
    try {
      const updated = await apiFetch<AdminLoanOffer>(`/admin/loan-offers/${offer.id}`, {
        method: "PATCH",
        body: {
          product_title: offer.product_title,
          max_amount: offer.max_amount,
          interest_rate: offer.interest_rate,
          repayment_days: offer.repayment_days,
          speed: offer.speed,
          note: offer.note,
          security_type: offer.security_type,
          requires_branch_visit: offer.requires_branch_visit,
          branch_name: offer.branch_name,
          branch_location: offer.branch_location,
          branch_instructions: offer.branch_instructions,
          collateral_types: offer.collateral_types,
          required_documents: offer.required_documents,
          is_active: offer.is_active,
        },
      });
      setLoanOffers((current) => current.map((item) => (item.id === offer.id ? { ...item, ...updated } : item)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update loan offer.");
      await loadPage();
    } finally {
      setSavingKey(null);
    }
  };

  const deleteLoanOffer = async (offerId: string) => {
    setSavingKey(`delete-offer-${offerId}`);
    try {
      await apiFetch(`/admin/loan-offers/${offerId}`, { method: "DELETE" });
      setLoanOffers((current) => current.filter((offer) => offer.id !== offerId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not delete loan offer.");
    } finally {
      setSavingKey(null);
    }
  };

  const normalizedOfferSearch = offerSearch.trim().toLowerCase();
  const filteredOffers = loanOffers.filter((offer) => {
    const haystack = [offer.id, offer.product_title, offer.note, offer.speed, offer.security_type, offer.branch_name, offer.branch_location, ...(offer.collateral_types ?? []), ...(offer.required_documents ?? []), LOAN_PRODUCT_TITLES[offer.product_type], offer.applicant_role]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesSearch = !normalizedOfferSearch || haystack.includes(normalizedOfferSearch);
    const matchesRole = offerRoleFilter === "all" || offer.applicant_role === offerRoleFilter;
    return matchesSearch && matchesRole;
  });

  const activeOffers = filteredOffers.filter((offer) => offer.is_active);
  const inactiveOffers = filteredOffers.filter((offer) => !offer.is_active);
  const totalOfferValue = filteredOffers.reduce((sum, offer) => sum + Number(offer.max_amount ?? 0), 0);
  const farmerOffers = filteredOffers.filter((offer) => offer.applicant_role === "farmer_pro");
  const enterpriseOffers = filteredOffers.filter((offer) => offer.applicant_role === "buyer_enterprise");

  return (
    <DashboardShell title="Loan Analytics">
      <div className="space-y-6">
        {errorMessage ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">{errorMessage}</div> : null}

        <section className="rounded-[2rem] border border-sky-100/90 bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.18),_transparent_45%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(240,249,255,0.92))] p-6 shadow-sm dark:border-sky-500/20 dark:bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.12),_transparent_40%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(17,24,39,0.92))]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="rounded-full border border-sky-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:border-sky-500/30 dark:bg-background/70 dark:text-sky-300">Loan Publishing</span>
              <h3 className="mt-4 font-display text-2xl font-bold text-foreground">Create a loan offer for qualified borrowers</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Publish once from admin, then the offer appears on the borrower micro-loan page for the matching Farmer Pro or Buyer Enterprise accounts.</p>
            </div>
            <div className="rounded-[1.25rem] border border-sky-200 bg-white/90 px-4 py-3 text-sm shadow-sm dark:border-sky-500/20 dark:bg-background/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">Published offers</p>
              <p className="mt-2 font-display text-2xl font-bold text-foreground">{formatCount(filteredOffers.length)} offers</p>
              <p className="mt-1 text-muted-foreground">{formatCount(farmerOffers.length)} farmer and {formatCount(enterpriseOffers.length)} enterprise offers in view.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <select value={loanOfferForm.applicant_role} onChange={(event) => setLoanOfferForm((current) => ({ ...current, applicant_role: event.target.value as "farmer_pro" | "buyer_enterprise" }))} className="h-11 rounded-xl border border-border bg-white px-3 text-sm text-foreground dark:bg-background/70"><option value="farmer_pro">farmer_pro</option><option value="buyer_enterprise">buyer_enterprise</option></select>
            <select value={loanOfferForm.product_type} onChange={(event) => { const nextType = event.target.value as LoanProductType; setLoanOfferForm((current) => ({ ...current, product_type: nextType, product_title: LOAN_PRODUCT_TITLES[nextType] })); }} className="h-11 rounded-xl border border-border bg-white px-3 text-sm text-foreground dark:bg-background/70">{Object.entries(LOAN_PRODUCT_TITLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <input value={loanOfferForm.product_title} onChange={(event) => setLoanOfferForm((current) => ({ ...current, product_title: event.target.value }))} placeholder="Product title" className="h-11 rounded-xl border border-border bg-white px-3 text-sm text-foreground dark:bg-background/70" />
            <input value={loanOfferForm.max_amount} onChange={(event) => setLoanOfferForm((current) => ({ ...current, max_amount: event.target.value }))} placeholder="Maximum amount" className="h-11 rounded-xl border border-border bg-white px-3 text-sm text-foreground dark:bg-background/70" />
            <input value={loanOfferForm.interest_rate} onChange={(event) => setLoanOfferForm((current) => ({ ...current, interest_rate: event.target.value }))} placeholder="Interest rate" className="h-11 rounded-xl border border-border bg-white px-3 text-sm text-foreground dark:bg-background/70" />
            <input value={loanOfferForm.repayment_days} onChange={(event) => setLoanOfferForm((current) => ({ ...current, repayment_days: event.target.value }))} placeholder="Repayment days" className="h-11 rounded-xl border border-border bg-white px-3 text-sm text-foreground dark:bg-background/70" />
            <input value={loanOfferForm.speed} onChange={(event) => setLoanOfferForm((current) => ({ ...current, speed: event.target.value }))} placeholder="Review speed" className="h-11 rounded-xl border border-border bg-white px-3 text-sm text-foreground dark:bg-background/70" />
            <select value={loanOfferForm.security_type} onChange={(event) => setLoanOfferForm((current) => ({ ...current, security_type: event.target.value as LoanSecurityType }))} className="h-11 rounded-xl border border-border bg-white px-3 text-sm text-foreground dark:bg-background/70">{LOAN_SECURITY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select>
            <label className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm text-muted-foreground dark:bg-background/70">
              <input type="checkbox" checked={loanOfferForm.requires_branch_visit} onChange={(event) => setLoanOfferForm((current) => ({ ...current, requires_branch_visit: event.target.checked }))} className="h-4 w-4 rounded border-border" />
              Branch visit required
            </label>
            <input value={loanOfferForm.branch_name} onChange={(event) => setLoanOfferForm((current) => ({ ...current, branch_name: event.target.value }))} placeholder="Branch name" className="h-11 rounded-xl border border-border bg-white px-3 text-sm text-foreground dark:bg-background/70" />
            <input value={loanOfferForm.branch_location} onChange={(event) => setLoanOfferForm((current) => ({ ...current, branch_location: event.target.value }))} placeholder="Branch location" className="h-11 rounded-xl border border-border bg-white px-3 text-sm text-foreground dark:bg-background/70" />
          </div>
          <textarea value={loanOfferForm.note} onChange={(event) => setLoanOfferForm((current) => ({ ...current, note: event.target.value }))} placeholder="Offer note shown to the borrower" className="mt-3 min-h-[110px] w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground dark:bg-background/70" />
          <textarea value={loanOfferForm.branch_instructions} onChange={(event) => setLoanOfferForm((current) => ({ ...current, branch_instructions: event.target.value }))} placeholder="Branch instructions for title deeds, valuation forms, or physical document handover" className="mt-3 min-h-[110px] w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground dark:bg-background/70" />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <textarea value={loanOfferForm.collateral_types_input} onChange={(event) => setLoanOfferForm((current) => ({ ...current, collateral_types_input: event.target.value }))} placeholder="Accepted collateral types, one per line" className="min-h-[110px] w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground dark:bg-background/70" />
            <textarea value={loanOfferForm.required_documents_input} onChange={(event) => setLoanOfferForm((current) => ({ ...current, required_documents_input: event.target.value }))} placeholder="Required documents, one per line" className="min-h-[110px] w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground dark:bg-background/70" />
          </div>
          <div className="mt-4 flex justify-end"><Button type="button" className="rounded-xl" disabled={savingKey === "create-offer"} onClick={() => void createLoanOffer()}>Publish Loan Offer</Button></div>
        </section>

        <section className="rounded-[2rem] border border-border/70 bg-card/90 p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className={`rounded-[1.5rem] border p-5 ${adminTone("sky").card}`}><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${adminTone("sky").iconWrap}`}><Wallet className={`h-5 w-5 ${adminTone("sky").icon}`} /></div><p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Offer Volume</p><p className="mt-2 font-display text-3xl font-bold text-foreground">{formatCount(filteredOffers.length)}</p><p className="mt-1 text-sm text-muted-foreground">Published loan offers in the current result set.</p></div>
            <div className={`rounded-[1.5rem] border p-5 ${adminTone("emerald").card}`}><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${adminTone("emerald").iconWrap}`}><Wallet className={`h-5 w-5 ${adminTone("emerald").icon}`} /></div><p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Offer Value</p><p className="mt-2 font-display text-3xl font-bold text-foreground">{formatMoney(totalOfferValue)}</p><p className="mt-1 text-sm text-muted-foreground">Total ceiling value across the filtered published offers.</p></div>
            <div className={`rounded-[1.5rem] border p-5 ${adminTone("violet").card}`}><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${adminTone("violet").iconWrap}`}><Wallet className={`h-5 w-5 ${adminTone("violet").icon}`} /></div><p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active Offers</p><p className="mt-2 font-display text-3xl font-bold text-foreground">{formatCount(activeOffers.length)}</p><p className="mt-1 text-sm text-muted-foreground">Offers that are currently visible to borrowers.</p></div>
            <div className={`rounded-[1.5rem] border p-5 ${adminTone("slate").card}`}><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${adminTone("slate").iconWrap}`}><Wallet className={`h-5 w-5 ${adminTone("slate").icon}`} /></div><p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Inactive Offers</p><p className="mt-2 font-display text-3xl font-bold text-foreground">{formatCount(inactiveOffers.length)}</p><p className="mt-1 text-sm text-muted-foreground">Offers saved but not currently shown to borrowers.</p></div>
          </div>
          <div className="mt-6 rounded-[2rem] border border-violet-200/70 bg-[radial-gradient(circle_at_top_right,_rgba(167,139,250,0.18),_transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(245,243,255,0.94))] p-6 shadow-[0_20px_50px_-28px_rgba(139,92,246,0.2)] dark:border-violet-500/20 dark:bg-[radial-gradient(circle_at_top_right,_rgba(167,139,250,0.16),_transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(24,24,27,0.94))]">
            <h3 className="font-display text-xl font-bold text-foreground">Loan Offers Workspace</h3>
            <p className="mt-1 text-sm text-muted-foreground">Filter and manage the published offers from one clean place. Loan decisions now live in their own separate admin page.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setOfferRoleFilter("all")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${offerRoleFilter === "all" ? "bg-foreground text-background" : "border border-border bg-background text-foreground"}`}>All Roles {formatCount(filteredOffers.length)}</button>
              <button type="button" onClick={() => setOfferRoleFilter("farmer_pro")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${offerRoleFilter === "farmer_pro" ? "bg-emerald-600 text-white" : "border border-border bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"}`}>Farmer Pro {formatCount(farmerOffers.length)}</button>
              <button type="button" onClick={() => setOfferRoleFilter("buyer_enterprise")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${offerRoleFilter === "buyer_enterprise" ? "bg-sky-600 text-white" : "border border-border bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"}`}>Buyer Enterprise {formatCount(enterpriseOffers.length)}</button>
            </div>
            <div className="relative mt-4"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={offerSearch} onChange={(event) => setOfferSearch(event.target.value)} placeholder="Search loan offers" className="h-11 rounded-xl pl-10" /></div>
            <p className="mt-3 text-xs text-muted-foreground">{formatCount(filteredOffers.length)} offers found</p>
          </div>
          {filteredOffers.length === 0 ? <div className="mt-5 rounded-[1.25rem] border border-dashed border-border bg-background/40 p-4 text-sm text-muted-foreground">No offers match that search.</div> : (
            <>
              <div className="mt-5 space-y-4 lg:hidden">
                {filteredOffers.map((offer) => (
                  <LoanOfferCard
                    key={offer.id}
                    offer={offer}
                    savingKey={savingKey}
                    fullWidth
                    onUpdate={(updates) => setLoanOffers((current) => current.map((item) => (item.id === offer.id ? { ...item, ...updates } : item)))}
                    onDelete={() => void deleteLoanOffer(offer.id)}
                    onSave={() => void updateLoanOffer(offer)}
                  />
                ))}
              </div>
              <div className="mt-5 hidden overflow-x-auto lg:block">
                <div className="flex min-w-max gap-4 pb-2">
                  {filteredOffers.map((offer) => (
                    <LoanOfferCard
                      key={offer.id}
                      offer={offer}
                      savingKey={savingKey}
                      onUpdate={(updates) => setLoanOffers((current) => current.map((item) => (item.id === offer.id ? { ...item, ...updates } : item)))}
                      onDelete={() => void deleteLoanOffer(offer.id)}
                      onSave={() => void updateLoanOffer(offer)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
