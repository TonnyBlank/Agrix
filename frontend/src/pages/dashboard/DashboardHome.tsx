import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  CloudSun,
  CreditCard,
  MapPin,
  MessageSquare,
  Package,
  ScanLine,
  ShoppingCart,
  Thermometer,
  TrendingUp,
  Wind,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";

import DashboardShell from "@/components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useOrders } from "@/hooks/useOrders";
import { useMyProducts } from "@/hooks/useProducts";
import { useWeather } from "@/hooks/useWeather";
import maizeImage from "@/assets/maize.jpg";
import onionsImage from "@/assets/onions.jpg";
import tomatoesImage from "@/assets/tomatoes.jpg";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
}

function weatherLabel(code: number | null | undefined) {
  if (typeof code !== "number") return "Unavailable";
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code <= 9) return "Foggy";
  if (code <= 19) return "Drizzle";
  if (code <= 29) return "Rain likely";
  if (code <= 39) return "Thunderstorm";
  if (code <= 59) return "Rain";
  if (code <= 79) return "Mixed precipitation";
  return "Storm conditions";
}

function Sparkline({ stroke, path }: { stroke: string; path: string }) {
  return (
    <svg viewBox="0 0 110 26" className="hidden h-7 w-24 shrink-0 sm:block">
      <path d={path} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export default function DashboardHome() {
  const { profile, role, user } = useAuth();
  const { sellingOrders, loading: ordersLoading } = useOrders();
  const { products, loading: productsLoading } = useMyProducts();
  const storedSubCounty = typeof window !== "undefined" ? window.localStorage.getItem("farm_sub_county")?.trim() || "" : "";
  const weatherLookupLocation = storedSubCounty && profile?.county ? `${storedSubCounty}, ${profile.county}` : profile?.county || null;
  const weather = useWeather(weatherLookupLocation);

  const displayName =
    profile?.full_name ||
    (typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null) ||
    "Farmer";
  const firstName = displayName.split(" ")[0];

  const planLabel =
    role === "buyer_enterprise"
      ? "BUYER ENTERPRISE"
      : role === "farmer_pro"
        ? "FARMER PRO"
        : "FARMER FREE";

  const metrics = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(now.getDate() - 7);

    const revenueStatuses = new Set(["confirmed", "processing", "shipped", "delivered"]);
    const pendingStatuses = new Set(["pending", "confirmed", "processing"]);

    const revenue = sellingOrders
      .filter((order) => revenueStatuses.has(order.status) && new Date(order.created_at) >= weekStart)
      .reduce((sum, order) => sum + order.total_price, 0);

    const pendingOrders = sellingOrders.filter((order) => pendingStatuses.has(order.status)).length;
    const activeListings = products.filter((product) => product.is_available).length;

    let recommendationCount = 0;
    if (profile?.county) recommendationCount += 1;
    if (profile?.main_crops?.length) recommendationCount += 1;
    if (products.length) recommendationCount += 1;
    if (pendingOrders > 0) recommendationCount += 1;

    return {
      revenue,
      activeListings,
      pendingOrders,
      recommendationCount,
    };
  }, [products, profile?.county, profile?.main_crops, sellingOrders]);

  const financeQuickAction =
    role === "farmer_free"
      ? {
          title: "Unlock Micro Loans",
          description: "Upgrade and complete readiness checks to start borrowing.",
          href: "/dashboard/upgrade",
          icon: CreditCard,
        }
      : {
          title: "Micro Loans",
          description: "Check readiness, active balances, and live loan offers.",
          href: "/dashboard/micro-loans",
          icon: CreditCard,
        };

  const quickActions =
    role === "buyer_enterprise"
      ? [
          {
            title: "Browse Marketplace",
            description: "Review farmers, supply locations, and active offers.",
            href: "/dashboard/marketplace",
            icon: ShoppingCart,
          },
          {
            title: "Track Orders",
            description: "Watch fulfillment and payment updates for current deals.",
            href: "/dashboard/orders",
            icon: TrendingUp,
          },
          {
            title: "Message Farmers",
            description: "Follow up on negotiations and contract conversations.",
            href: "/dashboard/messages",
            icon: MessageSquare,
          },
          {
            title: "Plan Procurement",
            description: "Use the calendar and timing tools before your next cycle.",
            href: "/dashboard/calendar",
            icon: CalendarDays,
          },
          financeQuickAction,
        ]
      : [
          {
            title: "Add New Listing",
            description: "Publish fresh produce and update pricing for buyers.",
            href: "/dashboard/products",
            icon: Package,
          },
          {
            title: "Scan Crop Health",
            description: "Run a field check and review AI crop diagnostics.",
            href: "/dashboard/ai-scanner",
            icon: ScanLine,
          },
          {
            title: "Plan This Week",
            description: "Review planting dates, weather windows, and reminders.",
            href: "/dashboard/calendar",
            icon: CalendarDays,
          },
          {
            title: "Reply to Buyers",
            description: "Keep orders moving with fast message follow-up.",
            href: "/dashboard/messages",
            icon: MessageSquare,
          },
          financeQuickAction,
        ];

  const marketWatch = [
    {
      title: "Tomatoes",
      status: "Hot Demand",
      description: "Urban buyers are paying 14% above last week.",
      image: tomatoesImage,
    },
    {
      title: "Maize",
      status: "Stable",
      description: "Hold inventory and watch western counties for movement.",
      image: maizeImage,
    },
    {
      title: "Onions",
      status: "Opportunity",
      description: "Regional supply is tightening ahead of next market day.",
      image: onionsImage,
    },
  ];

  const temperatureValue = typeof weather.temperature === "number" ? weather.temperature.toFixed(1) : "--";
  const humidityValue = typeof weather.humidity === "number" ? weather.humidity.toFixed(1) : "--";
  const resolvedWeatherLocation = weather.locationName || weatherLookupLocation;
  const conditionValue = weather.loading ? "Loading live weather..." : weatherLabel(weather.weathercode);
  const conditionsSummary = !profile?.county
    ? "Set your county to unlock local weather targeting for your farm."
    : weather.loading
      ? `Fetching live weather for ${resolvedWeatherLocation || profile.county}.`
      : weather.error || typeof weather.temperature !== "number"
        ? `Live weather is unavailable for ${resolvedWeatherLocation || profile.county} right now.`
        : `${resolvedWeatherLocation || profile.county} is ${temperatureValue}C with ${weatherLabel(weather.weathercode).toLowerCase()}.`;

  const summaryCards = [
    {
      title: "Revenue This Week",
      value: ordersLoading ? "Loading..." : formatCurrency(metrics.revenue),
      icon: TrendingUp,
      iconClass: "bg-white/65 text-emerald-700",
      cardClass:
        "border-emerald-300/70 bg-[linear-gradient(135deg,rgba(191,252,218,0.88),rgba(224,253,242,0.82))]",
      valueClass: "text-foreground",
      helper: "Updated from recent selling orders.",
    },
    {
      title: "Active Listings",
      value: productsLoading ? "Loading..." : String(metrics.activeListings),
      icon: Package,
      iconClass: "bg-emerald-50 text-emerald-700",
      cardClass: "border-border/70 bg-white/82",
      valueClass: "text-foreground",
      helper: "Produce currently visible to buyers.",
    },
    {
      title: "Pending Orders",
      value: ordersLoading ? "Loading..." : String(metrics.pendingOrders),
      icon: ShoppingCart,
      iconClass: "bg-emerald-50 text-emerald-700",
      cardClass: "border-border/70 bg-white/82",
      valueClass: "text-foreground",
      helper: "Deals waiting for the next action.",
    },
    {
      title: "AI Recommendations",
      value: String(metrics.recommendationCount),
      icon: Zap,
      iconClass: "bg-emerald-50 text-emerald-700",
      cardClass: "border-border/70 bg-white/82",
      valueClass: "text-foreground",
      helper: metrics.recommendationCount > 0 ? "Ready for review." : "Complete setup to unlock more.",
    },
  ];

  const farmSignals = [
    {
      title: "County",
      value: profile?.county || "Not set",
      icon: MapPin,
      iconClass: "bg-emerald-50 text-emerald-700",
      sparkStroke: "#22c55e",
      sparkPath: "M4 17 C24 12, 36 14, 52 13 S86 15, 106 14",
    },
    {
      title: "Temperature",
      value: `${temperatureValue}C`,
      icon: Thermometer,
      iconClass: "bg-rose-50 text-rose-500",
      sparkStroke: "#ef4444",
      sparkPath: "M4 15 C24 16, 34 14, 50 15 S84 17, 106 15",
    },
    {
      title: "Humidity",
      value: `${humidityValue}%`,
      icon: Wind,
      iconClass: "bg-slate-100 text-slate-500",
      sparkStroke: "#64748b",
      sparkPath: "M4 16 C24 16, 36 15, 54 16 S86 14, 106 15",
    },
  ];

  return (
    <DashboardShell title="Dashboard">
      <div className="space-y-4">
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.12fr)_22rem]">
          <div className="space-y-5">
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[1.55rem] border border-emerald-200/65 bg-[radial-gradient(circle_at_top_left,_rgba(184,244,215,0.45),_transparent_28%),linear-gradient(135deg,rgba(246,252,247,0.98),rgba(240,247,242,0.96))] p-4 shadow-[0_18px_44px_-30px_rgba(15,23,42,0.18)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-xl">
                  <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-700">
                    {planLabel}
                  </span>
                  <h2 className="mt-3 font-display text-[1.9rem] font-bold leading-tight text-foreground md:text-[2.15rem]">
                    Karibu, {firstName}
                  </h2>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                    Your farm operations, market signals, and buyer activity are all in one place so you can act faster every day.
                  </p>
                </div>

                <div className="rounded-full border border-emerald-200/80 bg-white/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  Live Farm View
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {summaryCards.map((card) => (
                  <div
                    key={card.title}
                    className={`flex min-h-[92px] flex-col rounded-[1.3rem] border p-3.5 shadow-[0_18px_38px_-34px_rgba(15,23,42,0.3)] ${card.cardClass}`}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-[0.9rem] ${card.iconClass}`}>
                      <card.icon className="h-4 w-4" />
                    </div>
                    <p className="mt-2 text-[12px] text-muted-foreground">{card.title}</p>
                    <div className="mt-1 flex items-end justify-between gap-3">
                      <p className={`font-display text-[1.35rem] font-bold ${card.valueClass}`}>{card.value}</p>
                      <span className="text-[11px] text-muted-foreground">{card.helper}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-[1.55rem] border border-border/70 bg-white/82 p-4 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.18)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Market Watch</p>
                  <h3 className="mt-2 font-display text-[1.5rem] font-bold leading-tight text-foreground">What needs attention now</h3>
                </div>
                <Button asChild variant="outline" className="h-10 rounded-full px-4 text-sm">
                  <Link to="/dashboard/marketplace">Open marketplace</Link>
                </Button>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {marketWatch.map((item) => (
                  <div
                    key={item.title}
                    className="flex h-full flex-col overflow-hidden rounded-[1.35rem] border border-border bg-white shadow-[0_16px_34px_-34px_rgba(15,23,42,0.45)]"
                  >
                    <div className="relative h-32 overflow-hidden">
                      <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
                      <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                        {item.status}
                      </span>
                      <h4 className="absolute bottom-3 left-3 right-3 font-display text-[1.55rem] font-bold text-white">
                        {item.title}
                      </h4>
                    </div>
                    <div className="flex flex-1 items-start p-3.5">
                      <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.section>
          </div>

          <div className="space-y-4">
            <motion.aside
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="self-start rounded-[1.55rem] border border-border/70 bg-white/82 p-4 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.18)]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Quick Actions</p>
              <h3 className="mt-2 font-display text-[1.35rem] font-bold leading-tight text-foreground">Move the day forward</h3>

              <div className="mt-4 space-y-2.5">
                {quickActions.map((action) => (
                  <Link
                    key={action.title}
                    to={action.href}
                    className="group flex min-h-[74px] items-start justify-between gap-3 rounded-[1.1rem] border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,250,248,0.9))] px-3.5 py-3 transition-colors hover:border-emerald-300/70 hover:bg-white"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.95rem] bg-emerald-50 text-emerald-700">
                        <action.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[0.93rem] font-semibold leading-5 text-foreground">{action.title}</p>
                        <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">{action.description}</p>
                      </div>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            </motion.aside>

            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-[1.55rem] border border-border/70 bg-white/82 p-4 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.18)]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Farm Snapshot</p>
              <h3 className="mt-2 font-display text-[1.35rem] font-bold leading-tight text-foreground">Weather and location</h3>

              <div className="mt-4 space-y-2.5">
                {farmSignals.map((signal) => (
                  <div
                    key={signal.title}
                    className="flex min-h-[74px] items-center justify-between gap-3 rounded-[1.1rem] border border-border/70 bg-white/84 px-3.5 py-3 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.18)]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-[0.95rem] ${signal.iconClass}`}>
                        <signal.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{signal.title}</p>
                        <p className="font-display text-[1.2rem] font-bold leading-tight text-foreground">{signal.value}</p>
                      </div>
                    </div>
                    <Sparkline stroke={signal.sparkStroke} path={signal.sparkPath} />
                  </div>
                ))}
              </div>

              <div className="mt-2.5 rounded-[1.1rem] border border-border/70 bg-white/84 px-3.5 py-3 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.18)]">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-[0.95rem] bg-emerald-50 text-emerald-700">
                    <CloudSun className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Conditions</p>
                    <p className="text-[15px] font-semibold text-foreground">{conditionValue}</p>
                  </div>
                </div>
                <p className="mt-2 text-[12px] leading-5 text-muted-foreground">{conditionsSummary}</p>
              </div>
            </motion.section>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
