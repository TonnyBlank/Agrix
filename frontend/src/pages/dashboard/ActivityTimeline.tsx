import { useEffect, useMemo, useState } from "react";
import { BellRing, Building2, ClipboardList, CreditCard, Package, Search, ShieldCheck, ShoppingCart, Trash2, Users } from "lucide-react";

import DashboardShell from "@/components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useOrders } from "@/hooks/useOrders";
import { useMyProducts } from "@/hooks/useProducts";
import { apiFetch } from "@/lib/api";

type TimelineEvent = {
  id: string;
  title: string;
  detail: string;
  at: string;
  lane: "orders" | "catalog" | "network" | "admin" | "finance";
  icon: typeof BellRing;
};

type CompanyOrder = {
  id: string;
  status: string;
  total_amount: number;
  created_at: string;
  updated_at?: string;
};

type CompanyProduct = {
  id: string;
  name: string;
  stock: number;
  created_at: string;
  updated_at?: string;
};

type CompanyPartner = {
  id: string;
  status: string;
  created_at: string;
  farmer_profile?: { full_name?: string | null; county?: string | null } | null;
};

type CompanyRequest = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  needed_by?: string | null;
};

type AdminCompany = {
  id: string;
  company_name: string;
  verification_status: string;
  created_at: string;
};

type AdminUser = {
  user_id: string;
  full_name: string | null;
  role: string;
  created_at: string;
};

function formatRelative(dateLike: string) {
  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown time";
  }

  const diffMs = Date.now() - parsed.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return parsed.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

function laneTone(lane: TimelineEvent["lane"]) {
  switch (lane) {
    case "orders":
      return "bg-blue-500/10 text-blue-700";
    case "catalog":
      return "bg-emerald-500/10 text-emerald-700";
    case "network":
      return "bg-violet-500/10 text-violet-700";
    case "finance":
      return "bg-amber-500/10 text-amber-700";
    default:
      return "bg-slate-500/10 text-slate-700";
  }
}

