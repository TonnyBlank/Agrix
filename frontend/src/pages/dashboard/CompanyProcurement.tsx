import { useEffect, useState } from "react";
import { Building2, CalendarDays, CheckCircle2, PackageSearch, Plus, RefreshCw, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import DashboardShell from "@/components/dashboard/DashboardShell";
import CompanySetupRequired from "@/components/dashboard/CompanySetupRequired";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";
import { countyOptions } from "@/lib/kenyaLocations";
import {
  formatProcurementStatusLabel,
  procurementBudgetFitLabel,
  procurementResponseBadgeClass,
  procurementSignalLabel,
  type ProcurementRequestStatus,
  type ProcurementResponseStatus,
} from "@/lib/procurement";

const procurementCategoryOptions = ["produce", "livestock", "inputs", "equipment", "logistics", "other"];
const procurementUnitOptions = ["kg", "g", "tonne", "bag", "crate", "piece", "litre", "packet"];

type ProcurementRequest = {
  id: string;
  title: string;
  category: string;
  target_county: string | null;
  quantity_needed: number;
  unit: string;
  budget_min: number | null;
  budget_max: number | null;
  needed_by: string | null;
  notes: string | null;
  status: ProcurementRequestStatus;
  created_at: string;
  responses_count?: number;
  submitted_responses_count?: number;
  accepted_responses_count?: number;
  rejected_responses_count?: number;
  withdrawn_responses_count?: number;
};

type ProcurementResponse = {
  id: string;
  request_id: string;
  farmer_id: string;
  product_id: string;
  quantity_offered: number;
  accepted_quantity: number | null;
  unit: string;
  price_per_unit: number;
  total_amount: number;
  currency: string;
  notes: string | null;
  company_note: string | null;
  status: ProcurementResponseStatus;
  order_id: string | null;
  created_at: string;
  decided_at: string | null;
  price_rank?: number | null;
  is_best_price_offer?: boolean;
  budget_fit?: "within_budget" | "over_budget" | "below_budget" | "unbounded" | string;
  price_vs_budget_max_pct?: number | null;
  market_signal?: "best_value" | "over_budget" | "aggressive_pricing" | "market_rate" | string;
  days_until_needed_by?: number | null;
  farmer_profile?: {
    full_name?: string | null;
    county?: string | null;
    phone?: string | null;
    farm_size?: string | null;
  } | null;
  product?: {
    id: string;
    name: string;
    category: string;
    unit: string;
    price_per_unit: number;
    stock: number;
    is_available: boolean;
    cover_image_url?: string | null;
  } | null;
};

type ProcurementResponseList = {
  request: ProcurementRequest;
  responses: ProcurementResponse[];
  total: number;
};

const initialForm = {
  title: "",
  category: "produce",
  target_county: "",
  quantity_needed: "",
  unit: "kg",
  budget_min: "",
  budget_max: "",
  needed_by: "",
  notes: "",
};

export default function CompanyProcurement() {
  const [requests, setRequests] = useState<ProcurementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [missingCompanyProfile, setMissingCompanyProfile] = useState(false);

  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [responsesByRequest, setResponsesByRequest] = useState<Record<string, ProcurementResponse[]>>({});
  const [loadingResponsesFor, setLoadingResponsesFor] = useState<string | null>(null);
  const [actingResponseId, setActingResponseId] = useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [acceptedQuantities, setAcceptedQuantities] = useState<Record<string, string>>({});

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ requests: ProcurementRequest[] }>("/companies/me/procurement");
      setRequests(data.requests || []);
      setMissingCompanyProfile(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setMissingCompanyProfile(true);
        setRequests([]);
        return;
      }
      toast.error(error instanceof Error ? error.message : "Failed to load procurement requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  const loadResponses = async (requestId: string, { silent = false }: { silent?: boolean } = {}) => {
    if (!silent) {
      setLoadingResponsesFor(requestId);
    }
    try {
      const data = await apiFetch<ProcurementResponseList>(`/companies/me/procurement/${requestId}/responses`);
      setResponsesByRequest((current) => ({ ...current, [requestId]: data.responses || [] }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load procurement responses.");
    } finally {
      if (!silent) {
        setLoadingResponsesFor(null);
      }
    }
  };

  const toggleResponsesPanel = async (requestId: string) => {
    if (expandedRequestId === requestId) {
      setExpandedRequestId(null);
      return;
    }
    setExpandedRequestId(requestId);
    if (!responsesByRequest[requestId]) {
      await loadResponses(requestId);
    }
  };

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("Request title is required.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/companies/me/procurement", {
        method: "POST",
        body: {
          title: form.title.trim(),
          category: form.category.trim(),
          target_county: form.target_county.trim() || null,
          quantity_needed: Number(form.quantity_needed) || 0,
          unit: form.unit.trim() || "kg",
          budget_min: form.budget_min ? Number(form.budget_min) : null,
          budget_max: form.budget_max ? Number(form.budget_max) : null,
          needed_by: form.needed_by || null,
          notes: form.notes.trim() || null,
          status: "open",
        },
      });
      setForm(initialForm);
      toast.success("Procurement request published.");
      await loadRequests();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create procurement request.");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (requestId: string, status: ProcurementRequestStatus) => {
    try {
      await apiFetch(`/companies/me/procurement/${requestId}`, { method: "PATCH", body: { status } });
      setRequests((current) => current.map((item) => (item.id === requestId ? { ...item, status } : item)));
      toast.success("Procurement request updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update procurement request.");
    }
  };

  const deleteRequest = async (requestId: string) => {
    try {
      await apiFetch(`/companies/me/procurement/${requestId}`, { method: "DELETE" });
      setRequests((current) => current.filter((item) => item.id !== requestId));
      setResponsesByRequest((current) => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
      if (expandedRequestId === requestId) {
        setExpandedRequestId(null);
      }
      toast.success("Procurement request deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete procurement request.");
    }
  };

  const decideResponse = async (requestId: string, responseId: string, decision: "accept" | "reject") => {
    const note = (decisionNotes[responseId] || "").trim();
    const acceptedQuantityText = (acceptedQuantities[responseId] || "").trim();
    const parsedAcceptedQuantity = acceptedQuantityText ? Number(acceptedQuantityText) : null;
    if (decision === "accept" && acceptedQuantityText && (!Number.isFinite(parsedAcceptedQuantity) || Number(parsedAcceptedQuantity) <= 0)) {
      toast.error("Accepted quantity must be a valid number greater than zero.");
      return;
    }

    setActingResponseId(responseId);
    try {
      const data = await apiFetch<{ response: ProcurementResponse; order?: { id?: string } | null }>(
        `/companies/me/procurement/${requestId}/responses/${responseId}/decision`,
        {
          method: "PATCH",
          body: {
            decision,
            company_note: note || null,
            accepted_quantity: decision === "accept" && parsedAcceptedQuantity ? parsedAcceptedQuantity : undefined,
          },
        },
      );

      setResponsesByRequest((current) => {
        const existing = current[requestId] || [];
        return {
          ...current,
          [requestId]: existing.map((item) => (item.id === responseId ? data.response : item)),
        };
      });

      if (decision === "accept") {
        toast.success(data.order?.id ? `Offer accepted and order ${data.order.id.slice(0, 8)} created.` : "Offer accepted and order created.");
      } else {
        toast.success("Offer rejected.");
      }

      setDecisionNotes((current) => ({ ...current, [responseId]: "" }));
      setAcceptedQuantities((current) => ({ ...current, [responseId]: "" }));

      await loadRequests();
      await loadResponses(requestId, { silent: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to process procurement response.");
    } finally {
      setActingResponseId(null);
    }
  };

  return (
    <DashboardShell title="Company Procurement">
      {missingCompanyProfile ? (
        <CompanySetupRequired title="Set up your company profile before posting procurement requests" />
      ) : (
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10">
              <PackageSearch className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">Post a procurement need</h2>
              <p className="mt-1 text-sm text-muted-foreground">Tell farmers what you need, where you need it, and the target volume so they can respond faster.</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="title">Request title</Label>
              <Input id="title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Need 5 tonnes of dry maize in Nakuru" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <select
                  id="category"
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  {procurementCategoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="target_county">Target county</Label>
                <select
                  id="target_county"
                  value={form.target_county}
                  onChange={(event) => setForm((current) => ({ ...current, target_county: event.target.value }))}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="">Any county</option>
                  {countyOptions.map((county) => (
                    <option key={county} value={county}>
                      {county}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="quantity_needed">Quantity needed</Label>
                <Input id="quantity_needed" type="number" min="0" step="0.01" value={form.quantity_needed} onChange={(event) => setForm((current) => ({ ...current, quantity_needed: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <select
                  id="unit"
                  value={form.unit}
                  onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  {procurementUnitOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="needed_by">Needed by</Label>
                <Input id="needed_by" type="date" value={form.needed_by} onChange={(event) => setForm((current) => ({ ...current, needed_by: event.target.value }))} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="budget_min">Budget minimum</Label>
                <Input id="budget_min" type="number" min="0" step="0.01" value={form.budget_min} onChange={(event) => setForm((current) => ({ ...current, budget_min: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget_max">Budget maximum</Label>
                <Input id="budget_max" type="number" min="0" step="0.01" value={form.budget_max} onChange={(event) => setForm((current) => ({ ...current, budget_max: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Procurement notes</Label>
              <Textarea id="notes" rows={5} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </div>
          </div>

          <Button type="button" className="rounded-xl" disabled={saving} onClick={() => void submit()}>
            <Plus className="mr-2 h-4 w-4" />
            {saving ? "Publishing..." : "Publish procurement request"}
          </Button>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/10">
              <Building2 className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">Open requests</h2>
              <p className="mt-1 text-sm text-muted-foreground">Review incoming farmer offers, then accept or reject while keeping procurement status aligned.</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="rounded-xl bg-background p-4 text-sm text-muted-foreground">Loading procurement requests...</div>
            ) : requests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">No procurement requests yet. Publish one from the form.</div>
            ) : (
              requests.map((request) => {
                const responses = [...(responsesByRequest[request.id] || [])].sort((a, b) => {
                  const statusWeight: Record<string, number> = {
                    submitted: 0,
                    accepted: 1,
                    rejected: 2,
                    withdrawn: 3,
                  };
                  const aWeight = statusWeight[a.status] ?? 9;
                  const bWeight = statusWeight[b.status] ?? 9;
                  if (aWeight !== bWeight) return aWeight - bWeight;

                  const aRank = Number(a.price_rank || Number.MAX_SAFE_INTEGER);
                  const bRank = Number(b.price_rank || Number.MAX_SAFE_INTEGER);
                  if (aRank !== bRank) return aRank - bRank;

                  return Number(a.price_per_unit || 0) - Number(b.price_per_unit || 0);
                });
                const isExpanded = expandedRequestId === request.id;

                return (
                  <div key={request.id} className="rounded-xl border border-border bg-background p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-semibold text-foreground">{request.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{request.category} • {request.quantity_needed} {request.unit} • {request.target_county || "Any county"}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-700">
                            {request.responses_count || 0} responses
                          </span>
                          <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700">
                            {request.submitted_responses_count || 0} pending review
                          </span>
                          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            {request.accepted_responses_count || 0} accepted
                          </span>
                          <span className="rounded-full bg-slate-500/10 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {request.withdrawn_responses_count || 0} withdrawn
                          </span>
                        </div>
                        {(request.budget_min || request.budget_max) ? (
                          <p className="mt-1 text-sm text-foreground">Budget: KES {request.budget_min?.toLocaleString() || 0} - {request.budget_max?.toLocaleString() || 0}</p>
                        ) : null}
                        {request.needed_by ? (
                          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                            <CalendarDays className="h-4 w-4" />
                            Needed by {new Date(request.needed_by).toLocaleDateString()}
                          </p>
                        ) : null}
                        {request.notes ? <p className="mt-2 text-sm text-muted-foreground">{request.notes}</p> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select value={request.status} onChange={(event) => void updateStatus(request.id, event.target.value as ProcurementRequestStatus)} className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground">
                          <option value="open">open</option>
                          <option value="paused">paused</option>
                          <option value="closed">closed</option>
                        </select>
                        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => void toggleResponsesPanel(request.id)}>
                          {isExpanded ? "Hide offers" : "View offers"}
                        </Button>
                        {isExpanded ? (
                          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => void loadResponses(request.id)} disabled={loadingResponsesFor === request.id}>
                            <RefreshCw className={`h-4 w-4 ${loadingResponsesFor === request.id ? "animate-spin" : ""}`} />
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl text-destructive hover:text-destructive"
                          onClick={() => void deleteRequest(request.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div className="mt-4 border-t border-border pt-4">
                        {loadingResponsesFor === request.id ? (
                          <div className="rounded-lg bg-muted/30 px-3 py-3 text-sm text-muted-foreground">Loading procurement offers...</div>
                        ) : responses.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">No farmer offers yet for this request.</div>
                        ) : (
                          <div className="space-y-3">
                            {responses.map((response) => (
                              <div key={response.id} className="rounded-lg border border-border bg-card p-3">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                  <div>
                                    <p className="font-medium text-foreground">
                                      {response.farmer_profile?.full_name || "Farmer"} • {response.product?.name || "Product"}
                                    </p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                      {response.farmer_profile?.county || "County not set"} • Offer {response.quantity_offered} {response.unit}
                                    </p>
                                    <p className="mt-1 text-sm text-foreground">
                                      Price: {response.currency} {Number(response.price_per_unit || 0).toLocaleString()} / {response.unit} • Total {response.currency} {Number(response.total_amount || 0).toLocaleString()}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {response.price_rank ? (
                                        <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-700">
                                          Price rank #{response.price_rank}
                                        </span>
                                      ) : null}
                                      <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-700">
                                        {procurementBudgetFitLabel(response.budget_fit)}
                                      </span>
                                      <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                        {procurementSignalLabel(response.market_signal)}
                                      </span>
                                      {response.is_best_price_offer ? (
                                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                          Lowest price
                                        </span>
                                      ) : null}
                                    </div>
                                    {typeof response.price_vs_budget_max_pct === "number" ? (
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        {response.price_vs_budget_max_pct > 0 ? "+" : ""}{response.price_vs_budget_max_pct.toFixed(2)}% vs budget max
                                      </p>
                                    ) : null}
                                    {typeof response.days_until_needed_by === "number" ? (
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        Needed in {response.days_until_needed_by} day{response.days_until_needed_by === 1 ? "" : "s"}
                                      </p>
                                    ) : null}
                                    {response.notes ? <p className="mt-2 text-sm text-muted-foreground">{response.notes}</p> : null}
                                    {response.company_note ? <p className="mt-2 text-sm text-foreground">Company note: {response.company_note}</p> : null}
                                    {response.order_id ? <p className="mt-2 text-sm text-emerald-700">Converted to order #{response.order_id.slice(0, 8)}</p> : null}
                                  </div>
                                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${procurementResponseBadgeClass(response.status)}`}>
                                    {formatProcurementStatusLabel(response.status)}
                                  </span>
                                </div>

                                {response.status === "submitted" ? (
                                  <div className="mt-3 grid gap-2">
                                    <div>
                                      <Label htmlFor={`accept-qty-${response.id}`} className="text-xs text-muted-foreground">
                                        Accepted quantity (optional)
                                      </Label>
                                      <Input
                                        id={`accept-qty-${response.id}`}
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={acceptedQuantities[response.id] || ""}
                                        onChange={(event) => setAcceptedQuantities((current) => ({ ...current, [response.id]: event.target.value }))}
                                        placeholder={`Default: ${response.quantity_offered}`}
                                        className="mt-1"
                                      />
                                    </div>
                                    <Textarea
                                      rows={2}
                                      value={decisionNotes[response.id] || ""}
                                      onChange={(event) => setDecisionNotes((current) => ({ ...current, [response.id]: event.target.value }))}
                                      placeholder="Optional note to farmer"
                                    />
                                    <div className="flex flex-wrap gap-2">
                                      <Button
                                        type="button"
                                        className="rounded-lg"
                                        onClick={() => void decideResponse(request.id, response.id, "accept")}
                                        disabled={actingResponseId === response.id}
                                      >
                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                        {actingResponseId === response.id ? "Processing..." : "Accept & create order"}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-lg"
                                        onClick={() => void decideResponse(request.id, response.id, "reject")}
                                        disabled={actingResponseId === response.id}
                                      >
                                        <XCircle className="mr-2 h-4 w-4" />
                                        Reject
                                      </Button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
      )}
    </DashboardShell>
  );
}
