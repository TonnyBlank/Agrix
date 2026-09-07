import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Beef,
  Bird,
  Brain,
  CalendarDays,
  ClipboardCheck,
  CloudSun,
  Egg,
  Fish,
  Leaf,
  LineChart,
  MapPin,
  Milk,
  Package,
  Radar,
  Route,
  ShieldCheck,
  ShoppingCart,
  Sprout,
  Store,
  Truck,
  Users,
  Warehouse,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";

import DashboardShell from "@/components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useOrders, type Order } from "@/hooks/useOrders";
import { useMarketplaceProducts, useMyProducts, type Product } from "@/hooks/useProducts";
import { useWeather } from "@/hooks/useWeather";
import { cn } from "@/lib/utils";

type ServiceKey = "enterprises" | "market" | "movement" | "finance" | "intelligence";

type ServiceTab = {
  key: ServiceKey;
  label: string;
  detail: string;
  icon: LucideIcon;
};

type CommodityGroup = {
  title: string;
  icon: LucideIcon;
  keywords: string[];
  examples: string[];
  intelligence: string;
  tone: string;
};

type FocusSignal = {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  status: string;
};

type FocusPanel = {
  eyebrow: string;
  title: string;
  summary: string;
  icon: LucideIcon;
  score: number;
  scoreLabel: string;
  signals: FocusSignal[];
  actions: Array<{ label: string; href: string; primary?: boolean }>;
};

const serviceTabs: ServiceTab[] = [
  {
    key: "enterprises",
    label: "Enterprises",
    detail: "Crops, poultry, eggs, livestock, dairy, fish",
    icon: Sprout,
  },
  {
    key: "market",
    label: "Marketplace",
    detail: "Direct buyers, wholesale, B2B, retail",
    icon: Store,
  },
  {
    key: "movement",
    label: "Movement",
    detail: "Transport, storage, cold-chain, tracking",
    icon: Truck,
  },
  {
    key: "finance",
    label: "Finance",
    detail: "Microloans, insurance, green credit",
    icon: Banknote,
  },
  {
    key: "intelligence",
    label: "AI Intelligence",
    detail: "GMCIS, climate, market, farmer brief",
    icon: Brain,
  },
];

const commodityGroups: CommodityGroup[] = [
  {
    title: "Crops & Horticulture",
    icon: Wheat,
    keywords: [
      "crop",
      "maize",
      "tomato",
      "onion",
      "avocado",
      "vegetable",
      "fruit",
      "beans",
      "potato",
      "coffee",
      "tea",
      "sugarcane",
      "banana",
      "horticulture",
    ],
    examples: ["Maize", "Vegetables", "Fruit", "Coffee"],
    intelligence: "Weather windows, field tasks, quality, demand, and harvest timing.",
    tone: "bg-emerald-500/10 text-emerald-700",
  },
  {
    title: "Poultry & Eggs",
    icon: Egg,
    keywords: ["egg", "eggs", "chicken", "poultry", "broiler", "broilers", "layer", "layers", "chick", "kienyeji"],
    examples: ["Eggs", "Broilers", "Layers", "Chicks"],
    intelligence: "Egg volumes, feed pressure, flock health, pickup rhythm, and retail demand.",
    tone: "bg-amber-500/12 text-amber-700",
  },
  {
    title: "Livestock & Dairy",
    icon: Beef,
    keywords: ["livestock", "cattle", "cow", "goat", "sheep", "dairy", "milk", "beef", "calf", "heifer"],
    examples: ["Milk", "Cattle", "Goats", "Sheep"],
    intelligence: "Herd records, milk collection, animal health, pasture, and buyer reliability.",
    tone: "bg-sky-500/10 text-sky-700",
  },
  {
    title: "Fish, Honey & Specialties",
    icon: Fish,
    keywords: ["fish", "tilapia", "aquaculture", "honey", "bee", "bees", "mushroom", "herbs", "spice", "spices"],
    examples: ["Fish", "Honey", "Mushrooms", "Herbs"],
    intelligence: "Shelf life, temperature, niche demand, quality proof, and route planning.",
    tone: "bg-cyan-500/10 text-cyan-700",
  },
  {
    title: "Inputs & Farm Services",
    icon: Package,
    keywords: ["seed", "seedling", "fertilizer", "feed", "input", "tractor", "equipment", "service", "storage", "transport"],
    examples: ["Feed", "Seedlings", "Fertilizer", "Transport"],
    intelligence: "Input availability, service coverage, repayment support, and supplier matching.",
    tone: "bg-violet-500/10 text-violet-700",
  },
];