export default function ActivityTimeline() {
  const { role } = useAuth();
  const { sellingOrders, buyingOrders, loading: ordersLoading } = useOrders();
  const { products, loading: productsLoading } = useMyProducts();
  const [query, setQuery] = useState("");
  const [companyState, setCompanyState] = useState<{
    products: CompanyProduct[];
    partners: CompanyPartner[];
    requests: CompanyRequest[];
    orders: CompanyOrder[];
  }>({
    products: [],
    partners: [],
    requests: [],
    orders: [],
  });
  const [adminState, setAdminState] = useState<{
    companies: AdminCompany[];
    users: AdminUser[];
  }>({
    companies: [],
    users: [],
  });
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [hiddenEventIds, setHiddenEventIds] = useState<Set<string>>(new Set());
  const [removingEventId, setRemovingEventId] = useState<string | null>(null);
  const [moderationError, setModerationError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    apiFetch<{ event_keys?: string[] }>("/activity/hidden-events")
      .then((response) => {
        if (active) {
          setHiddenEventIds(new Set(response.event_keys ?? []));
        }
      })
      .catch(() => {
        if (active) {
          setHiddenEventIds(new Set());
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!role || (role !== "company" && role !== "admin")) {
        return;
      }

      setLoadingExtra(true);
      try {
        if (role === "company") {
          const [products, partners, requests, orders] = await Promise.allSettled([
            apiFetch<{ products: CompanyProduct[] }>("/companies/me/products"),
            apiFetch<{ partners: CompanyPartner[] }>("/companies/me/partners"),
            apiFetch<{ requests: CompanyRequest[] }>("/companies/me/procurement"),
            apiFetch<{ orders: CompanyOrder[] }>("/companies/me/orders"),
          ]);

          if (!active) return;

          setCompanyState({
            products: products.status === "fulfilled" ? products.value.products ?? [] : [],
            partners: partners.status === "fulfilled" ? partners.value.partners ?? [] : [],
            requests: requests.status === "fulfilled" ? requests.value.requests ?? [] : [],
            orders: orders.status === "fulfilled" ? orders.value.orders ?? [] : [],
          });
        }

        if (role === "admin") {
          const [companies, users] = await Promise.allSettled([
            apiFetch<{ companies: AdminCompany[] }>("/admin/companies?status=all"),
            apiFetch<AdminUser[]>("/admin/users"),
          ]);

          if (!active) return;

          setAdminState({
            companies: companies.status === "fulfilled" ? companies.value.companies ?? [] : [],
            users: users.status === "fulfilled" ? users.value ?? [] : [],
          });
        }
      } finally {
        if (active) {
          setLoadingExtra(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [role]);

  const events = useMemo<TimelineEvent[]>(() => {
    if (role === "company") {
      return [
        ...companyState.orders.map((order) => ({
          id: `company-order-${order.id}`,
          title: `Company order ${order.status}`,
          detail: `${formatCurrency(order.total_amount)} order is in the ${order.status} stage.`,
          at: order.updated_at || order.created_at,
          lane: "orders" as const,
          icon: ShoppingCart,
        })),
        ...companyState.products.map((product) => ({
          id: `company-product-${product.id}`,
          title: `Catalog update: ${product.name}`,
          detail: `${product.stock} units are recorded in stock for this company product.`,
          at: product.updated_at || product.created_at,
          lane: "catalog" as const,
          icon: Package,
        })),
        ...companyState.partners.map((partner) => ({
          id: `company-partner-${partner.id}`,
          title: `Partner relationship ${partner.status}`,
          detail: `${partner.farmer_profile?.full_name || "Farmer partner"}${partner.farmer_profile?.county ? ` from ${partner.farmer_profile.county}` : ""}.`,
          at: partner.created_at,
          lane: "network" as const,
          icon: Users,
        })),
        ...companyState.requests.map((request) => ({
          id: `company-request-${request.id}`,
          title: `Procurement request ${request.status}`,
          detail: `${request.title}${request.needed_by ? ` with a target date of ${request.needed_by}` : ""}.`,
          at: request.created_at,
          lane: "orders" as const,
          icon: ClipboardList,
        })),
      ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    }

    if (role === "admin") {
      return [
        ...adminState.companies.map((company) => ({
          id: `admin-company-${company.id}`,
          title: `Company ${company.verification_status}`,
          detail: `${company.company_name} entered the admin review pipeline.`,
          at: company.created_at,
          lane: "admin" as const,
          icon: Building2,
        })),
        ...adminState.users.map((user) => ({
          id: `admin-user-${user.user_id}`,
          title: `User role snapshot`,
          detail: `${user.full_name || "User"} is currently assigned to the ${user.role} role.`,
          at: user.created_at,
          lane: "admin" as const,
          icon: ShieldCheck,
        })),
      ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    }

    return [
      ...sellingOrders.map((order) => ({
        id: `selling-${order.id}`,
        title: `Selling order ${order.status}`,
        detail: `${order.product?.name || "Product"} for ${formatCurrency(order.total_price)}.`,
        at: order.updated_at || order.created_at,
        lane: "orders" as const,
        icon: ShoppingCart,
      })),
      ...buyingOrders.map((order) => ({
        id: `buying-${order.id}`,
        title: `Purchase order ${order.status}`,
        detail: `${order.product?.name || "Product"} order with payment status ${order.payment_status}.`,
        at: order.updated_at || order.created_at,
        lane: "finance" as const,
        icon: CreditCard,
      })),
      ...products.map((product) => ({
        id: `product-${product.id}`,
        title: `Listing update: ${product.name}`,
        detail: `${product.stock} ${product.unit} currently listed at ${formatCurrency(product.price_per_unit)}.`,
        at: product.updated_at || product.created_at,
        lane: "catalog" as const,
        icon: Package,
      })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [adminState.companies, adminState.users, buyingOrders, companyState.orders, companyState.partners, companyState.products, companyState.requests, products, role, sellingOrders]);

  const filteredEvents = events.filter((event) => {
    if (hiddenEventIds.has(event.id)) {
      return false;
    }
    const haystack = `${event.title} ${event.detail} ${event.lane}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const removeFromTimeline = async (event: TimelineEvent) => {
    setRemovingEventId(event.id);
    setModerationError(null);
    try {
      await apiFetch(`/admin/activity-events/${encodeURIComponent(event.id)}`, {
        method: "POST",
        body: { reason: "Removed by an administrator from the activity timeline." },
      });
      setHiddenEventIds((current) => new Set([...current, event.id]));
    } catch (error) {
      setModerationError(error instanceof Error ? error.message : "Could not remove the activity item.");
    } finally {
      setRemovingEventId(null);
    }
  };

  return (
    <DashboardShell title="Activity">
      <section className="mb-8 rounded-[2rem] border border-emerald-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.1),_transparent_34%),linear-gradient(135deg,rgba(248,255,251,0.98),rgba(255,255,255,0.96))] p-6 shadow-[0_24px_54px_-36px_rgba(16,185,129,0.28)]">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="inline-flex rounded-full border border-emerald-300/70 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Timeline
            </div>
            <h2 className="mt-4 font-display text-3xl font-bold text-foreground">Recent platform activity in one place</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              This timeline pulls together the most recent actions from orders, listings, partnerships, procurement, and admin workflows so every role can see momentum clearly.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-emerald-200/70 bg-white/80 p-5">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Search activity</label>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search orders, listings, partners, or admin events" className="h-11 rounded-xl pl-10" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{filteredEvents.length} activity items currently visible.</p>
          </div>
        </div>
      </section>

      {moderationError ? <p className="mb-4 text-sm text-red-700">{moderationError}</p> : null}

      {loadingExtra || ordersLoading || productsLoading ? (
        <div className="rounded-[1.3rem] border border-border bg-card p-5 text-sm text-muted-foreground">Loading timeline...</div>
      ) : filteredEvents.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          No activity matches that search yet.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEvents.slice(0, 40).map((event) => (
            <div key={event.id} className="rounded-[1.35rem] border border-border bg-card p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${laneTone(event.lane)}`}>
                    <event.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-lg font-bold text-foreground">{event.title}</h3>
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                        {event.lane}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{event.detail}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-sm text-muted-foreground">{formatRelative(event.at)}</div>
                  {role === "admin" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg text-red-700 hover:bg-red-50 hover:text-red-800"
                      disabled={removingEventId === event.id}
                      onClick={() => void removeFromTimeline(event)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
}
