import { useEffect, useMemo, useState } from "react";
import { Bell, Building2, ClipboardCheck, CreditCard, Package, ShieldCheck, ShoppingCart, Sprout, Users } from "lucide-react";
import { Link } from "react-router-dom";

import DashboardShell from "@/components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useOrders } from "@/hooks/useOrders";
import { useMyProducts } from "@/hooks/useProducts";
import { apiFetch } from "@/lib/api";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  priority: "high" | "medium" | "low";
  category: "action" | "update" | "info";
  href?: string;
  icon: typeof Bell;
};

type CompanyHubResponse = {
  company: {
    company_name: string;
    email?: string | null;
    phone?: string | null;
    bio?: string | null;
    headquarters_location?: string | null;
    service_areas?: string[] | null;
    verification_status: "pending" | "approved" | "rejected" | "suspended";
  };
  stats: {
    products_count: number;
    orders_count: number;
    farmer_partners: number;
    active_contracts: number;
  };
};

type CompanyProduct = {
  id: string;
  name: string;
  stock: number;
  unit: string;
  minimum_order_quantity?: number;
  is_available?: boolean;
};

type CompanyPartner = {
  id: string;
  status: string;
};

type CompanyRequest = {
  id: string;
  title: string;
  status: string;
};

type CompanyOrder = {
  id: string;
  status: string;
  total_amount: number;
};

type AdminOverview = {
  pendingLoansCount: number;
  pendingVerificationsCount: number;
  ordersCount: number;
  usersCount: number;
};

type AdminCompany = {
  id: string;
  company_name: string;
  verification_status: string;
  created_at: string;
};

type AdminOrder = {
  id: string;
  status: string;
  payment_status?: string | null;
  total_price: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
}

function priorityTone(priority: NotificationItem["priority"]) {
  if (priority === "high") {
    return "border-red-200 bg-red-50/80 text-red-700";
  }
  if (priority === "medium") {
    return "border-amber-200 bg-amber-50/80 text-amber-700";
  }
  return "border-emerald-200 bg-emerald-50/80 text-emerald-700";
}

