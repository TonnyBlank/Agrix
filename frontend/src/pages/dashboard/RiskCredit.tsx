import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  CloudSun,
  CreditCard,
  FileText,
  Leaf,
  MapPin,
  Package,
  RefreshCw,
  Send,
  ShieldCheck,
  Sprout,
  Store,
  Trash2,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import DashboardShell from "@/components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useOrders } from "@/hooks/useOrders";
import { useMyProducts } from "@/hooks/useProducts";
import { useWeather } from "@/hooks/useWeather";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

type RecordType = "insurance" | "green_credit";

type RecordDraft = {
  type: RecordType;
  title: string;
  amount: string;
  enterprise: string;
  riskFocus: string;
  evidence: string;
  climatePractice: string;
};

type FinanceRecord = RecordDraft & {
  id: string;
  status: "draft" | "ready" | "submitted" | "reviewing" | "approved" | "declined";
  readinessScore: number;
  greenScore: number;
  partnerNote?: string;
  partnerReference?: string;
  submittedAt?: string | null;
  updatedAt?: string | null;
  createdAt: string;
};

type ReadinessSignal = {
  label: string;
  detail: string;
  ready: boolean;
  points: number;
  icon: LucideIcon;
  href: string;
};

const initialDraft: RecordDraft = {
  type: "insurance",
  title: "",
  amount: "",
  enterprise: "",
  riskFocus: "",
  evidence: "",
  climatePractice: "",
};

const activeStatuses = new Set(["pending", "confirmed", "processing", "shipped"]);
const revenueStatuses = new Set(["confirmed", "processing", "shipped", "delivered"]);
const completedStatuses = new Set(["shipped", "delivered"]);

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-KE", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function weatherLabel(code: number | null | undefined) {
  if (typeof code !== "number") return "Unavailable";
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code === 45 || code === 48) return "Fog watch";
  if (code >= 51 && code <= 67) return "Rain likely";
  if (code >= 71 && code <= 77) return "Cold precipitation";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 95) return "Storm watch";
  return "Changing weather";
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function ProgressBar({ value, tone = "primary" }: { value: number; tone?: "primary" | "amber" | "sky" }) {
  const fillClass =
    tone === "amber"
      ? "bg-amber-500"
      : tone === "sky"
        ? "bg-sky-500"
        : "bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--gold-500)))]";

  return (
    <div className="h-2 rounded-full bg-muted">
      <div className={cn("h-full rounded-full", fillClass)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-border/75 bg-white/88 p-4 shadow-[0_18px_38px_-34px_rgba(15,23,42,0.32)] dark:bg-background/78">
      <div className="flex items-center gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", tone)}>
          <Icon className="h-5 w-5" />
        </span>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      </div>
      <p className="mt-5 font-display text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-2 min-h-10 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function ReadinessRow({ signal }: { signal: ReadinessSignal }) {
  const Icon = signal.icon;

  return (
    <Link
      to={signal.href}
      className="flex items-start justify-between gap-4 rounded-lg border border-border/75 bg-white/82 p-4 transition-colors hover:border-primary/35 dark:bg-background/70"
    >
      <span className="flex min-w-0 gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            signal.ready ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/12 text-amber-700",
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-foreground">{signal.label}</span>
          <span className="mt-1 block text-sm leading-6 text-muted-foreground">{signal.detail}</span>
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
          signal.ready ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground",
        )}
      >
        {signal.ready ? `${signal.points} pts` : "Needed"}
      </span>
    </Link>
  );
}

function recordStatusClass(status: FinanceRecord["status"]) {
  if (status === "approved") return "bg-emerald-500/10 text-emerald-700";
  if (status === "submitted" || status === "reviewing") return "bg-sky-500/10 text-sky-700";
  if (status === "declined") return "bg-rose-500/10 text-rose-700";
  if (status === "ready") return "bg-primary/10 text-primary";
  return "bg-amber-500/12 text-amber-700";
}

