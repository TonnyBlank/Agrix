import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CalendarDays, MapPin, Search, Sprout, Star, Target, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import DashboardShell from "@/components/dashboard/DashboardShell";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import {
  formatProcurementStatusLabel,
  procurementBudgetFitLabel,
  procurementResponseBadgeClass,
  procurementSignalLabel,
  type ProcurementResponseStatus,
} from "@/lib/procurement";

type DiscoverCompany = {
  id: string;
  company_name: string;
  company_type: string;
  bio?: string | null;
  service_areas?: string[] | null;
  rating?: number | null;
  certifications?: string[] | null;
};

type DiscoverFarmer = {
  user_id: string;
  full_name: string | null;
  county: string | null;
  farm_size?: string | null;
  bio?: string | null;
  main_crops?: string[] | null;
  cooperative_name?: string | null;
};

type ProcurementResponseSummary = {
  id: string;
  request_id: string;
  product_id: string;
  quantity_offered: number;
  accepted_quantity: number | null;
  unit: string;
  price_per_unit: number;
  total_amount: number;
  currency: string;
  status: ProcurementResponseStatus;
  notes?: string | null;
  company_note?: string | null;
  order_id?: string | null;
  price_rank?: number | null;
  is_best_price_offer?: boolean;
  budget_fit?: "within_budget" | "over_budget" | "below_budget" | "unbounded" | string;
  price_vs_budget_max_pct?: number | null;
  market_signal?: "best_value" | "over_budget" | "aggressive_pricing" | "market_rate" | string;
  days_until_needed_by?: number | null;
  product?: {
    id: string;
    name: string;
    unit: string;
    stock?: number;
  } | null;
};

type DiscoverProcurementRequest = {
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
  responses_count?: number;
  submitted_responses_count?: number;
  accepted_responses_count?: number;
  rejected_responses_count?: number;
  withdrawn_responses_count?: number;
  my_responses?: ProcurementResponseSummary[];
  company: {
    id: string;
    company_name: string;
    company_type: string;
    headquarters_location: string | null;
    service_areas: string[];
  };
};

type FarmerProductOption = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  price_per_unit: number;
  is_available: boolean;
};

type ResponseDraft = {
  open: boolean;
  product_id: string;
  quantity_offered: string;
  price_per_unit: string;
  notes: string;
};

