import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BellPlus, BellRing, Crown, Gauge, Leaf, Loader2, MapPin, Radar, ShieldCheck, Sparkles, Target, Trash2, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import DashboardShell from "@/components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useMarketplaceProducts, type Product } from "@/hooks/useProducts";
import { apiFetch } from "@/lib/api";

type DealMatchCompany = {
  id: string;
  company_name: string;
  company_type: string;
  headquarters_location?: string | null;
  service_areas?: string[];
};

type RecommendedProduct = {
  id: string;
  name: string;
  category: string;
  stock: number;
  unit: string;
  price_per_unit: number;
};

type DraftOffer = {
  product_id: string;
  quantity_offered: number;
  price_per_unit: number;
  notes: string;
};

type MarginGuard = {
  min_margin_percent: number;
  floor_price: number;
  guarded_price: number;
  would_violate_budget: boolean;
};

type DealMatch = {
  request_id: string;
  title: string;
  category: string;
  target_county: string | null;
  quantity_needed: number;
  unit: string;
  budget_min: number | null;
  budget_max: number | null;
  needed_by: string | null;
  notes: string | null;
  company: DealMatchCompany;
  score: number;
  fit_label: "high" | "good" | "fair" | string;
  reasons: string[];
  responses_count: number;
  submitted_responses_count: number;
  recommended_product: RecommendedProduct;
  suggested_price_range: {
    min: number;
    max: number;
    currency: string;
  };
  suggested_quantity: number;
  already_applied: boolean;
  my_response_status?: string | null;
  draft_offer: DraftOffer;
  win_probability?: number;
  margin_guard?: MarginGuard;
};

type DealMatchMeta = {
  role: string;
  is_pro: boolean;
  daily_limit: number | null;
  remaining_today: number | null;
  total_scored_matches: number;
  generated_at: string;
};

type DealMatchSettings = {
  realtime_alerts_enabled: boolean;
  min_margin_percent: number;
  settings_persisted: boolean;
};

type DealMatchResponse = {
  matches: DealMatch[];
  meta: DealMatchMeta;
  settings: DealMatchSettings;
};

type DraftState = {
  product_id: string;
  quantity_offered: string;
  price_per_unit: string;
  notes: string;
  floor_price: number;
  budget_max: number | null;
};

type PriceWatchAlert = {
  id: string;
  crop: string;
  county: string;
  targetPrice: number;
};

type PriceWatchInsight = {
  alert: PriceWatchAlert;
  averagePrice: number | null;
  matchingCount: number;
  differencePercent: number | null;
  status: "no_data" | "below" | "near" | "above";
  bestCounty: string | null;
  bestCountyAverage: number | null;
};

const PRO_POLLING_INTERVAL_MS = 45_000;