export default function RiskCredit() {
  const { profile, role, user } = useAuth();
  const { sellingOrders, buyingOrders, loading: ordersLoading } = useOrders();
  const { products, loading: productsLoading } = useMyProducts();
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [savingRecord, setSavingRecord] = useState(false);
  const [submittingRecordId, setSubmittingRecordId] = useState<string | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecordDraft>(initialDraft);

  const isCompany = role === "company";
  const profileHref = isCompany ? "/dashboard/company/settings" : "/dashboard/farm";
  const storedSubCounty =
    typeof window !== "undefined" ? window.localStorage.getItem("farm_sub_county")?.trim() || "" : "";
  const weatherLookupLocation =
    storedSubCounty && profile?.county ? `${storedSubCounty}, ${profile.county}` : profile?.county || null;
  const weather = useWeather(weatherLookupLocation);
  const storageKey = `agrilink:risk-credit:${user?.id || "anonymous"}`;
  const financeHref = role === "farmer_free" ? "/dashboard/upgrade" : role === "company" ? "/dashboard/services" : "/dashboard/micro-loans";
  const financeLabel = role === "farmer_free" ? "Upgrade plan" : role === "company" ? "Services hub" : "Open loans";

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    setRecordsError(null);
    try {
      const rows = await apiFetch<FinanceRecord[]>("/risk-credit/records");
      setRecords(rows);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, JSON.stringify(rows));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load risk and credit records.";
      setRecordsError(message);
      try {
        if (typeof window !== "undefined") {
          const raw = window.localStorage.getItem(storageKey);
          setRecords(raw ? (JSON.parse(raw) as FinanceRecord[]) : []);
        }
      } catch {
        setRecords([]);
      }
    } finally {
      setRecordsLoading(false);
    }
  }, [storageKey]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const activeListings = products.filter((product) => product.is_available);
  const allOrders = [...sellingOrders, ...buyingOrders];
  const activeOrders = allOrders.filter((order) => activeStatuses.has(order.status));
  const completedPaidOrders = sellingOrders.filter(
    (order) => completedStatuses.has(order.status) && order.payment_status === "paid",
  );
  const tradeRevenue = sellingOrders
    .filter((order) => revenueStatuses.has(order.status))
    .reduce((sum, order) => sum + order.total_price, 0);

  const enterpriseText = [
    ...(profile?.main_crops ?? []),
    ...products.flatMap((product) => [product.name, product.category, product.description ?? ""]),
  ]
    .join(" ")
    .toLowerCase();

  const hasMappedLocation =
    profile?.farm_gps_lat !== null &&
    profile?.farm_gps_lat !== undefined &&
    profile?.farm_gps_lng !== null &&
    profile?.farm_gps_lng !== undefined;
  const hasPerishables = includesAny(enterpriseText, [
    "egg",
    "milk",
    "fish",
    "tomato",
    "vegetable",
    "fruit",
    "avocado",
    "meat",
    "chicken",
    "dairy",
  ]);
  const hasLivestock = includesAny(enterpriseText, ["livestock", "cattle", "goat", "sheep", "dairy", "milk"]);
  const hasPoultry = includesAny(enterpriseText, ["egg", "chicken", "poultry", "broiler", "layer"]);
  const hasOrganicListings = products.some((product) => product.is_organic);

  const readinessSignals = useMemo<ReadinessSignal[]>(
    () => [
      {
        label: "Location profile",
        detail: profile?.county ? `${profile.county} is available for risk location checks.` : "Add county before preparing cover or credit documents.",
        ready: Boolean(profile?.county),
        points: 14,
        icon: MapPin,
        href: profileHref,
      },
      {
        label: "Enterprise evidence",
        detail: profile?.main_crops?.length || activeListings.length
          ? "Enterprise mix is visible from profile and listings."
          : "Add crops, poultry, dairy, livestock, inputs, or services.",
        ready: Boolean(profile?.main_crops?.length || activeListings.length),
        points: 16,
        icon: Sprout,
        href: isCompany ? "/dashboard/company/products" : "/dashboard/products",
      },
      {
        label: "Mapped operation",
        detail: hasMappedLocation ? "GPS coordinates can support climate and green-credit checks." : "Map the operation to strengthen GMCIS and green-credit evidence.",
        ready: hasMappedLocation,
        points: 16,
        icon: Leaf,
        href: profileHref,
      },
      {
        label: "Storage signal",
        detail: profile?.has_storage ? "Storage capacity is recorded." : "Add storage details for post-harvest and perishables risk.",
        ready: Boolean(profile?.has_storage),
        points: 12,
        icon: Package,
        href: profileHref,
      },
      {
        label: "Transport signal",
        detail: profile?.has_transport ? "Transport capacity is recorded." : "Add transport details for delivery and transit cover.",
        ready: Boolean(profile?.has_transport),
        points: 12,
        icon: Truck,
        href: profileHref,
      },
      {
        label: "Trade proof",
        detail: completedPaidOrders.length
          ? `${completedPaidOrders.length} paid delivered trade ${completedPaidOrders.length === 1 ? "record" : "records"} found.`
          : "Complete paid deliveries to build stronger partner evidence.",
        ready: completedPaidOrders.length > 0,
        points: 18,
        icon: Store,
        href: "/dashboard/orders",
      },
      {
        label: "Active finance file",
        detail: records.length ? `${records.length} saved finance ${records.length === 1 ? "record" : "records"} in progress.` : "Save an insurance or green-credit record from this page.",
        ready: records.length > 0,
        points: 12,
        icon: FileText,
        href: "/dashboard/risk-credit",
      },
    ],
    [
      activeListings.length,
      completedPaidOrders.length,
      hasMappedLocation,
      isCompany,
      profile?.county,
      profile?.has_storage,
      profile?.has_transport,
      profile?.main_crops?.length,
      profileHref,
      records.length,
    ],
  );

  const readinessScore = readinessSignals.reduce((sum, signal) => sum + (signal.ready ? signal.points : 0), 0);
  const greenSignals = [
    {
      label: "Mapped farm or operation",
      ready: hasMappedLocation,
      detail: hasMappedLocation ? "Coordinates captured" : "GPS mapping needed",
      points: 25,
    },
    {
      label: "Climate-smart practice",
      ready: records.some((record) => record.type === "green_credit" && record.climatePractice.trim()),
      detail: "Saved from green-credit records",
      points: 20,
    },
    {
      label: "Organic or premium listing",
      ready: hasOrganicListings,
      detail: hasOrganicListings ? "Organic listing evidence found" : "Add organic product evidence",
      points: 15,
    },
    {
      label: "Verified trade history",
      ready: completedPaidOrders.length > 0,
      detail: completedPaidOrders.length ? "Paid deliveries available" : "Waiting for paid deliveries",
      points: 20,
    },
    {
      label: "Storage or transport discipline",
      ready: Boolean(profile?.has_storage || profile?.has_transport),
      detail: profile?.has_storage || profile?.has_transport ? "Operational controls recorded" : "Add controls in profile",
      points: 20,
    },
  ];
  const greenScore = greenSignals.reduce((sum, signal) => sum + (signal.ready ? signal.points : 0), 0);

  const temperature = typeof weather.temperature === "number" ? weather.temperature : null;
  const weatherRisk = typeof weather.weathercode === "number" && (weather.weathercode >= 51 || weather.weathercode === 45 || weather.weathercode === 48);
  const heatRisk = temperature !== null && temperature >= 30;
  const riskFlags = [
    {
      label: "Weather watch",
      active: weatherRisk,
      detail: weatherRisk ? weatherLabel(weather.weathercode) : "No wet-weather warning from the current signal.",
    },
    {
      label: "Heat stress",
      active: heatRisk,
      detail: heatRisk && temperature !== null ? `${temperature.toFixed(1)}C can raise crop, poultry, and dairy stress.` : "No heat stress flag from current weather.",
    },
    {
      label: "Perishables exposure",
      active: hasPerishables && !profile?.has_storage,
      detail: hasPerishables && !profile?.has_storage ? "Perishable enterprises need storage or cold-chain evidence." : "Storage exposure is under control.",
    },
    {
      label: "Transit exposure",
      active: activeOrders.length > 0 && !profile?.has_transport,
      detail: activeOrders.length > 0 && !profile?.has_transport ? "Active orders need clear transport handling." : "No urgent transport risk flag.",
    },
  ];
  const activeRiskFlags = riskFlags.filter((flag) => flag.active);

  const recommendedCover = [
    {
      title: "Weather-index cover",
      active: Boolean(profile?.county),
      detail: "Best fit when location, farm size, and enterprise details are known.",
    },
    {
      title: "Post-harvest storage cover",
      active: hasPerishables || Boolean(profile?.has_storage),
      detail: "Useful for eggs, milk, fish, fruit, vegetables, and other quality-sensitive goods.",
    },
    {
      title: "Transit and delivery cover",
      active: activeOrders.length > 0 || Boolean(profile?.has_transport),
      detail: "Supports goods moving through pickup, dispatch, and buyer confirmation.",
    },
    {
      title: "Livestock and poultry cover",
      active: hasLivestock || hasPoultry,
      detail: "Aligns mortality and production interruption risk with herd or flock evidence.",
    },
  ].filter((item) => item.active);

  const latestRecord = records[0];
  const readyRecords = records.filter((record) => record.status === "ready").length;
  const submittedRecords = records.filter((record) => ["submitted", "reviewing"].includes(record.status)).length;
  const approvedRecords = records.filter((record) => record.status === "approved").length;
  const loading = ordersLoading || productsLoading || recordsLoading;

  const updateDraft = (updates: Partial<RecordDraft>) => {
    setDraft((current) => ({ ...current, ...updates }));
  };

  const saveRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!draft.title.trim() || !draft.enterprise.trim() || !draft.riskFocus.trim()) {
      toast.error("Add a title, enterprise, and risk focus before saving.");
      return;
    }

    setSavingRecord(true);
    try {
      const record = await apiFetch<FinanceRecord>("/risk-credit/records", {
        method: "POST",
        body: {
          ...draft,
          title: draft.title.trim(),
          amount: draft.amount.trim(),
          enterprise: draft.enterprise.trim(),
          riskFocus: draft.riskFocus.trim(),
          evidence: draft.evidence.trim(),
          climatePractice: draft.climatePractice.trim(),
          readinessScore,
          greenScore,
          metadata: {
            activeListings: activeListings.length,
            activeOrders: activeOrders.length,
            completedPaidOrders: completedPaidOrders.length,
            weather: {
              location: weather.locationName || weatherLookupLocation || profile?.county || null,
              temperature: weather.temperature,
              weathercode: weather.weathercode,
            },
          },
        },
      });
      setRecords((current) => [record, ...current.filter((item) => item.id !== record.id)].slice(0, 10));
      setDraft(initialDraft);
      toast.success(record.status === "ready" ? "Finance record marked ready." : "Finance draft saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save risk and credit record.");
    } finally {
      setSavingRecord(false);
    }
  };

  const submitRecord = async (recordId: string) => {
    setSubmittingRecordId(recordId);
    try {
      const updated = await apiFetch<FinanceRecord>(`/risk-credit/records/${recordId}/submit`, {
        method: "POST",
      });
      setRecords((current) => current.map((record) => (record.id === updated.id ? updated : record)));
      toast.success("Finance file submitted for partner review.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit finance record.");
    } finally {
      setSubmittingRecordId(null);
    }
  };

  const deleteRecord = async (recordId: string) => {
    setDeletingRecordId(recordId);
    try {
      await apiFetch<{ success: boolean }>(`/risk-credit/records/${recordId}`, {
        method: "DELETE",
      });
      setRecords((current) => current.filter((record) => record.id !== recordId));
      toast.success("Finance record deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete finance record.");
    } finally {
      setDeletingRecordId(null);
    }
  };

  return (
    <DashboardShell title="Risk & Credit">
      <div className="space-y-5">
        <section className="rounded-[1.3rem] border border-border/70 bg-white/90 p-4 shadow-[0_16px_28px_-24px_rgba(15,23,42,0.18)] dark:bg-card/90">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Partner Readiness Workspace</p>
              <p className="text-sm text-muted-foreground">
                Prepare insurance and green-credit files from profile, trade, climate, storage, and transport evidence.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <Button asChild variant="outline" className="h-9 rounded-xl">
                <Link to={profileHref}>
                  Strengthen Profile
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-9 rounded-xl">
                <Link to={financeHref}>
                  {financeLabel}
                  <CreditCard className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button type="button" className="h-9 rounded-xl" onClick={() => void loadRecords()} disabled={recordsLoading}>
                <RefreshCw className={cn("mr-2 h-4 w-4", recordsLoading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              {latestRecord
                ? `Latest file: ${latestRecord.title} (${latestRecord.status}) on ${formatDate(latestRecord.createdAt)}.`
                : "No finance file saved yet. Create one from the dossier panel below."}
            </p>
            <p>{records.length} saved record{records.length === 1 ? "" : "s"}.</p>
          </div>
          {recordsError ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              {recordsError}
            </div>
          ) : null}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={ShieldCheck}
            label="Risk readiness"
            value={loading ? "Loading" : `${readinessScore}%`}
            detail={`${readinessSignals.filter((signal) => signal.ready).length}/${readinessSignals.length} readiness signals complete`}
            tone="bg-emerald-500/10 text-emerald-700"
          />
          <StatTile
            icon={Leaf}
            label="Green score"
            value={`${greenScore}%`}
            detail={`${greenSignals.filter((signal) => signal.ready).length}/${greenSignals.length} climate-credit signals available`}
            tone="bg-lime-500/12 text-lime-700"
          />
          <StatTile
            icon={Store}
            label="Trade evidence"
            value={loading ? "Loading" : formatCurrency(tradeRevenue)}
            detail={`${completedPaidOrders.length} paid delivered ${completedPaidOrders.length === 1 ? "order" : "orders"} in the file`}
            tone="bg-sky-500/10 text-sky-700"
          />
          <StatTile
            icon={FileText}
            label="Finance records"
            value={recordsLoading ? "Loading" : `${records.length}`}
            detail={`${readyRecords} ready, ${submittedRecords} in review, ${approvedRecords} approved`}
            tone="bg-amber-500/12 text-amber-700"
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="rounded-lg border border-border/75 bg-white/86 p-5 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.18)] dark:bg-background/74">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">Insurance file</p>
                <h2 className="mt-2 font-display text-2xl font-bold leading-tight text-foreground">
                  Readiness checks
                </h2>
              </div>
              <ClipboardCheck className="h-9 w-9 text-primary" />
            </div>

            <div className="mt-5 space-y-3">
              {readinessSignals.map((signal) => (
                <ReadinessRow key={signal.label} signal={signal} />
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-lg border border-border/75 bg-white/86 p-5 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.18)] dark:bg-background/74">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">Risk flags</p>
                  <h2 className="mt-2 font-display text-2xl font-bold leading-tight text-foreground">
                    Current exposure
                  </h2>
                </div>
                <AlertTriangle className={cn("h-9 w-9", activeRiskFlags.length ? "text-amber-600" : "text-emerald-600")} />
              </div>

              <div className="mt-5 space-y-3">
                {(activeRiskFlags.length ? activeRiskFlags : riskFlags.slice(0, 2)).map((flag) => (
                  <div key={flag.label} className="rounded-lg border border-border/75 bg-muted/28 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-foreground">{flag.label}</p>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                          flag.active ? "bg-amber-500/12 text-amber-700" : "bg-emerald-500/10 text-emerald-700",
                        )}
                      >
                        {flag.active ? "Watch" : "Clear"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{flag.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border/75 bg-white/86 p-5 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.18)] dark:bg-background/74">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">Recommended cover</p>
                  <h2 className="mt-2 font-display text-2xl font-bold leading-tight text-foreground">
                    Best fit products
                  </h2>
                </div>
                <Banknote className="h-9 w-9 text-primary" />
              </div>

              <div className="mt-5 grid gap-3">
                {(recommendedCover.length ? recommendedCover : [
                  {
                    title: "Basic farm risk cover",
                    detail: "Start with location, enterprise, storage, and trade records.",
                  },
                ]).map((item) => (
                  <div key={item.title} className="rounded-lg border border-border/75 bg-muted/28 p-4">
                    <p className="font-semibold text-foreground">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="rounded-lg border border-border/75 bg-white/86 p-5 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.18)] dark:bg-background/74">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">Green credit</p>
                <h2 className="mt-2 font-display text-2xl font-bold leading-tight text-foreground">
                  Climate finance signals
                </h2>
              </div>
              <Leaf className="h-9 w-9 text-lime-700" />
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">Green-credit score</span>
                <span className="text-muted-foreground">{greenScore}%</span>
              </div>
              <div className="mt-2">
                <ProgressBar value={greenScore} tone="sky" />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {greenSignals.map((signal) => (
                <div key={signal.label} className="rounded-lg border border-border/75 bg-muted/28 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{signal.label}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{signal.detail}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                        signal.ready ? "bg-lime-500/12 text-lime-700" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {signal.ready ? `${signal.points} pts` : "Needed"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border/75 bg-white/86 p-5 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.18)] dark:bg-background/74">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">Finance dossier</p>
                <h2 className="mt-2 font-display text-2xl font-bold leading-tight text-foreground">
                  Save partner-ready context
                </h2>
              </div>
              <FileText className="h-9 w-9 text-primary" />
            </div>

            <form className="mt-5 grid gap-4" onSubmit={saveRecord}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Finance type
                  <select
                    value={draft.type}
                    onChange={(event) => updateDraft({ type: event.target.value as RecordType })}
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                  >
                    <option value="insurance">Insurance</option>
                    <option value="green_credit">Green credit</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Target amount
                  <input
                    value={draft.amount}
                    onChange={(event) => updateDraft({ amount: event.target.value })}
                    placeholder="e.g. KES 80,000"
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm font-medium text-foreground">
                Title
                <input
                  value={draft.title}
                  onChange={(event) => updateDraft({ title: event.target.value })}
                  placeholder="e.g. Tomato weather cover for April crop"
                  className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-foreground">
                Enterprise
                <input
                  value={draft.enterprise}
                  onChange={(event) => updateDraft({ enterprise: event.target.value })}
                  placeholder="e.g. Tomatoes, eggs, dairy, fish, storage"
                  className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-foreground">
                Risk focus
                <textarea
                  rows={3}
                  value={draft.riskFocus}
                  onChange={(event) => updateDraft({ riskFocus: event.target.value })}
                  placeholder="Weather, pests, storage loss, transit, disease, or repayment risk"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-foreground">
                Evidence notes
                <textarea
                  rows={3}
                  value={draft.evidence}
                  onChange={(event) => updateDraft({ evidence: event.target.value })}
                  placeholder="Sales, delivery proof, storage records, certifications, buyer commitments"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-foreground">
                Climate practice
                <input
                  value={draft.climatePractice}
                  onChange={(event) => updateDraft({ climatePractice: event.target.value })}
                  placeholder="e.g. Drip irrigation, composting, water harvesting, soil cover"
                  className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                />
              </label>

              <div className="flex justify-end">
                <Button type="submit" className="rounded-xl" disabled={savingRecord}>
                  {savingRecord ? "Saving..." : "Save record"}
                  <CheckCircle2 className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </form>

            <div className="mt-6 border-t border-border/70 pt-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-lg font-bold text-foreground">Saved records</p>
                <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {records.length}/10
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {recordsLoading ? (
                  <div className="rounded-lg border border-border bg-white/85 p-4 text-sm text-muted-foreground dark:bg-card/85">
                    Loading finance records...
                  </div>
                ) : records.length ? (
                  records.map((record) => (
                    <div key={record.id} className="rounded-lg border border-border/75 bg-muted/28 p-4">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div>
                          <p className="font-semibold text-foreground">{record.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {record.type === "green_credit" ? "Green credit" : "Insurance"} - {record.enterprise}
                          </p>
                        </div>
                        <span
                          className={cn("w-fit rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]", recordStatusClass(record.status))}
                        >
                          {record.status}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{record.riskFocus}</p>
                      {record.partnerNote ? (
                        <p className="mt-3 rounded-xl border border-border/70 bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                          <span className="font-semibold text-foreground">Partner note:</span> {record.partnerNote}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full border border-border/70 bg-background px-2.5 py-1">
                          {formatDate(record.createdAt)}
                        </span>
                        {record.amount ? (
                          <span className="rounded-full border border-border/70 bg-background px-2.5 py-1">{record.amount}</span>
                        ) : null}
                        <span className="rounded-full border border-border/70 bg-background px-2.5 py-1">
                          Risk {record.readinessScore}%
                        </span>
                        <span className="rounded-full border border-border/70 bg-background px-2.5 py-1">
                          Green {record.greenScore}%
                        </span>
                        {record.partnerReference ? (
                          <span className="rounded-full border border-border/70 bg-background px-2.5 py-1">
                            Ref {record.partnerReference}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        {record.status === "ready" ? (
                          <Button
                            type="button"
                            size="sm"
                            className="h-9 rounded-xl"
                            onClick={() => void submitRecord(record.id)}
                            disabled={submittingRecordId === record.id}
                          >
                            <Send className="mr-2 h-4 w-4" />
                            {submittingRecordId === record.id ? "Submitting..." : "Submit"}
                          </Button>
                        ) : null}
                        {record.status === "draft" || record.status === "ready" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9 rounded-xl text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => void deleteRecord(record.id)}
                            disabled={deletingRecordId === record.id}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {deletingRecordId === record.id ? "Deleting..." : "Delete"}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-muted/28 p-4 text-sm leading-6 text-muted-foreground">
                    No finance records saved yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border/75 bg-white/86 p-4 dark:bg-background/74">
            <div className="flex items-center gap-3">
              <CloudSun className="h-5 w-5 text-sky-600" />
              <p className="font-semibold text-foreground">Weather signal</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {weather.loading
                ? "Loading weather signal..."
                : weather.error || !profile?.county
                  ? "Add county or retry weather lookup."
                  : `${weather.locationName || weatherLookupLocation || profile.county}: ${temperature !== null ? `${temperature.toFixed(1)}C` : "--"}, ${weatherLabel(weather.weathercode).toLowerCase()}.`}
            </p>
          </div>
          <div className="rounded-lg border border-border/75 bg-white/86 p-4 dark:bg-background/74">
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-emerald-700" />
              <p className="font-semibold text-foreground">Supply evidence</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {activeListings.length} active listings from {products.length} saved product {products.length === 1 ? "record" : "records"}.
            </p>
          </div>
          <div className="rounded-lg border border-border/75 bg-white/86 p-4 dark:bg-background/74">
            <div className="flex items-center gap-3">
              <Banknote className="h-5 w-5 text-amber-700" />
              <p className="font-semibold text-foreground">Finance pathway</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Pair this risk file with micro-loan repayment history and verified sales before partner review.
            </p>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