function formatCompanyType(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function DiscoveryHub() {
  const { role } = useAuth();
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<DiscoverCompany[]>([]);
  const [farmers, setFarmers] = useState<DiscoverFarmer[]>([]);
  const [procurementRequests, setProcurementRequests] = useState<DiscoverProcurementRequest[]>([]);
  const [myProducts, setMyProducts] = useState<FarmerProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedCounty, setSelectedCounty] = useState("all");
  const [responseDrafts, setResponseDrafts] = useState<Record<string, ResponseDraft>>({});
  const [submittingRequestId, setSubmittingRequestId] = useState<string | null>(null);
  const [withdrawingResponseId, setWithdrawingResponseId] = useState<string | null>(null);

  const isFarmerRole = role === "farmer_free" || role === "farmer_pro";

  const loadNetwork = useCallback(async () => {
    setLoading(true);
    if (isFarmerRole) {
      setLoadingProducts(true);
    }

    try {
      const companyPath =
        isFarmerRole
          ? `/farmer/companies${query.trim() ? `?search=${encodeURIComponent(query.trim())}` : ""}`
          : `/companies${query.trim() ? `?search=${encodeURIComponent(query.trim())}` : ""}`;

      const myProductsPromise = isFarmerRole
        ? apiFetch<FarmerProductOption[]>("/products/mine")
        : Promise.resolve<FarmerProductOption[]>([]);

      const [companiesResponse, farmersResponse, procurementResponse, myProductsResponse] = await Promise.allSettled([
        apiFetch<{ companies: DiscoverCompany[] }>(companyPath),
        apiFetch<DiscoverFarmer[]>(`/profiles/farmers${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`),
        apiFetch<{ requests: DiscoverProcurementRequest[] }>(`/farmer/procurement${query.trim() ? `?search=${encodeURIComponent(query.trim())}` : ""}`),
        myProductsPromise,
      ]);

      setCompanies(companiesResponse.status === "fulfilled" ? companiesResponse.value.companies ?? [] : []);
      setFarmers(farmersResponse.status === "fulfilled" ? farmersResponse.value ?? [] : []);
      setProcurementRequests(procurementResponse.status === "fulfilled" ? procurementResponse.value.requests ?? [] : []);

      if (isFarmerRole) {
        if (myProductsResponse.status === "fulfilled") {
          const availableProducts = (myProductsResponse.value ?? []).filter((product) => product.is_available);
          setMyProducts(availableProducts);
        } else {
          setMyProducts([]);
        }
      } else {
        setMyProducts([]);
      }
    } finally {
      setLoading(false);
      setLoadingProducts(false);
    }
  }, [isFarmerRole, query]);

  useEffect(() => {
    void loadNetwork();
  }, [loadNetwork]);

  const myProductsById = useMemo(() => {
    return new Map(myProducts.map((product) => [product.id, product]));
  }, [myProducts]);

  const counties = useMemo(() => {
    return Array.from(
      new Set([
        ...companies.flatMap((company) => company.service_areas ?? []),
        ...farmers.map((farmer) => farmer.county).filter(Boolean),
        ...procurementRequests.map((request) => request.target_county).filter(Boolean),
      ]),
    ).sort((a, b) => a.localeCompare(b));
  }, [companies, farmers, procurementRequests]);

  const filteredCompanies = companies.filter((company) =>
    selectedCounty === "all" ? true : (company.service_areas ?? []).includes(selectedCounty),
  );
  const filteredFarmers = farmers.filter((farmer) =>
    selectedCounty === "all" ? true : farmer.county === selectedCounty,
  );
  const filteredProcurementRequests = procurementRequests.filter((request) =>
    selectedCounty === "all" ? true : request.target_county === selectedCounty,
  );

  const openResponseForm = (requestId: string) => {
    setResponseDrafts((current) => {
      const existing = current[requestId];
      if (existing) {
        return {
          ...current,
          [requestId]: {
            ...existing,
            open: !existing.open,
          },
        };
      }
      const firstProduct = myProducts[0];
      return {
        ...current,
        [requestId]: {
          open: true,
          product_id: firstProduct?.id || "",
          quantity_offered: "",
          price_per_unit: firstProduct ? String(firstProduct.price_per_unit) : "",
          notes: "",
        },
      };
    });
  };

  const updateDraft = (requestId: string, update: Partial<ResponseDraft>) => {
    setResponseDrafts((current) => {
      const existing = current[requestId] || {
        open: true,
        product_id: "",
        quantity_offered: "",
        price_per_unit: "",
        notes: "",
      };
      const next = { ...existing, ...update };
      return {
        ...current,
        [requestId]: next,
      };
    });
  };

  const submitResponse = async (requestItem: DiscoverProcurementRequest) => {
    const draft = responseDrafts[requestItem.id];
    if (!draft) {
      toast.error("Open the response form first.");
      return;
    }
    if (!draft.product_id) {
      toast.error("Select a product to respond with.");
      return;
    }

    const quantity = Number(draft.quantity_offered);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Enter a valid quantity offered.");
      return;
    }

    const price = Number(draft.price_per_unit);
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("Enter a valid price per unit.");
      return;
    }

    const selectedProduct = myProductsById.get(draft.product_id);
    if (!selectedProduct) {
      toast.error("Selected product is no longer available.");
      return;
    }
    if (quantity > Number(selectedProduct.stock || 0)) {
      toast.error("Quantity offered exceeds current product stock.");
      return;
    }

    setSubmittingRequestId(requestItem.id);
    try {
      await apiFetch<{ success: boolean }>(`/farmer/procurement/${requestItem.id}/responses`, {
        method: "POST",
        body: {
          product_id: draft.product_id,
          quantity_offered: quantity,
          price_per_unit: price,
          notes: draft.notes.trim() || null,
        } as unknown as BodyInit,
      });
      toast.success("Offer submitted to company procurement.");
      setResponseDrafts((current) => ({
        ...current,
        [requestItem.id]: {
          ...draft,
          open: false,
        },
      }));
      await loadNetwork();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit offer.");
    } finally {
      setSubmittingRequestId(null);
    }
  };

  const withdrawResponse = async (requestId: string, responseId: string) => {
    setWithdrawingResponseId(responseId);
    try {
      await apiFetch<{ success: boolean }>(`/farmer/procurement/${requestId}/responses/${responseId}/withdraw`, {
        method: "POST",
      });
      toast.success("Offer withdrawn.");
      await loadNetwork();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to withdraw offer.");
    } finally {
      setWithdrawingResponseId(null);
    }
  };

  return (
    <DashboardShell title="Discover">
      <section className="mb-8 rounded-[2rem] border border-violet-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.12),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.1),_transparent_34%),linear-gradient(135deg,rgba(250,250,255,0.98),rgba(255,255,255,0.96))] p-6 shadow-[0_24px_54px_-36px_rgba(99,102,241,0.24)]">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="inline-flex rounded-full border border-violet-300/70 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
              Network Discovery
            </div>
            <h2 className="mt-4 font-display text-3xl font-bold text-foreground">Find the right people to trade with</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Search companies and farmers from one place, then narrow by county so sourcing, sales, and partnerships become easier across the whole platform.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-violet-200/70 bg-white/80 p-5">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Search network</label>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by company, county, crop, or farmer" className="h-11 rounded-xl pl-10" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setSelectedCounty("all")} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selectedCounty === "all" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"}`}>
                All counties
              </button>
              {counties.slice(0, 8).map((county) => (
                <button key={county} type="button" onClick={() => setSelectedCounty(county)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selectedCounty === county ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"}`}>
                  {county}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-[1.5rem] border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/10">
              <Building2 className="h-5 w-5 text-sky-700" />
            </div>
            <div>
              <h3 className="font-display text-xl font-bold text-foreground">Companies</h3>
              <p className="mt-1 text-sm text-muted-foreground">Verified businesses and sourcing partners that can buy from, supply, or work with the wider network.</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="rounded-xl bg-background p-4 text-sm text-muted-foreground">Loading companies...</div>
            ) : filteredCompanies.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">No companies matched the current search or county filter.</div>
            ) : (
              filteredCompanies.map((company) => (
                <div key={company.id} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{company.company_name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{formatCompanyType(company.company_type)}</p>
                    </div>
                    <div className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      <Star className="mr-1 h-3.5 w-3.5" />
                      {company.rating ? company.rating.toFixed(1) : "New"}
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{company.bio || "No company bio added yet."}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(company.service_areas?.length ? company.service_areas : ["Coverage not set"]).slice(0, 4).map((area) => (
                      <span key={area} className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-700">
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10">
              <Sprout className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <h3 className="font-display text-xl font-bold text-foreground">Farmers</h3>
              <p className="mt-1 text-sm text-muted-foreground">Search growers by county, crops, and profile detail so supplier discovery feels less fragmented.</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="rounded-xl bg-background p-4 text-sm text-muted-foreground">Loading farmers...</div>
            ) : filteredFarmers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">No farmers matched the current search or county filter.</div>
            ) : (
              filteredFarmers.map((farmer) => (
                <div key={farmer.user_id} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{farmer.full_name || "Farmer profile"}</p>
                      <div className="mt-1 inline-flex items-center text-sm text-muted-foreground">
                        <MapPin className="mr-1 h-3.5 w-3.5" />
                        {farmer.county || "County not set"}
                      </div>
                    </div>
                    <div className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      <Users className="mr-1 h-3.5 w-3.5" />
                      {farmer.farm_size || "Farm profile"}
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{farmer.bio || "No farmer bio added yet."}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(farmer.main_crops?.length ? farmer.main_crops : [farmer.cooperative_name || "Crop details not set"]).slice(0, 4).map((item) => (
                      <span key={item} className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10">
              <Target className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <h3 className="font-display text-xl font-bold text-foreground">Procurement Requests</h3>
              <p className="mt-1 text-sm text-muted-foreground">Open demand from companies that farmers can respond to with real product offers.</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="rounded-xl bg-background p-4 text-sm text-muted-foreground">Loading procurement requests...</div>
            ) : filteredProcurementRequests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">No procurement requests matched the current search or county filter.</div>
            ) : (
              filteredProcurementRequests.map((request) => {
                const draft = responseDrafts[request.id];
                const myResponses = request.my_responses || [];

                return (
                  <div key={request.id} className="rounded-xl border border-border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{request.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {request.company.company_name} • {formatCompanyType(request.company.company_type)}
                        </p>
                      </div>
                      <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        {request.category}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700">
                        {request.quantity_needed} {request.unit}
                      </span>
                      <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-700">
                        {request.target_county || "Any county"}
                      </span>
                      {request.responses_count ? (
                        <span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-700">
                          {request.responses_count} offer{request.responses_count === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      {request.submitted_responses_count ? (
                        <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700">
                          {request.submitted_responses_count} pending review
                        </span>
                      ) : null}
                      {request.accepted_responses_count ? (
                        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
                          {request.accepted_responses_count} accepted
                        </span>
                      ) : null}
                    </div>

                    {(request.budget_min || request.budget_max) ? (
                      <p className="mt-3 text-sm text-foreground">
                        Budget: KES {Number(request.budget_min || 0).toLocaleString()} - {Number(request.budget_max || 0).toLocaleString()}
                      </p>
                    ) : null}

                    {request.needed_by ? (
                      <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <CalendarDays className="h-4 w-4" />
                        Needed by {new Date(request.needed_by).toLocaleDateString()}
                      </p>
                    ) : null}

                    {request.notes ? <p className="mt-3 text-sm text-muted-foreground">{request.notes}</p> : null}

                    {isFarmerRole ? (
                      <div className="mt-3 space-y-3">
                        {myResponses.length ? (
                          <div className="space-y-2">
                            {myResponses.map((response) => (
                              <div key={response.id} className="rounded-lg border border-border bg-card p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-xs text-muted-foreground">
                                    {response.product?.name || "Your listing"} • {response.quantity_offered} {response.unit} • {response.currency} {Number(response.price_per_unit || 0).toLocaleString()} / {response.unit}
                                  </div>
                                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${procurementResponseBadgeClass(response.status)}`}>
                                    {formatProcurementStatusLabel(response.status)}
                                  </span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {response.price_rank ? (
                                    <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                                      Rank #{response.price_rank}
                                    </span>
                                  ) : null}
                                  <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                                    {procurementBudgetFitLabel(response.budget_fit)}
                                  </span>
                                  <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                                    {procurementSignalLabel(response.market_signal)}
                                  </span>
                                </div>
                                {response.notes ? <p className="mt-2 text-xs text-muted-foreground">{response.notes}</p> : null}
                                {response.company_note ? <p className="mt-2 text-xs text-foreground">Company note: {response.company_note}</p> : null}
                                {response.order_id ? <p className="mt-2 text-xs text-emerald-700">Converted to order #{response.order_id.slice(0, 8)}</p> : null}
                                {response.status === "submitted" || response.status === "rejected" ? (
                                  <div className="mt-2">
                                    <button
                                      type="button"
                                      onClick={() => void withdrawResponse(request.id, response.id)}
                                      disabled={withdrawingResponseId === response.id}
                                      className="rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                      {withdrawingResponseId === response.id ? "Withdrawing..." : "Withdraw offer"}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openResponseForm(request.id)}
                            className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                            disabled={loadingProducts || myProducts.length === 0}
                          >
                            {draft?.open ? "Hide offer form" : "Respond with offer"}
                          </button>
                          {myProducts.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              Add a listing first in <Link to="/dashboard/products" className="font-semibold text-primary underline-offset-2 hover:underline">My Products</Link>
                            </span>
                          ) : null}
                        </div>

                        {draft?.open ? (
                          <div className="rounded-xl border border-border bg-card p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Submit Procurement Offer</p>
                            <div className="mt-3 grid gap-3">
                              <div>
                                <label className="text-xs font-medium text-muted-foreground">Product</label>
                                <select
                                  value={draft.product_id}
                                  onChange={(event) => {
                                    const selected = myProductsById.get(event.target.value);
                                    updateDraft(request.id, {
                                      product_id: event.target.value,
                                      price_per_unit: selected ? String(selected.price_per_unit) : draft.price_per_unit,
                                    });
                                  }}
                                  className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                                >
                                  <option value="">Select one of your listings</option>
                                  {myProducts.map((product) => (
                                    <option key={product.id} value={product.id}>
                                      {product.name} ({product.stock} {product.unit} in stock)
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground">Quantity Offered</label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={draft.quantity_offered}
                                    onChange={(event) => updateDraft(request.id, { quantity_offered: event.target.value })}
                                    placeholder="0"
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground">Price Per Unit (KES)</label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={draft.price_per_unit}
                                    onChange={(event) => updateDraft(request.id, { price_per_unit: event.target.value })}
                                    placeholder="0"
                                    className="mt-1"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
                                <textarea
                                  value={draft.notes}
                                  onChange={(event) => updateDraft(request.id, { notes: event.target.value })}
                                  rows={3}
                                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                                  placeholder="Packaging, availability date, quality notes..."
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => void submitResponse(request)}
                                disabled={submittingRequestId === request.id}
                                className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                {submittingRequestId === request.id ? "Submitting..." : "Submit offer"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