const activeOrderStatuses = new Set(["pending", "confirmed", "processing", "shipped"]);
const revenueOrderStatuses = new Set(["confirmed", "processing", "shipped", "delivered"]);

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCoordinate(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "Not mapped";
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(5) : "Not mapped";
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

function isWeatherRisk(code: number | null | undefined) {
  return typeof code === "number" && (code >= 51 || code === 45 || code === 48);
}

function orderTitle(order: Order) {
  return order.product?.name || "Agricultural order";
}

function plural(count: number, singular: string, pluralWord = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

function productText(product: Product) {
  return `${product.name} ${product.category} ${product.description ?? ""} ${product.unit ?? ""}`.toLowerCase();
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--gold-500)))]"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-border/75 bg-white/88 p-4 shadow-[0_18px_38px_-34px_rgba(15,23,42,0.32)] dark:bg-background/78">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      </div>
      <p className="mt-5 font-display text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-2 min-h-10 text-xs leading-5 text-muted-foreground">{note}</p>
    </div>
  );
}

function SignalTile({ signal }: { signal: FocusSignal }) {
  const Icon = signal.icon;

  return (
    <div className="min-h-[132px] rounded-2xl border border-border/75 bg-white/84 p-4 transition-colors hover:border-primary/35 dark:bg-background/70">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <span className="rounded-full bg-accent/14 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
          {signal.status}
        </span>
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{signal.label}</p>
      <h3 className="mt-1 font-display text-lg font-semibold leading-7 text-foreground">{signal.value}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{signal.detail}</p>
    </div>
  );
}

function AiBriefCard({
  icon: Icon,
  title,
  detail,
  reason,
  status,
  tone,
  href,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  reason: string;
  status: string;
  tone: string;
  href?: string;
}) {
  const content = (
    <div className="flex h-full flex-col rounded-2xl border border-border/75 bg-white/86 p-4 transition-colors hover:border-primary/35 dark:bg-background/72">
      <div className="flex items-start justify-between gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone)}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {status}
        </span>
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold leading-7 text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
      <p className="mt-4 border-t border-border/70 pt-3 text-xs leading-5 text-muted-foreground">
        <span className="font-semibold text-foreground">Why:</span> {reason}
      </p>
    </div>
  );

  return href ? <Link to={href}>{content}</Link> : content;
}