export default function NotificationsCenter() {
  const { role, profile } = useAuth();
  const { sellingOrders, buyingOrders, loading: ordersLoading } = useOrders();
  const { products, loading: productsLoading } = useMyProducts();
  const [companyState, setCompanyState] = useState<{
    company: CompanyHubResponse["company"] | null;
    stats: CompanyHubResponse["stats"] | null;
    products: CompanyProduct[];
    partners: CompanyPartner[];
    requests: CompanyRequest[];
    orders: CompanyOrder[];
  }>({
    company: null,
    stats: null,
    products: [],
    partners: [],
    requests: [],
    orders: [],
  });
  const [adminState, setAdminState] = useState<{
    overview: AdminOverview | null;
    companies: AdminCompany[];
    orders: AdminOrder[];
  }>({
    overview: null,
    companies: [],
    orders: [],
  });
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | NotificationItem["category"]>("all");

  useEffect(() => {
    let active = true;

    const loadExtras = async () => {
      if (!role || (role !== "company" && role !== "admin")) {
        return;
      }

      setLoadingExtra(true);
      try {
        if (role === "company") {
          const [hub, companyProducts, partners, requests, orders] = await Promise.allSettled([
            apiFetch<CompanyHubResponse>("/companies/me"),
            apiFetch<{ products: CompanyProduct[] }>("/companies/me/products"),
            apiFetch<{ partners: CompanyPartner[] }>("/companies/me/partners"),
            apiFetch<{ requests: CompanyRequest[] }>("/companies/me/procurement"),
            apiFetch<{ orders: CompanyOrder[] }>("/companies/me/orders"),
          ]);

          if (!active) return;

          setCompanyState({
            company: hub.status === "fulfilled" ? hub.value.company : null,
            stats: hub.status === "fulfilled" ? hub.value.stats : null,
            products: companyProducts.status === "fulfilled" ? companyProducts.value.products ?? [] : [],
            partners: partners.status === "fulfilled" ? partners.value.partners ?? [] : [],
            requests: requests.status === "fulfilled" ? requests.value.requests ?? [] : [],
            orders: orders.status === "fulfilled" ? orders.value.orders ?? [] : [],
          });
        }

        if (role === "admin") {
          const [overview, companies, orders] = await Promise.allSettled([
            apiFetch<AdminOverview>("/admin/overview"),
            apiFetch<{ companies: AdminCompany[] }>("/admin/companies?status=pending"),
            apiFetch<AdminOrder[]>("/admin/orders"),
          ]);

          if (!active) return;

          setAdminState({
            overview: overview.status === "fulfilled" ? overview.value : null,
            companies: companies.status === "fulfilled" ? companies.value.companies ?? [] : [],
            orders: orders.status === "fulfilled" ? orders.value ?? [] : [],
          });
        }
      } finally {
        if (active) {
          setLoadingExtra(false);
        }
      }
    };

    void loadExtras();

    return () => {
      active = false;
    };
  }, [role]);

  const notifications = useMemo<NotificationItem[]>(() => {
    const items: NotificationItem[] = [];

    if (role === "company") {
      const company = companyState.company;
      const stats = companyState.stats;
      if (!company) {
        items.push({
          id: "company-profile-missing",
          title: "Complete company setup",
          message: "Your account needs a company profile before products, procurement, and partner workflows can fully operate.",
          priority: "high",
          category: "action",
          href: "/dashboard/company",
          icon: Building2,
        });
        return items;
      }

      if (company.verification_status === "pending") {
        items.push({
          id: "company-verification-pending",
          title: "Verification is still in progress",
          message: "Keep profile and contact details ready so the team can complete review without delays.",
          priority: "high",
          category: "update",
          href: "/dashboard/company",
          icon: ShieldCheck,
        });
      }

      if (!company.service_areas?.length) {
        items.push({
          id: "company-coverage",
          title: "Set service areas",
          message: "Coverage information helps farmers and buyers understand where your company can trade.",
          priority: "medium",
          category: "action",
          href: "/dashboard/company/settings",
          icon: Building2,
        });
      }

      if (!stats?.products_count) {
        items.push({
          id: "company-products",
          title: "Build your product catalog",
          message: "A live catalog gives your company credibility and makes procurement follow-through easier.",
          priority: "high",
          category: "action",
          href: "/dashboard/company/products",
          icon: Package,
        });
      }

      const lowStock = companyState.products.filter(
        (product) => product.stock > 0 && product.stock <= (product.minimum_order_quantity ?? 1),
      );
      if (lowStock.length) {
        items.push({
          id: "company-low-stock",
          title: "Recent products need stock attention",
          message: `${lowStock.length} product listings are close to their minimum order threshold.`,
          priority: "medium",
          category: "update",
          href: "/dashboard/company/products",
          icon: Package,
        });
      }

      if (!stats?.farmer_partners) {
        items.push({
          id: "company-partners",
          title: "Start building supplier relationships",
          message: "Invite or approve farmer partners so demand has a real supplier network behind it.",
          priority: "medium",
          category: "action",
          href: "/dashboard/company/partners",
          icon: Users,
        });
      }

      const openRequests = companyState.requests.filter((request) => request.status === "open");
      if (!openRequests.length) {
        items.push({
          id: "company-procurement",
          title: "Post a procurement request",
          message: "Publishing demand makes it easier for farmers to respond with the right supply.",
          priority: "medium",
          category: "action",
          href: "/dashboard/company/procurement",
          icon: ClipboardCheck,
        });
      } else {
        items.push({
          id: "company-open-requests",
          title: "Demand is visible to suppliers",
          message: `${openRequests.length} procurement requests are currently open for supplier response.`,
          priority: "low",
          category: "info",
          href: "/dashboard/company/procurement",
          icon: ClipboardCheck,
        });
      }

      const pendingOrders = companyState.orders.filter((order) => ["pending", "processing"].includes(order.status));
      if (pendingOrders.length) {
        items.push({
          id: "company-orders",
          title: "Orders need follow-up",
          message: `${pendingOrders.length} company orders are still in active processing states.`,
          priority: "medium",
          category: "update",
          href: "/dashboard/company/orders",
          icon: ShoppingCart,
        });
      }
    } else if (role === "admin") {
      if ((adminState.overview?.pendingVerificationsCount ?? 0) > 0) {
        items.push({
          id: "admin-verifications",
          title: "Identity checks are waiting",
          message: `${adminState.overview?.pendingVerificationsCount ?? 0} verification records need review.`,
          priority: "high",
          category: "action",
          href: "/dashboard/admin",
          icon: ShieldCheck,
        });
      }

      if ((adminState.companies?.length ?? 0) > 0) {
        items.push({
          id: "admin-companies",
          title: "Company approvals are pending",
          message: `${adminState.companies.length} company applications are waiting in the review queue.`,
          priority: "high",
          category: "action",
          href: "/dashboard/admin/companies",
          icon: Building2,
        });
      }

      if ((adminState.overview?.pendingLoansCount ?? 0) > 0) {
        items.push({
          id: "admin-loans",
          title: "Loan decisions need attention",
          message: `${adminState.overview?.pendingLoansCount ?? 0} loan applications are pending review.`,
          priority: "medium",
          category: "action",
          href: "/dashboard/admin/loan-decisions",
          icon: CreditCard,
        });
      }

      const unpaidDeliveredOrders = adminState.orders.filter(
        (order) => order.status === "delivered" && order.payment_status !== "paid",
      );
      if (unpaidDeliveredOrders.length) {
        items.push({
          id: "admin-payments",
          title: "Delivered orders need payment follow-up",
          message: `${unpaidDeliveredOrders.length} delivered orders are not yet marked paid.`,
          priority: "medium",
          category: "update",
          href: "/dashboard/admin/transactions",
          icon: ShoppingCart,
        });
      }
    } else {
      if (!profile?.county) {
        items.push({
          id: "profile-county",
          title: "Finish your profile setup",
          message: "Add your county so discovery, weather, and trade routing work more accurately.",
          priority: "high",
          category: "action",
          href: "/dashboard/profile",
          icon: Sprout,
        });
      }

      if (role !== "company" && !productsLoading && products.length === 0) {
        items.push({
          id: "farmer-products",
          title: "Publish your first listing",
          message: "Listings make it easier for buyers and companies to discover your farm.",
          priority: "high",
          category: "action",
          href: "/dashboard/products",
          icon: Package,
        });
      }

      const pendingSellingOrders = sellingOrders.filter((order) => ["pending", "confirmed", "processing"].includes(order.status));
      if (pendingSellingOrders.length) {
        items.push({
          id: "farmer-orders",
          title: "Orders are waiting on your next move",
          message: `${pendingSellingOrders.length} selling orders are still active and need attention.`,
          priority: "medium",
          category: "update",
          href: "/dashboard/orders",
          icon: ShoppingCart,
        });
      }

      const unpaidBuyingOrders = buyingOrders.filter(
        (order) => order.payment_status !== "paid" && ["confirmed", "processing", "shipped", "delivered"].includes(order.status),
      );
      if (unpaidBuyingOrders.length) {
        items.push({
          id: "buyer-payments",
          title: "Some orders still need payment follow-up",
          message: `${unpaidBuyingOrders.length} purchase orders are active but not marked paid yet.`,
          priority: "medium",
          category: "update",
          href: "/dashboard/orders",
          icon: ShoppingCart,
        });
      }

    }

    return items;
  }, [adminState.companies, adminState.orders, adminState.overview, buyingOrders, companyState, ordersLoading, products, productsLoading, profile?.county, role, sellingOrders]);

  const filteredNotifications =
    activeFilter === "all" ? notifications : notifications.filter((notification) => notification.category === activeFilter);

  const highPriorityCount = notifications.filter((notification) => notification.priority === "high").length;

  return (
    <DashboardShell title="Notifications">
      <section className="mb-8 rounded-[2rem] border border-sky-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.1),_transparent_34%),linear-gradient(135deg,rgba(248,252,255,0.98),rgba(255,255,255,0.96))] p-6 shadow-[0_24px_54px_-36px_rgba(14,165,233,0.28)]">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="inline-flex rounded-full border border-sky-300/70 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
              System Pulse
            </div>
            <h2 className="mt-4 font-display text-3xl font-bold text-foreground">What needs your attention now</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              This center gathers the most useful actions, updates, and reminders for your current role so the platform feels more coordinated across orders, sourcing, profile setup, and approvals.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-sky-200/70 bg-white/80 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Notification Summary</p>
            <p className="mt-2 font-display text-3xl font-bold text-foreground">{notifications.length}</p>
            <p className="mt-1 text-sm text-muted-foreground">High priority: {highPriorityCount}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(["all", "action", "update", "info"] as const).map((filter) => (
                <Button
                  key={filter}
                  type="button"
                  size="sm"
                  variant={activeFilter === filter ? "default" : "outline"}
                  className="rounded-full"
                  onClick={() => setActiveFilter(filter)}
                >
                  {filter === "all" ? "All" : filter.charAt(0).toUpperCase() + filter.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {loadingExtra || ordersLoading || productsLoading ? (
        <div className="rounded-[1.3rem] border border-border bg-card p-5 text-sm text-muted-foreground">Loading notifications...</div>
      ) : filteredNotifications.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          No system notifications right now. That usually means your workspace is in a healthy state.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredNotifications.map((notification) => (
            <div key={notification.id} className="rounded-[1.35rem] border border-border bg-card p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                    <notification.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-lg font-bold text-foreground">{notification.title}</h3>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${priorityTone(notification.priority)}`}>
                        {notification.priority}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{notification.message}</p>
                  </div>
                </div>
                {notification.href ? (
                  <Button asChild variant="outline" className="rounded-xl">
                    <Link to={notification.href}>Open</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