function formatCurrency(value: number, currency = "KES") {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function scoreLabelClass(label: string) {
  if (label === "high") return "bg-emerald-500/10 text-emerald-700 border-emerald-300/60";
  if (label === "good") return "bg-amber-500/10 text-amber-700 border-amber-300/60";
  return "bg-slate-500/10 text-slate-700 border-slate-300/60";
}

function asPositiveNumber(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizePriceWatchText(value: string) {
  return value.trim().toLowerCase();
}

function makePriceWatchId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function matchesPriceWatchAlert(product: Product, alert: PriceWatchAlert) {
  const query = normalizePriceWatchText(alert.crop);
  const searchable = `${product.name} ${product.category}`.toLowerCase();
  const cropMatches = searchable.includes(query);

  if (!cropMatches) {
    return false;
  }

  if (!alert.county.trim()) {
    return true;
  }

  const productCounty = normalizePriceWatchText(product.profiles?.county || "");
  return productCounty === normalizePriceWatchText(alert.county);
}

function priceWatchStatusMeta(status: PriceWatchInsight["status"]) {
  if (status === "above") {
    return {
      label: "Above target",
      cls: "border-emerald-300/70 bg-emerald-50 text-emerald-700",
    };
  }

  if (status === "near") {
    return {
      label: "Near target",
      cls: "border-amber-300/70 bg-amber-50 text-amber-700",
    };
  }

  if (status === "below") {
    return {
      label: "Below target",
      cls: "border-rose-300/70 bg-rose-50 text-rose-700",
    };
  }

  return {
    label: "No market data",
    cls: "border-slate-300/70 bg-slate-50 text-slate-600",
  };
}

export default function DealMatches() {
  const { role, user } = useAuth();
  const { products: marketProducts, loading: marketPricesLoading } = useMarketplaceProducts();
  const isFarmer = role === "farmer_free" || role === "farmer_pro";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [matches, setMatches] = useState<DealMatch[]>([]);
  const [meta, setMeta] = useState<DealMatchMeta | null>(null);
  const [settings, setSettings] = useState<DealMatchSettings | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [submittingRequestId, setSubmittingRequestId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [marginInput, setMarginInput] = useState("8");
  const [watchCrop, setWatchCrop] = useState("");
  const [watchCounty, setWatchCounty] = useState("");
  const [watchTargetPrice, setWatchTargetPrice] = useState("");
  const [priceWatchAlerts, setPriceWatchAlerts] = useState<PriceWatchAlert[]>([]);
  const [priceWatchLoaded, setPriceWatchLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<"matches" | "watchlist">("matches");

  const seenMatchIdsRef = useRef<Set<string>>(new Set());

  const isPro = meta?.is_pro ?? role === "farmer_pro";
  const priceWatchAlertLimit = isPro ? 20 : 3;
  const priceWatchStorageKey = `agrixl-price-alerts:${user?.id || "anonymous"}`;

  useEffect(() => {
    setPriceWatchLoaded(false);

    if (typeof window === "undefined") {
      setPriceWatchAlerts([]);
      setPriceWatchLoaded(true);
      return;
    }

    try {
      const raw = window.localStorage.getItem(priceWatchStorageKey);
      if (!raw) {
        setPriceWatchAlerts([]);
      } else {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setPriceWatchAlerts(parsed as PriceWatchAlert[]);
        } else {
          setPriceWatchAlerts([]);
        }
      }
    } catch {
      setPriceWatchAlerts([]);
    } finally {
      setPriceWatchLoaded(true);
    }
  }, [priceWatchStorageKey]);

  useEffect(() => {
    if (!priceWatchLoaded || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(priceWatchStorageKey, JSON.stringify(priceWatchAlerts));
    } catch {
      // Ignore localStorage failures.
    }
  }, [priceWatchAlerts, priceWatchLoaded, priceWatchStorageKey]);

  const mergeDrafts = useCallback((rows: DealMatch[]) => {
    setDrafts((current) => {
      const next = { ...current };
      rows.forEach((match) => {
        if (next[match.request_id]) {
          return;
        }

        const floorPrice = match.margin_guard?.floor_price ?? 0;
        next[match.request_id] = {
          product_id: match.draft_offer.product_id,
          quantity_offered: String(match.draft_offer.quantity_offered),
          price_per_unit: String(match.draft_offer.price_per_unit),
          notes: match.draft_offer.notes || "",
          floor_price: floorPrice,
          budget_max: match.budget_max,
        };
      });
      return next;
    });
  }, []);

  const loadMatches = useCallback(async (opts?: { silent?: boolean; background?: boolean }) => {
    const silent = Boolean(opts?.silent);
    const background = Boolean(opts?.background);

    if (!silent && !background) {
      setLoading(true);
    }
    if (background) {
      setRefreshing(true);
    }

    try {
      const response = await apiFetch<DealMatchResponse>("/farmer/deal-matches");
      setMatches(response.matches || []);
      setMeta(response.meta);
      setSettings(response.settings);
      setMarginInput(String(response.settings?.min_margin_percent ?? 8));
      mergeDrafts(response.matches || []);

      const nextIds = new Set((response.matches || []).map((item) => item.request_id));
      if (background && isPro && settings?.realtime_alerts_enabled && seenMatchIdsRef.current.size) {
        const newIds = Array.from(nextIds).filter((id) => !seenMatchIdsRef.current.has(id));
        if (newIds.length) {
          toast.success(`${newIds.length} new deal match${newIds.length === 1 ? "" : "es"} found.`);
        }
      }
      seenMatchIdsRef.current = nextIds;
    } catch (error) {
      if (!silent) {
        toast.error(error instanceof Error ? error.message : "Failed to load deal matches.");
      }
    } finally {
      if (!silent && !background) {
        setLoading(false);
      }
      if (background) {
        setRefreshing(false);
      }
    }
  }, [isPro, mergeDrafts, settings?.realtime_alerts_enabled]);

  useEffect(() => {
    if (!isFarmer) {
      setLoading(false);
      return;
    }
    void loadMatches();
  }, [isFarmer, loadMatches]);

  useEffect(() => {
    if (!isPro || !settings?.realtime_alerts_enabled) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadMatches({ silent: true, background: true });
    }, PRO_POLLING_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isPro, loadMatches, settings?.realtime_alerts_enabled]);

  const updateDraft = (requestId: string, update: Partial<DraftState>) => {
    setDrafts((current) => ({
      ...current,
      [requestId]: {
        ...current[requestId],
        ...update,
      },
    }));
  };

  const applySuggestedDraft = (match: DealMatch) => {
    const floorPrice = match.margin_guard?.floor_price ?? 0;
    setDrafts((current) => ({
      ...current,
      [match.request_id]: {
        product_id: match.draft_offer.product_id,
        quantity_offered: String(match.draft_offer.quantity_offered),
        price_per_unit: String(match.draft_offer.price_per_unit),
        notes: match.draft_offer.notes || "",
        floor_price: floorPrice,
        budget_max: match.budget_max,
      },
    }));
    toast.success("Draft reset to suggested values.");
  };

  const submitDraftOffer = async (match: DealMatch) => {
    const draft = drafts[match.request_id];
    if (!draft) {
      toast.error("Draft is not ready yet.");
      return;
    }

    const quantity = asPositiveNumber(draft.quantity_offered);
    const price = asPositiveNumber(draft.price_per_unit);

    if (!quantity) {
      toast.error("Enter a valid quantity before submitting.");
      return;
    }
    if (!price) {
      toast.error("Enter a valid price before submitting.");
      return;
    }

    if (isPro && draft.floor_price > 0 && price < draft.floor_price) {
      toast.error(`Margin guard: price cannot be below ${formatCurrency(draft.floor_price)}.`);
      return;
    }

    setSubmittingRequestId(match.request_id);
    try {
      await apiFetch(`/farmer/procurement/${match.request_id}/responses`, {
        method: "POST",
        body: {
          product_id: draft.product_id,
          quantity_offered: quantity,
          price_per_unit: price,
          notes: draft.notes.trim() || null,
        } as unknown as BodyInit,
      });
      toast.success("Offer submitted to buyer request.");
      await loadMatches({ silent: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit offer.");
    } finally {
      setSubmittingRequestId(null);
    }
  };

  const saveProSettings = async () => {
    if (!isPro || !settings) {
      return;
    }

    const margin = asPositiveNumber(marginInput);
    if (!margin) {
      toast.error("Minimum margin percent must be a positive number.");
      return;
    }
    if (margin > 35) {
      toast.error("Minimum margin percent cannot be above 35.");
      return;
    }

    setSavingSettings(true);
    try {
      const response = await apiFetch<{ settings: DealMatchSettings }>("/farmer/deal-matches/settings", {
        method: "PATCH",
        body: {
          realtime_alerts_enabled: settings.realtime_alerts_enabled,
          min_margin_percent: margin,
        } as unknown as BodyInit,
      });
      setSettings(response.settings);
      setMarginInput(String(response.settings.min_margin_percent));
      toast.success("Deal Match settings saved.");
      await loadMatches({ silent: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const summary = useMemo(() => {
    const highFit = matches.filter((match) => match.fit_label === "high").length;
    const avgScore = matches.length
      ? (matches.reduce((sum, item) => sum + Number(item.score || 0), 0) / matches.length).toFixed(1)
      : "0.0";
    return {
      highFit,
      avgScore,
    };
  }, [matches]);

  const countyOptions = useMemo(() => {
    return Array.from(
      new Set(
        marketProducts
          .map((product) => product.profiles?.county?.trim())
          .filter((county): county is string => Boolean(county)),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [marketProducts]);

  const priceWatchInsights = useMemo<PriceWatchInsight[]>(() => {
    return priceWatchAlerts.map((alert) => {
      const matches = marketProducts.filter((product) => matchesPriceWatchAlert(product, alert));
      const matchingCount = matches.length;

      if (!matchingCount) {
        return {
          alert,
          averagePrice: null,
          matchingCount: 0,
          differencePercent: null,
          status: "no_data",
          bestCounty: null,
          bestCountyAverage: null,
        };
      }

      const averagePrice = matches.reduce((sum, product) => sum + Number(product.price_per_unit || 0), 0) / matchingCount;
      const differencePercent = alert.targetPrice > 0 ? ((averagePrice - alert.targetPrice) / alert.targetPrice) * 100 : 0;

      let status: PriceWatchInsight["status"] = "near";
      if (averagePrice >= alert.targetPrice * 1.05) {
        status = "above";
      } else if (averagePrice <= alert.targetPrice * 0.95) {
        status = "below";
      }

      const countyBuckets = new Map<string, { total: number; count: number }>();
      matches.forEach((product) => {
        const county = product.profiles?.county?.trim();
        if (!county) return;

        const existing = countyBuckets.get(county) || { total: 0, count: 0 };
        countyBuckets.set(county, {
          total: existing.total + Number(product.price_per_unit || 0),
          count: existing.count + 1,
        });
      });

      let bestCounty: string | null = null;
      let bestCountyAverage: number | null = null;

      countyBuckets.forEach((bucket, county) => {
        const countyAverage = bucket.total / bucket.count;
        if (bestCountyAverage === null || countyAverage < bestCountyAverage) {
          bestCountyAverage = countyAverage;
          bestCounty = county;
        }
      });

      return {
        alert,
        averagePrice,
        matchingCount,
        differencePercent,
        status,
        bestCounty,
        bestCountyAverage,
      };
    });
  }, [marketProducts, priceWatchAlerts]);

  const addPriceWatchAlert = () => {
    if (priceWatchAlerts.length >= priceWatchAlertLimit) {
      toast.error(`You have reached your ${priceWatchAlertLimit} alert limit on this plan.`);
      return;
    }

    const crop = watchCrop.trim();
    const county = watchCounty.trim();
    const targetPrice = Number(watchTargetPrice);

    if (!crop) {
      toast.error("Add a crop name to create a price alert.");
      return;
    }
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      toast.error("Enter a valid target price in KES.");
      return;
    }

    const duplicate = priceWatchAlerts.some(
      (alert) =>
        normalizePriceWatchText(alert.crop) === normalizePriceWatchText(crop)
        && normalizePriceWatchText(alert.county) === normalizePriceWatchText(county),
    );
    if (duplicate) {
      toast.error("You already have this crop alert for the same county.");
      return;
    }

    const nextAlert: PriceWatchAlert = {
      id: makePriceWatchId(),
      crop,
      county,
      targetPrice,
    };
    setPriceWatchAlerts((current) => [nextAlert, ...current]);
    setWatchCrop("");
    setWatchCounty("");
    setWatchTargetPrice("");
    toast.success("Price alert added.");
  };

  const removePriceWatchAlert = (alertId: string) => {
    setPriceWatchAlerts((current) => current.filter((alert) => alert.id !== alertId));
  };

  if (!isFarmer) {
    return (
      <DashboardShell title="Deal Matches">
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Deal Match Engine is available for farmer accounts.
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Deal Matches">
      <div className="space-y-6">
        <section className="rounded-[1.9rem] border border-emerald-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.2),_transparent_45%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(240,253,250,0.95))] p-5 shadow-[0_20px_44px_-34px_rgba(5,150,105,0.35)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                <Target className="h-3.5 w-3.5" />
                Buyer Opportunity Radar
              </div>
              <h2 className="mt-3 font-display text-2xl font-bold text-foreground">AI-matched deals from live procurement demand</h2>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                The engine maps your listings to company requests, prioritizes the best opportunities, and prepares a safe offer draft you can submit immediately.
              </p>
            </div>

            <div className="rounded-[1.35rem] border border-white/80 bg-white/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Current Plan</p>
              <div className="mt-2 flex items-center gap-2">
                {isPro ? <Crown className="h-4 w-4 text-gold-500" /> : <Leaf className="h-4 w-4 text-emerald-700" />}
                <p className="font-semibold text-foreground">{isPro ? "Farmer Pro" : "Farmer Free"}</p>
              </div>
              {!isPro ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Free visibility: {meta?.daily_limit ?? 3} matches/day
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">Realtime polling + win probability + margin guard</p>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1.35rem] border border-border/70 bg-card/95 p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Visible Matches</p>
            <p className="mt-2 font-display text-2xl font-bold text-foreground">{matches.length}</p>
            <p className="text-xs text-muted-foreground">Opportunities ready now</p>
          </div>
          <div className="rounded-[1.35rem] border border-border/70 bg-card/95 p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">High Fit</p>
            <p className="mt-2 font-display text-2xl font-bold text-foreground">{summary.highFit}</p>
            <p className="text-xs text-muted-foreground">Priority responses</p>
          </div>
          <div className="rounded-[1.35rem] border border-border/70 bg-card/95 p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Average Score</p>
            <p className="mt-2 font-display text-2xl font-bold text-foreground">{summary.avgScore}</p>
            <p className="text-xs text-muted-foreground">Match confidence trend</p>
          </div>
          <div className="rounded-[1.35rem] border border-border/70 bg-card/95 p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Daily Access</p>
            <p className="mt-2 font-display text-2xl font-bold text-foreground">
              {isPro ? "Unlimited" : `${meta?.remaining_today ?? 0} left`}
            </p>
            <p className="text-xs text-muted-foreground">{isPro ? "Pro real-time access" : "Free daily opportunity cap"}</p>
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "matches" | "watchlist")} className="w-full">
          <TabsList className="grid w-full grid-cols-2 rounded-[0.95rem] bg-muted p-1">
            <TabsTrigger value="matches" className="rounded-[0.8rem]">Buyer Matches</TabsTrigger>
            <TabsTrigger value="watchlist" className="rounded-[0.8rem]">Market Watchlist</TabsTrigger>
          </TabsList>

          <TabsContent value="matches" className="mt-5 space-y-4">
            <section className="rounded-[1.5rem] border border-border/70 bg-card/95 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-semibold text-foreground">Engine Controls</p>
                  <p className="text-xs text-muted-foreground">
                    {meta?.generated_at ? `Last generated ${new Date(meta.generated_at).toLocaleString()}` : "Ready"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {isPro && settings ? (
                    <>
                      <label className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground">
                        <BellRing className="h-3.5 w-3.5" />
                        Realtime alerts
                        <Switch
                          checked={settings.realtime_alerts_enabled}
                          onCheckedChange={(value) => setSettings((current) => (current ? { ...current, realtime_alerts_enabled: value } : current))}
                        />
                      </label>
                      <div className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs">
                        <span className="font-semibold text-foreground">Min margin %</span>
                        <Input
                          value={marginInput}
                          onChange={(event) => setMarginInput(event.target.value)}
                          className="h-8 w-20"
                          type="number"
                          min={1}
                          max={35}
                          step={0.5}
                        />
                      </div>
                      <Button type="button" variant="outline" onClick={() => void saveProSettings()} disabled={savingSettings}>
                        {savingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                        Save
                      </Button>
                    </>
                  ) : null}
                  <Button type="button" variant="outline" onClick={() => void loadMatches({ background: true })} disabled={refreshing || loading}>
                    {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Refresh
                  </Button>
                </div>
              </div>

              {!isPro ? (
                <div className="mt-3 rounded-xl border border-amber-300/70 bg-amber-50/80 p-3 text-sm text-amber-900">
                  <p className="font-semibold">Unlock full Deal Match Engine on Pro</p>
                  <p className="mt-1 text-xs text-amber-800">You are seeing up to 3 opportunities today. Pro unlocks unlimited live matching, win probability scoring, and adjustable margin guard.</p>
                  <Button asChild variant="outline" className="mt-3 border-amber-300 bg-white text-amber-900 hover:bg-amber-100">
                    <Link to="/dashboard/upgrade">Upgrade Plan</Link>
                  </Button>
                </div>
              ) : null}
            </section>

            {loading ? (
              <div className="rounded-[1.5rem] border border-border bg-card/95 p-8 text-center text-sm text-muted-foreground">Loading deal matches...</div>
            ) : matches.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-background/60 p-8 text-center text-sm text-muted-foreground">
                No deal matches are available right now. Add or refresh product listings in <Link to="/dashboard/products" className="font-semibold text-primary underline-offset-2 hover:underline">My Products</Link> to improve matching.
              </div>
            ) : (
              <div className="space-y-4">
                {matches.map((match) => {
                  const draft = drafts[match.request_id];
                  const priceNumber = draft ? Number(draft.price_per_unit) : 0;
                  const violatesMargin = Boolean(isPro && draft && draft.floor_price > 0 && priceNumber > 0 && priceNumber < draft.floor_price);
                  const fitClass = scoreLabelClass(match.fit_label);

                  return (
                    <article key={match.request_id} className="rounded-[1.55rem] border border-border/75 bg-card/95 p-4 shadow-sm">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="font-display text-xl font-bold text-foreground">{match.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {match.company.company_name} • {match.category} • {match.target_county || "Any county"}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Request: {match.quantity_needed} {match.unit} • Budget {formatCurrency(match.budget_min || 0)} - {formatCurrency(match.budget_max || 0)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.13em] ${fitClass}`}>
                            {match.fit_label} fit
                          </span>
                          <span className="rounded-full border border-emerald-300/60 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                            Score {match.score}
                          </span>
                          {isPro && typeof match.win_probability === "number" ? (
                            <span className="rounded-full border border-violet-300/60 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                              Win {match.win_probability}%
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 lg:grid-cols-3">
                        <div className="rounded-xl border border-border bg-background/70 p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Recommended Product</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">{match.recommended_product.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {match.recommended_product.stock} {match.recommended_product.unit} in stock • {formatCurrency(match.recommended_product.price_per_unit)} / {match.recommended_product.unit}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border bg-background/70 p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Suggested Price Range</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {formatCurrency(match.suggested_price_range.min)} - {formatCurrency(match.suggested_price_range.max)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">Based on listing price, budget fit, and guardrails.</p>
                        </div>
                        <div className="rounded-xl border border-border bg-background/70 p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Competitive Context</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {match.responses_count} offers • {match.submitted_responses_count} pending
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">Lower competition usually improves acceptance speed.</p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {match.reasons.map((reason) => (
                          <span key={reason} className="rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                            {reason}
                          </span>
                        ))}
                      </div>

                      {draft ? (
                        <div className="mt-4 rounded-xl border border-border bg-background/70 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">One-click Offer Draft</p>
                            <div className="flex items-center gap-2">
                              {match.already_applied ? (
                                <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                                  Existing status: {match.my_response_status || "submitted"}
                                </span>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => applySuggestedDraft(match)}
                                className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-muted"
                              >
                                Use Suggested Draft
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-3 sm:grid-cols-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground">Quantity</label>
                              <Input
                                value={draft.quantity_offered}
                                onChange={(event) => updateDraft(match.request_id, { quantity_offered: event.target.value })}
                                type="number"
                                min={0}
                                step={0.01}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground">Price Per Unit (KES)</label>
                              <Input
                                value={draft.price_per_unit}
                                onChange={(event) => updateDraft(match.request_id, { price_per_unit: event.target.value })}
                                type="number"
                                min={0}
                                step={0.01}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground">Product ID</label>
                              <Input
                                value={draft.product_id}
                                onChange={(event) => updateDraft(match.request_id, { product_id: event.target.value })}
                                className="mt-1"
                              />
                            </div>
                          </div>

                          <div className="mt-3">
                            <label className="text-xs font-medium text-muted-foreground">Notes</label>
                            <textarea
                              value={draft.notes}
                              onChange={(event) => updateDraft(match.request_id, { notes: event.target.value })}
                              rows={2}
                              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                            />
                          </div>

                          {isPro && draft.floor_price > 0 ? (
                            <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${violatesMargin ? "border-rose-300 bg-rose-50 text-rose-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"}`}>
                              Margin guard floor: {formatCurrency(draft.floor_price)}.
                              {violatesMargin ? " Raise your price to stay protected." : " Draft price is within safe margin."}
                            </div>
                          ) : null}

                          {isPro && match.margin_guard?.would_violate_budget ? (
                            <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                              Margin floor is above buyer budget. Adjust quantity or add notes before submitting.
                            </div>
                          ) : null}

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              onClick={() => void submitDraftOffer(match)}
                              disabled={submittingRequestId === match.request_id || violatesMargin}
                            >
                              {submittingRequestId === match.request_id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrendingUp className="mr-2 h-4 w-4" />}
                              Submit Offer
                            </Button>
                            <Button asChild variant="outline">
                              <Link to="/dashboard/discover">Open Full Procurement Board</Link>
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}

            {!settings?.settings_persisted ? (
              <div className="rounded-xl border border-amber-300/70 bg-amber-50/80 p-3 text-xs text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4" />
                  <div>
                    <p className="font-semibold">Deal match settings table is not installed yet.</p>
                    <p className="mt-1">Run the new SQL migration to persist realtime and daily unlock settings in the database.</p>
                  </div>
                </div>
              </div>
            ) : null}

            {isPro ? (
              <div className="rounded-xl border border-violet-300/65 bg-violet-50/75 p-3 text-xs text-violet-900">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4" />
                  <p className="font-semibold">Pro tip</p>
                </div>
                <p className="mt-1">Keep realtime alerts on and set a margin floor that matches your cost discipline. This keeps high-fit deals moving without underpricing.</p>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="watchlist" className="mt-5 space-y-4">
            <section className="rounded-[1.5rem] border border-border/70 bg-card/95 p-4">
              <div className="flex items-center gap-2">
                <Radar className="h-4 w-4 text-emerald-700" />
                <p className="font-semibold text-foreground">Market Watchlist</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Embedded price tracking inside Deal Matches. Alerts used: {priceWatchAlerts.length} / {priceWatchAlertLimit}.
              </p>
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
              <div className="rounded-[1.5rem] border border-border/70 bg-card/95 p-4">
                <p className="font-semibold text-foreground">Create Price Alert</p>
                <p className="mt-1 text-xs text-muted-foreground">Set a crop and target price, then compare against live marketplace averages.</p>

                <div className="mt-3 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Crop</label>
                    <Input
                      value={watchCrop}
                      onChange={(event) => setWatchCrop(event.target.value)}
                      placeholder="Example: tomatoes"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">County (Optional)</label>
                    <Input
                      value={watchCounty}
                      onChange={(event) => setWatchCounty(event.target.value)}
                      list="deal-matches-price-watch-counties"
                      placeholder="All counties"
                      className="mt-1"
                    />
                    <datalist id="deal-matches-price-watch-counties">
                      {countyOptions.map((county) => (
                        <option key={county} value={county} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Target Price (KES)</label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={watchTargetPrice}
                      onChange={(event) => setWatchTargetPrice(event.target.value)}
                      placeholder="Example: 120"
                      className="mt-1"
                    />
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={addPriceWatchAlert}
                    disabled={priceWatchAlerts.length >= priceWatchAlertLimit}
                  >
                    <BellPlus className="mr-2 h-4 w-4" />
                    Add Price Alert
                  </Button>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-border/70 bg-card/95 p-4">
                <p className="font-semibold text-foreground">Watchlist Insights</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {marketPricesLoading
                    ? "Reading live marketplace prices..."
                    : `${marketProducts.length} marketplace listings power these checks.`}
                </p>

                <div className="mt-3 space-y-3">
                  {priceWatchInsights.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                      Add an alert to start tracking prices from live listings.
                    </div>
                  ) : (
                    priceWatchInsights.map((insight) => {
                      const status = priceWatchStatusMeta(insight.status);
                      return (
                        <article key={insight.alert.id} className="rounded-xl border border-border bg-background/70 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-foreground">{insight.alert.crop}</p>
                              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="h-3.5 w-3.5" />
                                {insight.alert.county || "All counties"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] ${status.cls}`}>
                                {status.label}
                              </span>
                              <button
                                type="button"
                                onClick={() => removePriceWatchAlert(insight.alert.id)}
                                className="rounded-md border border-border p-1 text-muted-foreground hover:text-rose-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                            <p>Target: <span className="font-semibold text-foreground">{formatCurrency(insight.alert.targetPrice)}</span></p>
                            <p>Market avg: <span className="font-semibold text-foreground">{insight.averagePrice === null ? "No data" : formatCurrency(insight.averagePrice)}</span></p>
                            <p>Listings: <span className="font-semibold text-foreground">{insight.matchingCount}</span></p>
                            <p>Gap: <span className="font-semibold text-foreground">{insight.differencePercent === null ? "No data" : `${insight.differencePercent >= 0 ? "+" : ""}${insight.differencePercent.toFixed(1)}%`}</span></p>
                          </div>

                          {isPro ? (
                            <p className="mt-2 rounded-lg border border-emerald-200/70 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-800">
                              {insight.bestCounty && insight.bestCountyAverage !== null
                                ? `Best county signal: ${insight.bestCounty} around ${formatCurrency(insight.bestCountyAverage)} average.`
                                : "No county-level signal yet for this alert."}
                            </p>
                          ) : (
                            <p className="mt-2 rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-muted-foreground">
                              Pro unlock: county-level lowest-price signal for each alert.
                            </p>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}