function ServiceHub() {
  const { profile, role } = useAuth();
  const [activeService, setActiveService] = useState<ServiceKey>("enterprises");
  const { products, loading: productsLoading } = useMyProducts();
  const { products: marketplaceProducts, loading: marketplaceLoading } = useMarketplaceProducts();
  const { sellingOrders, buyingOrders, loading: ordersLoading } = useOrders();

  const storedSubCounty =
    typeof window !== "undefined" ? window.localStorage.getItem("farm_sub_county")?.trim() || "" : "";
  const weatherLookupLocation =
    storedSubCounty && profile?.county ? `${storedSubCounty}, ${profile.county}` : profile?.county || null;
  const weather = useWeather(weatherLookupLocation);

  const isCompanyRole = role === "company";
  const isFarmerFree = role === "farmer_free";
  const activeListings = products.filter((product) => product.is_available);
  const allOrders = [...sellingOrders, ...buyingOrders];
  const activeOrders = allOrders.filter((order) => activeOrderStatuses.has(order.status));
  const logisticsOrders = allOrders.filter((order) => ["confirmed", "processing", "shipped"].includes(order.status));
  const tradeRevenue = sellingOrders
    .filter((order) => revenueOrderStatuses.has(order.status))
    .reduce((sum, order) => sum + order.total_price, 0);

  const profileSignals = useMemo(
    () =>
      isCompanyRole
        ? [
            { label: "County", complete: Boolean(profile?.county), value: profile?.county || "Missing" },
            { label: "Contact", complete: Boolean(profile?.full_name), value: profile?.full_name || "Missing" },
            { label: "Marketplace", complete: true, value: "Available" },
            { label: "Procurement", complete: true, value: "Available" },
            {
              label: "Storage",
              complete: Boolean(profile?.has_storage),
              value: profile?.has_storage ? "Available" : "Not added",
            },
            {
              label: "Transport",
              complete: Boolean(profile?.has_transport),
              value: profile?.has_transport ? "Available" : "Not added",
            },
          ]
        : [
            { label: "County", complete: Boolean(profile?.county), value: profile?.county || "Missing" },
            {
              label: "Enterprises",
              complete: Boolean(profile?.main_crops?.length),
              value: profile?.main_crops?.length ? profile.main_crops.slice(0, 4).join(", ") : "Missing",
            },
            { label: "Farm size", complete: Boolean(profile?.farm_size), value: profile?.farm_size || "Missing" },
            { label: "Farm type", complete: Boolean(profile?.farm_type), value: profile?.farm_type || "Missing" },
            {
              label: "Storage",
              complete: Boolean(profile?.has_storage),
              value: profile?.has_storage ? "Available" : "Not added",
            },
            {
              label: "Transport",
              complete: Boolean(profile?.has_transport),
              value: profile?.has_transport ? "Available" : "Not added",
            },
            {
              label: "GMCIS map",
              complete: profile?.farm_gps_lat !== null && profile?.farm_gps_lat !== undefined && profile?.farm_gps_lng !== null && profile?.farm_gps_lng !== undefined,
              value: profile?.farm_gps_lat && profile?.farm_gps_lng ? "Mapped" : "Not mapped",
            },
          ],
    [isCompanyRole, profile],
  );

  const readinessPercent = Math.round(
    (profileSignals.filter((signal) => signal.complete).length / profileSignals.length) * 100,
  );

  const enterpriseText = [
    ...(profile?.main_crops ?? []),
    ...activeListings.map((product) => productText(product)),
    ...allOrders.map((order) => order.product?.name ?? ""),
  ]
    .join(" ")
    .toLowerCase();

  const commodityCoverage = commodityGroups.map((group) => ({
    ...group,
    active: includesAny(enterpriseText, group.keywords),
  }));
  const activeCommodityGroups = commodityCoverage.filter((group) => group.active);
  const activeCommodityCount = activeCommodityGroups.length;
  const coveredCommodityLabel = activeCommodityGroups.length
    ? activeCommodityGroups.map((group) => group.title.replace(" & ", " + ")).join(", ")
    : "Add listings or profile details";

  const hasPoultryOrEggs = includesAny(enterpriseText, commodityGroups[1].keywords);
  const hasLivestockOrDairy = includesAny(enterpriseText, commodityGroups[2].keywords);
  const hasFishOrHoney = includesAny(enterpriseText, commodityGroups[3].keywords);
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
  ]);

  const productCategories = new Set(activeListings.map((product) => product.category).filter(Boolean));
  const topMarketplaceProducts = marketplaceProducts.slice(0, 4);
  const resolvedWeatherLocation = weather.locationName || weatherLookupLocation || profile?.county || "Farm location";
  const hasWeatherLocation = Boolean(weatherLookupLocation);
  const hasMappedLocation =
    profile?.farm_gps_lat !== null &&
    profile?.farm_gps_lat !== undefined &&
    profile?.farm_gps_lng !== null &&
    profile?.farm_gps_lng !== undefined;
  const currentCondition = !hasWeatherLocation
    ? "Location needed"
    : weather.loading
      ? "Loading weather"
      : weather.error || weatherLabel(weather.weathercode);
  const temperature = typeof weather.temperature === "number" ? `${weather.temperature.toFixed(1)}C` : "--";
  const climateRisk = isWeatherRisk(weather.weathercode);
  const heatRisk = typeof weather.temperature === "number" && weather.temperature >= 30;

  const marketAction = activeListings.length
    ? `Keep prices fresh on ${plural(activeListings.length, "live listing")} and push strongest supply to buyers.`
    : "Add crops, eggs, milk, livestock, fish, inputs, or services so buyers can discover real supply.";
  const productionAction = !hasWeatherLocation
    ? "Add county or farm location so AI can include weather in production advice."
    : hasPoultryOrEggs
      ? "Check shade, water, feed stock, crate hygiene, and egg pickup timing before the next hot or wet window."
      : hasLivestockOrDairy
        ? "Review water, pasture, milk handling, animal health notes, and buyer collection windows."
        : hasFishOrHoney
          ? "Protect temperature-sensitive stock and align harvest or collection with fast delivery routes."
          : "Use weather and market timing to plan field work, harvest quality, and listing updates.";
  const movementAction = logisticsOrders.length
    ? `Coordinate pickup proof and tracking for ${plural(logisticsOrders.length, "order")}.`
    : hasPerishables
      ? "Prepare storage, crates, transport timing, or cold-chain support before opening bigger buyer channels."
      : "Add transport and storage signals so buyers understand delivery reliability.";
  const financeAction =
    readinessPercent >= 70 && (tradeRevenue > 0 || activeOrders.length > 0)
      ? "Profile, trade, and operations signals are strong enough to support financing conversations."
      : "Complete mapping, storage, transport, and trade records to strengthen microloan and insurance readiness.";

  const aiBriefItems = [
    {
      icon: Brain,
      title: "AI Market Call",
      detail: marketAction,
      reason: "Uses your active listings, order pipeline, product categories, and buyer access routes.",
      status: activeListings.length ? "Act now" : "Needs supply",
      tone: "bg-violet-500/10 text-violet-700",
      href: "/dashboard/products",
    },
    {
      icon: hasPoultryOrEggs ? Bird : hasLivestockOrDairy ? Milk : CloudSun,
      title: "AI Production Watch",
      detail:
        climateRisk || heatRisk
          ? `${productionAction} Current signal: ${temperature}, ${currentCondition.toLowerCase()}.`
          : productionAction,
      reason: "Combines enterprise type, weather lookup, location readiness, and storage context.",
      status: !hasWeatherLocation ? "Map farm" : climateRisk || heatRisk ? "Watch" : "Stable",
      tone: "bg-emerald-500/10 text-emerald-700",
      href: "/dashboard/farm",
    },
    {
      icon: Route,
      title: "AI Movement Plan",
      detail: movementAction,
      reason: "Checks confirmed, processing, shipped orders plus transport and storage profile signals.",
      status: logisticsOrders.length ? "Moving" : "Prepare",
      tone: "bg-sky-500/10 text-sky-700",
      href: "/dashboard/orders",
    },
    {
      icon: ShieldCheck,
      title: "AI Finance Signal",
      detail: financeAction,
      reason: "Reads profile completeness, sales volume, active trade, mapped farm data, and risk controls.",
      status: readinessPercent >= 70 ? "Promising" : "Build data",
      tone: "bg-amber-500/12 text-amber-700",
      href: isFarmerFree ? "/dashboard/upgrade" : isCompanyRole ? "/dashboard/risk-credit" : "/dashboard/micro-loans",
    },
  ];

  const metrics = [
    {
      icon: Radar,
      label: "Enterprise Coverage",
      value: `${activeCommodityCount}/${commodityGroups.length}`,
      note: activeCommodityCount ? coveredCommodityLabel : "Profile not trained yet",
    },
    {
      icon: Package,
      label: "Live Supply",
      value: productsLoading ? "Loading" : String(activeListings.length),
      note: `${productCategories.size} listed categories from your account`,
    },
    {
      icon: ShoppingCart,
      label: "Trade Pipeline",
      value: ordersLoading ? "Loading" : String(activeOrders.length),
      note: `${formatCurrency(tradeRevenue)} selling volume tracked`,
    },
    {
      icon: Truck,
      label: "Movement Queue",
      value: ordersLoading ? "Loading" : String(logisticsOrders.length),
      note: "Confirmed, processing, and shipped orders",
    },
    {
      icon: CloudSun,
      label: "Climate Signal",
      value: temperature,
      note: currentCondition,
    },
  ];

  const focusPanels: Record<ServiceKey, FocusPanel> = {
    enterprises: {
      eyebrow: "Farm and enterprise support",
      title: "Manage every agricultural enterprise from one profile",
      summary:
        "The hub treats a farm as a mixed operation: crops, poultry, eggs, livestock, dairy, fish, honey, inputs, and services can all feed the same market, logistics, finance, and intelligence layer.",
      icon: Sprout,
      score: Math.max(readinessPercent, activeCommodityCount * 18),
      scoreLabel: "Enterprise readiness",
      signals: [
        {
          icon: Wheat,
          label: "Coverage",
          value: activeCommodityCount ? `${activeCommodityCount} enterprise groups detected` : "No enterprise data yet",
          detail: activeCommodityCount
            ? coveredCommodityLabel
            : "Add products or update the farm profile so advisory and matching become specific.",
          status: activeCommodityCount ? "Detected" : "Setup",
        },
        {
          icon: CalendarDays,
          label: "Advisory",
          value: hasPoultryOrEggs ? "Flock and egg notes included" : "Calendar and scanner ready",
          detail: hasPoultryOrEggs
            ? "AI advice now makes room for egg handling, feed pressure, shade, and pickup timing."
            : "Field tasks, weather windows, and crop health tools stay connected to your profile.",
          status: "Live",
        },
        {
          icon: ClipboardCheck,
          label: "Operating Data",
          value: `${readinessPercent}% profile strength`,
          detail: "County, enterprise mix, storage, transport, farm size, and mapping make the rest of the system smarter.",
          status: readinessPercent >= 70 ? "Strong" : "Improve",
        },
      ],
      actions: [
        { label: "Add supply", href: "/dashboard/products", primary: true },
        { label: "Update profile", href: "/dashboard/farm" },
        { label: "Open calendar", href: "/dashboard/calendar" },
      ],
    },
    market: {
      eyebrow: "Marketplace and trade",
      title: "Match supply to retailers, wholesalers, exporters, companies, and homes",
      summary:
        "Trade is organized around buyer intent instead of one product type. A farmer can sell eggs, vegetables, milk, fish, livestock, inputs, or harvests through the same discovery and order flow.",
      icon: Store,
      score: Math.min(100, activeListings.length * 14 + activeOrders.length * 18 + readinessPercent * 0.35),
      scoreLabel: "Market readiness",
      signals: [
        {
          icon: Store,
          label: "Direct buyer access",
          value: marketplaceLoading ? "Loading market" : `${marketplaceProducts.length} marketplace items visible`,
          detail: "Retail, residential, wholesale, B2B, and exporter paths use the same trusted marketplace base.",
          status: marketplaceProducts.length ? "Open" : "Waiting",
        },
        {
          icon: Users,
          label: "Buyer follow-up",
          value: `${activeOrders.length} active trade ${activeOrders.length === 1 ? "thread" : "threads"}`,
          detail: "Orders and messages become the real relationship history behind repeat sales.",
          status: activeOrders.length ? "Trading" : "Ready",
        },
        {
          icon: LineChart,
          label: "Fair price signal",
          value: tradeRevenue ? formatCurrency(tradeRevenue) : "Build sales record",
          detail: "Verified orders, stock, unit price, and buyer demand improve price confidence over time.",
          status: tradeRevenue ? "Tracked" : "Start",
        },
      ],
      actions: [
        { label: "Open marketplace", href: "/dashboard/marketplace", primary: true },
        { label: "Find buyers", href: "/dashboard/discover" },
        { label: "Review orders", href: "/dashboard/orders" },
      ],
    },
    movement: {
      eyebrow: "Logistics and supply chain",
      title: "Plan movement before quality is lost",
      summary:
        "Perishable goods need timing. The hub joins transport, cold-chain, storage, pickup points, and order tracking so buyers and suppliers know what is actually movable.",
      icon: Truck,
      score: Math.min(100, (profile?.has_transport ? 28 : 0) + (profile?.has_storage ? 28 : 0) + logisticsOrders.length * 18 + readinessPercent * 0.25),
      scoreLabel: "Movement readiness",
      signals: [
        {
          icon: Truck,
          label: "Transport",
          value: profile?.has_transport ? "Transport added" : "Transport not added",
          detail: profile?.has_transport
            ? "Transport capacity is visible as a delivery confidence signal."
            : "Add transport details to help buyers understand dispatch reliability.",
          status: profile?.has_transport ? "Ready" : "Add",
        },
        {
          icon: Warehouse,
          label: "Storage",
          value: profile?.has_storage ? "Storage added" : "Storage not added",
          detail: hasPerishables
            ? "Storage and cold-chain notes matter for eggs, milk, fish, meat, vegetables, and fruit."
            : "Storage details still help buyers judge handling quality.",
          status: profile?.has_storage ? "Ready" : "Add",
        },
        {
          icon: Route,
          label: "Tracking",
          value: `${logisticsOrders.length} order ${logisticsOrders.length === 1 ? "needs" : "need"} movement tracking`,
          detail: logisticsOrders.length
            ? "Confirmed, processing, and shipped orders should carry pickup and proof updates."
            : "Movement tracking activates when an order reaches confirmed or shipped status.",
          status: logisticsOrders.length ? "Active" : "Idle",
        },
      ],
      actions: [
        { label: "Open orders", href: "/dashboard/orders", primary: true },
        { label: "Update profile", href: "/dashboard/farm" },
      ],
    },
    finance: {
      eyebrow: "Financial services",
      title: "Turn verified activity into finance and risk signals",
      summary:
        "Microloans, insurance, and green credit make more sense when they read the same evidence: profile strength, mapped operations, trade records, storage, delivery proof, and repayment history.",
      icon: Banknote,
      score: Math.min(100, readinessPercent * 0.65 + activeOrders.length * 10 + (tradeRevenue > 0 ? 20 : 0)),
      scoreLabel: "Finance readiness",
      signals: [
        {
          icon: Banknote,
          label: "Microloans",
          value: isFarmerFree ? "Upgrade path available" : "Financing portal available",
          detail: isFarmerFree
            ? "Verified activity can support stronger access after moving to Farmer Pro."
            : "Loan offers can use profile, trade, repayment, and operational signals.",
          status: isFarmerFree ? "Upgrade" : "Open",
        },
        {
          icon: ShieldCheck,
          label: "Insurance",
          value: readinessPercent >= 60 ? "Risk data forming" : "Needs stronger profile",
          detail: "Climate, enterprise type, location, storage, and trade history create a clearer cover picture.",
          status: readinessPercent >= 60 ? "Eligible data" : "Build",
        },
        {
          icon: Leaf,
          label: "Green credit",
          value: hasMappedLocation ? "Mapped operation" : "Map farm first",
          detail: "GMCIS mapping and climate-smart records support green credit conversations over time.",
          status: hasMappedLocation ? "Mapped" : "Setup",
        },
      ],
      actions: [
        { label: isFarmerFree ? "Upgrade plan" : "Risk & credit", href: isFarmerFree ? "/dashboard/upgrade" : "/dashboard/risk-credit", primary: true },
        { label: isCompanyRole ? "Company profile" : isFarmerFree ? "Risk & credit" : "Open loans", href: isCompanyRole ? "/dashboard/company/settings" : isFarmerFree ? "/dashboard/risk-credit" : "/dashboard/micro-loans" },
        { label: "Map operation", href: isCompanyRole ? "/dashboard/company/settings" : "/dashboard/farm" },
      ],
    },
    intelligence: {
      eyebrow: "Agricultural intelligence",
      title: "AI informs the farmer before the next decision",
      summary:
        "GMCIS and the AI brief connect farm mapping, climate, commodity type, marketplace activity, logistics status, and finance readiness into practical next actions.",
      icon: Brain,
      score: Math.min(100, (hasWeatherLocation ? 22 : 0) + (hasMappedLocation ? 22 : 0) + activeCommodityCount * 12 + activeOrders.length * 8 + readinessPercent * 0.25),
      scoreLabel: "Intelligence readiness",
      signals: [
        {
          icon: MapPin,
          label: "GMCIS",
          value: hasMappedLocation ? "Coordinates captured" : "Coordinates missing",
          detail: hasMappedLocation
            ? `${formatCoordinate(profile?.farm_gps_lat)}, ${formatCoordinate(profile?.farm_gps_lng)}`
            : "Add GPS coordinates so geospatial and climate intelligence can become more precise.",
          status: hasMappedLocation ? "Mapped" : "Map",
        },
        {
          icon: CloudSun,
          label: "Climate",
          value: `${temperature} - ${currentCondition}`,
          detail: hasWeatherLocation
            ? `Weather lookup is attached to ${resolvedWeatherLocation}.`
            : "Set county or sub-county to activate live weather decisions.",
          status: hasWeatherLocation && !weather.error ? "Live" : "Setup",
        },
        {
          icon: Brain,
          label: "AI brief",
          value: `${aiBriefItems.length} advisory signals ready`,
          detail: "The brief translates platform data into farmer actions for market, production, movement, and finance.",
          status: "Ready",
        },
      ],
      actions: [
        { label: "Run AI scanner", href: "/dashboard/ai-scanner", primary: true },
        { label: "Open analytics", href: "/dashboard/analytics" },
        { label: "Map farm", href: "/dashboard/farm" },
      ],
    },
  };

  const activePanel = focusPanels[activeService];
  const ActivePanelIcon = activePanel.icon;

  return (
    <DashboardShell title="Services Hub">
      <div className="space-y-5">
        <section className="rounded-[1.3rem] border border-border/70 bg-white/90 p-4 shadow-[0_16px_28px_-24px_rgba(15,23,42,0.18)] dark:bg-card/90">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Agricultural Operating Center</p>
              <p className="text-sm text-muted-foreground">
                Track service readiness across enterprise data, market supply, climate, logistics, finance, and AI signals.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <Button asChild variant="outline" className="h-9 rounded-xl">
                <Link to={isCompanyRole ? "/dashboard/company/products" : "/dashboard/products"}>
                  Update Supply
                  <Package className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-9 rounded-xl">
                <Link to="/dashboard/orders">
                  Review Orders
                  <ClipboardCheck className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild className="h-9 rounded-xl">
                <Link to="/dashboard/risk-credit">
                  Risk & Credit
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_18rem] md:items-center">
            <p className="text-xs leading-5 text-muted-foreground">
              AI brief: {aiBriefItems[0].detail}
            </p>
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">Service readiness</span>
                <span className="text-muted-foreground">{readinessPercent}%</span>
              </div>
              <div className="mt-2">
                <ProgressBar value={readinessPercent} />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </section>

        <section className="rounded-xl border border-border/75 bg-white/86 p-5 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.18)] dark:bg-background/74">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                Agricultural AI advisor
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold leading-tight text-foreground">
                Today's priority signals
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                AI advisory combines profile, enterprise mix, weather, marketplace, logistics, and finance signals
                into the next actions a farmer or agribusiness should review first.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link to="/dashboard/ai-scanner">AI tools</Link>
            </Button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {aiBriefItems.map((item) => (
              <AiBriefCard key={item.title} {...item} />
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">Operating modules</p>
            <h2 className="mt-2 font-display text-2xl font-bold leading-tight text-foreground">
              Services arranged by the work that needs to happen
            </h2>
          </div>

          <div className="grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="space-y-3">
            {serviceTabs.map((service) => {
              const Icon = service.icon;
              const isActive = activeService === service.key;

              return (
                <button
                  key={service.key}
                  type="button"
                  onClick={() => setActiveService(service.key)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all",
                    isActive
                      ? "border-primary/45 bg-primary text-primary-foreground shadow-[0_18px_42px_-32px_rgba(21,128,61,0.58)]"
                      : "border-border/75 bg-white/84 text-foreground hover:border-primary/35 dark:bg-background/70",
                  )}
                >
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", isActive ? "bg-white/16" : "bg-primary/10 text-primary")}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block font-display text-sm font-semibold leading-5">{service.label}</span>
                    <span className={cn("mt-1 block text-xs leading-5", isActive ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {service.detail}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <motion.div
            key={activeService}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-border/75 bg-white/86 p-5 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.18)] dark:bg-background/74"
          >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_15rem]">
              <div>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ActivePanelIcon className="h-6 w-6" />
                  </span>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                    {activePanel.eyebrow}
                  </p>
                </div>
                <h2 className="mt-4 max-w-3xl font-display text-2xl font-bold leading-tight text-foreground md:text-3xl">
                  {activePanel.title}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{activePanel.summary}</p>
              </div>

              <div className="rounded-xl border border-emerald-200/75 bg-emerald-50/60 p-4 dark:border-emerald-500/25 dark:bg-emerald-500/10">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-200">
                  {activePanel.scoreLabel}
                </p>
                <p className="mt-2 font-display text-3xl font-bold text-foreground">{Math.round(activePanel.score)}%</p>
                <div className="mt-4">
                  <ProgressBar value={activePanel.score} />
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {activePanel.signals.map((signal) => (
                <SignalTile key={`${activeService}-${signal.label}`} signal={signal} />
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {activePanel.actions.map((action) => (
                <Button key={action.label} asChild variant={action.primary ? "default" : "outline"}>
                  <Link to={action.href}>{action.label}</Link>
                </Button>
              ))}
            </div>
          </motion.div>
          </div>
        </section>

        <section className="rounded-xl border border-border/75 bg-white/86 p-5 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.18)] dark:bg-background/74">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">Commodity coverage</p>
              <h2 className="mt-2 font-display text-2xl font-bold leading-tight text-foreground">
                Built for mixed agriculture, not only crops
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                Each enterprise can share the same operating rails: advisory, buyer matching, stock visibility,
                logistics planning, payment history, financing signals, and climate intelligence.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link to="/dashboard/products">Manage listings</Link>
            </Button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {commodityCoverage.map((group) => {
              const Icon = group.icon;

              return (
                <div
                  key={group.title}
                  className={cn(
                    "flex min-h-[220px] flex-col rounded-xl border p-4 transition-colors",
                    group.active
                      ? "border-primary/35 bg-primary/5"
                      : "border-border/75 bg-muted/30 hover:border-primary/30",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", group.tone)}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                        group.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {group.active ? "In your data" : "Platform-ready"}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold leading-7 text-foreground">{group.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{group.intelligence}</p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    {group.examples.map((example) => (
                      <span key={example} className="rounded-full border border-border/70 bg-white/70 px-2.5 py-1 text-xs text-muted-foreground dark:bg-background/70">
                        {example}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">Operations detail</p>
            <h2 className="mt-2 font-display text-2xl font-bold leading-tight text-foreground">
              Market, mapping, and movement in one view
            </h2>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)_24rem]">
          <div className="rounded-xl border border-border/75 bg-white/86 p-5 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.18)] dark:bg-background/74">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">GMCIS snapshot</p>
                <h2 className="mt-2 font-display text-2xl font-bold leading-tight text-foreground">
                  Location, climate, and operating truth
                </h2>
              </div>
              <MapPin className="h-9 w-9 text-primary" />
            </div>

            <div className="mt-5 grid gap-3">
              {[
                { label: "Location", value: resolvedWeatherLocation },
                { label: "Latitude", value: formatCoordinate(profile?.farm_gps_lat) },
                { label: "Longitude", value: formatCoordinate(profile?.farm_gps_lng) },
                { label: "Climate", value: `${temperature} - ${currentCondition}` },
                { label: "Active enterprises", value: activeCommodityCount ? activeCommodityGroups.map((group) => group.title).join(", ") : "Not enough data yet" },
              ].map((item) => (
                <div key={item.label} className="flex items-start justify-between gap-4 border-b border-border/70 pb-3 last:border-0 last:pb-0">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span className="max-w-[60%] text-right text-sm font-semibold leading-6 text-foreground">{item.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-amber-200/80 bg-amber-50/65 p-4 dark:border-amber-500/25 dark:bg-amber-500/10">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
                <p className="text-sm leading-6 text-amber-900 dark:text-amber-100">
                  Intelligence improves when farmers add exact location, enterprise mix, storage, transport, product
                  volumes, and delivery proof. The AI brief is only as sharp as the operating data behind it.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/75 bg-white/86 p-5 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.18)] dark:bg-background/74">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">Live market supply</p>
                <h2 className="mt-2 font-display text-2xl font-bold leading-tight text-foreground">
                  What buyers can see now
                </h2>
              </div>
              <Button asChild variant="outline">
                <Link to="/dashboard/marketplace">Open marketplace</Link>
              </Button>
            </div>

            <div className="mt-5 divide-y divide-border/70">
              {marketplaceLoading ? (
                <p className="py-4 text-sm text-muted-foreground">Loading marketplace supply...</p>
              ) : topMarketplaceProducts.length ? (
                topMarketplaceProducts.map((product) => (
                  <div key={product.id} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{product.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {product.profiles?.county || product.location || "Kenya"} - {product.stock} {product.unit}
                      </p>
                    </div>
                    <p className="text-right text-sm font-semibold text-primary">
                      {formatCurrency(product.price_per_unit)}/{product.unit}
                    </p>
                  </div>
                ))
              ) : (
                <p className="py-4 text-sm text-muted-foreground">No marketplace products are visible yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border/75 bg-white/86 p-5 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.18)] dark:bg-background/74">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">Next logistics checks</p>
            <h2 className="mt-2 font-display text-2xl font-bold leading-tight text-foreground">Movement queue</h2>
            <div className="mt-5 divide-y divide-border/70">
              {ordersLoading ? (
                <p className="py-4 text-sm text-muted-foreground">Loading logistics queue...</p>
              ) : logisticsOrders.length ? (
                logisticsOrders.slice(0, 4).map((order) => (
                  <div key={order.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{orderTitle(order)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {order.quantity} {order.unit} - {order.pickup_county || order.farmer_profile?.county || "Pickup pending"}
                        </p>
                      </div>
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-4 text-sm leading-6 text-muted-foreground">
                  Confirmed, processing, and shipped orders will appear here for transport and storage follow-up.
                </p>
              )}
            </div>
          </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

export default ServiceHub;
