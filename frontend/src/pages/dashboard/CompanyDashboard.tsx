import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { ApiError, apiFetch } from "@/lib/api";
import { isValidKenyanPhone, normalizeKenyanPhone, sanitizePhoneInput } from "@/lib/inputSanitizers";
import { countyOptions } from "@/lib/kenyaLocations";
import {
  Package,
  Users,
  TrendingUp,
  MapPin,
  CheckCircle,
  Zap,
  Clock,
  AlertTriangle,
  Mail,
  ShoppingCart,
  ArrowRight,
  RefreshCw,
  Target,
  ClipboardCheck,
  Sparkles,
  Layers,
  Truck,
  Banknote,
  Radar,
} from "lucide-react";

interface CompanyProfile {
  id: string;
  company_name: string;
  company_type: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  registration_number?: string | null;
  tax_id?: string | null;
  bio?: string | null;
  headquarters_location?: string | null;
  service_areas?: string[] | null;
  certifications?: string[] | null;
  rating?: number | null;
  verification_status: "pending" | "approved" | "rejected" | "suspended";
  verified_at?: string;
}

interface CompanyStats {
  products_count: number;
  orders_count: number;
  farmer_partners: number;
  active_contracts: number;
}

interface CompanyProductPreview {
  id: string;
  name: string;
  category: string;
  price_per_unit: number;
  unit: string;
  stock: number;
  minimum_order_quantity?: number;
  is_available?: boolean;
}

interface CompanyPartnerPreview {
  id: string;
  status: string;
  farmer_profile: {
    full_name: string | null;
    county: string | null;
  } | null;
}

interface CompanyProcurementPreview {
  id: string;
  title: string;
  target_county: string | null;
  quantity_needed: number;
  unit: string;
  status: string;
}

function formatCompanyType(companyType: string) {
  return companyType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const companyTypeOptions = [
  { value: "input_supplier", label: "Input Supplier" },
  { value: "aggregator", label: "Aggregator" },
  { value: "logistics", label: "Logistics Provider" },
  { value: "processor", label: "Processor" },
  { value: "buyer", label: "Corporate Buyer" },
  { value: "exporter", label: "Exporter" },
  { value: "retailer", label: "Retailer" },
  { value: "other", label: "Other" },
];

export default function CompanyDashboard() {
  const { profile, user } = useAuth();
  const [companyData, setCompanyData] = useState<CompanyProfile | null>(null);
  const [stats, setStats] = useState<CompanyStats>({
    products_count: 0,
    orders_count: 0,
    farmer_partners: 0,
    active_contracts: 0,
  });
  const [latestProducts, setLatestProducts] = useState<CompanyProductPreview[]>([]);
  const [latestPartners, setLatestPartners] = useState<CompanyPartnerPreview[]>([]);
  const [latestRequests, setLatestRequests] = useState<CompanyProcurementPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingCompanyProfile, setMissingCompanyProfile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creatingCompanyProfile, setCreatingCompanyProfile] = useState(false);
  const [companySetupForm, setCompanySetupForm] = useState({
    company_name: "",
    company_type: "other",
    registration_number: "",
    tax_id: "",
    phone: profile?.phone || "",
    email: user?.email || "",
    headquarters_location: profile?.county || "",
    bio: "",
  });

  const displayName =
    profile?.full_name ||
    (typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null) ||
    "Company";
  const firstName = displayName.split(" ")[0];

  const fetchCompanyData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      setMissingCompanyProfile(false);

      const companyDataResponse = await apiFetch<{ company: CompanyProfile; stats: CompanyStats }>("/companies/me");
      setCompanyData(companyDataResponse.company);
      setStats(companyDataResponse.stats);

      const [productsResult, partnersResult, requestsResult] = await Promise.allSettled([
        apiFetch<{ products: CompanyProductPreview[] }>("/companies/me/products"),
        apiFetch<{ partners: CompanyPartnerPreview[] }>("/companies/me/partners"),
        apiFetch<{ requests: CompanyProcurementPreview[] }>("/companies/me/procurement"),
      ]);

      if (productsResult.status === "fulfilled") {
        setLatestProducts(productsResult.value.products.slice(0, 3));
      } else {
        setLatestProducts([]);
      }
      if (partnersResult.status === "fulfilled") {
        setLatestPartners(partnersResult.value.partners.slice(0, 3));
      } else {
        setLatestPartners([]);
      }
      if (requestsResult.status === "fulfilled") {
        setLatestRequests(requestsResult.value.requests.slice(0, 3));
      } else {
        setLatestRequests([]);
      }
    } catch (error) {
      console.error("Error fetching company data:", error);
      setCompanyData(null);
      setLatestProducts([]);
      setLatestPartners([]);
      setLatestRequests([]);
      if (error instanceof ApiError && error.status === 404) {
        setMissingCompanyProfile(true);
        return;
      }
      setLoadError(error instanceof Error ? error.message : "Failed to load company hub.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      void fetchCompanyData();
    }
  }, [user]);

  useEffect(() => {
    setCompanySetupForm((current) => ({
      ...current,
      phone: current.phone || profile?.phone || "",
      email: current.email || user?.email || "",
      headquarters_location: current.headquarters_location || profile?.county || "",
    }));
  }, [profile?.county, profile?.phone, user?.email]);

  const updateSetupField = (field: keyof typeof companySetupForm, value: string) => {
    setCompanySetupForm((current) => ({
      ...current,
      [field]: field === "phone" ? sanitizePhoneInput(value) : value,
    }));
  };

  const handleCreateCompanyProfile = async () => {
    if (!companySetupForm.company_name.trim()) {
      setLoadError("Company name is required.");
      return;
    }

    if (
      companySetupForm.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companySetupForm.email.trim())
    ) {
      setLoadError("Enter a valid company email address or leave it blank for now.");
      return;
    }

    if (companySetupForm.phone.trim() && !isValidKenyanPhone(companySetupForm.phone)) {
      setLoadError("Enter a valid Kenyan phone number like 0712345678 or +254712345678.");
      return;
    }

    setCreatingCompanyProfile(true);
    setLoadError(null);
    try {
      await apiFetch("/companies", {
        method: "POST",
        body: {
          ...companySetupForm,
          company_name: companySetupForm.company_name.trim(),
          company_type: companySetupForm.company_type.trim() || "other",
          registration_number: companySetupForm.registration_number.trim(),
          tax_id: companySetupForm.tax_id.trim(),
          phone: companySetupForm.phone.trim() ? normalizeKenyanPhone(companySetupForm.phone) : null,
          email: companySetupForm.email.trim() || null,
          headquarters_location: companySetupForm.headquarters_location.trim() || null,
          bio: companySetupForm.bio.trim() || null,
          service_areas: companySetupForm.headquarters_location.trim()
            ? [companySetupForm.headquarters_location.trim()]
            : [],
        },
      });
      setMissingCompanyProfile(false);
      await fetchCompanyData();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to create company profile.");
    } finally {
      setCreatingCompanyProfile(false);
    }
  };

  // If company is not approved yet, show pending state
  if (loading) {
    return (
      <DashboardShell title="Company Hub">
        <div className="flex justify-center items-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardShell>
    );
  }

  if (!companyData) {
    return (
      <DashboardShell title="Company Hub">
        {missingCompanyProfile ? (
          <div className="space-y-6">
            <section className="rounded-[2rem] border border-amber-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.12),_transparent_36%),linear-gradient(135deg,rgba(255,251,235,0.98),rgba(255,255,255,0.95))] p-6 shadow-[0_24px_54px_-34px_rgba(245,158,11,0.24)]">
              <div className="max-w-3xl">
                <div className="inline-flex rounded-full border border-amber-300/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Setup Required
                </div>
                <h2 className="mt-4 font-display text-3xl font-bold text-foreground">Finish your company setup to unlock the hub</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Your account already has the <strong>company</strong> role, but there is no saved company profile yet. The dashboard needs your business record before it can show products, partners, procurement, and orders.
                </p>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="rounded-[1.4rem] border border-amber-200/70 bg-white/80 p-5">
                  <h3 className="font-display text-lg font-bold text-foreground">What to do next</h3>
                  <div className="mt-4 space-y-3">
                    {[
                      "Create your company profile with legal and contact details",
                      "Set headquarters and service areas so farmers can find you",
                      "Add your first products or procurement requests from the hub",
                    ].map((step, index) => (
                      <div key={step} className="flex items-start gap-3 rounded-xl bg-amber-50/80 p-3">
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-700">
                          {index + 1}
                        </div>
                        <p className="text-sm text-foreground">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.4rem] border border-sky-200/70 bg-white/80 p-5">
                  <h3 className="font-display text-lg font-bold text-foreground">Create company profile here</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Fill the essentials below and the hub will open immediately after the company record is created.
                  </p>
                  <div className="mt-5 space-y-3">
                    <input
                      value={companySetupForm.company_name}
                      onChange={(event) => updateSetupField("company_name", event.target.value)}
                      placeholder="Company name"
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select
                        value={companySetupForm.company_type}
                        onChange={(event) => updateSetupField("company_type", event.target.value)}
                        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                      >
                        {companyTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={companySetupForm.headquarters_location}
                        onChange={(event) => updateSetupField("headquarters_location", event.target.value)}
                        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                      >
                        <option value="">Headquarters county</option>
                        {countyOptions.map((county) => (
                          <option key={county} value={county}>
                            {county}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        value={companySetupForm.registration_number}
                        onChange={(event) => updateSetupField("registration_number", event.target.value)}
                        placeholder="Registration number"
                        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                      />
                      <input
                        value={companySetupForm.tax_id}
                        onChange={(event) => updateSetupField("tax_id", event.target.value)}
                        placeholder="Tax ID"
                        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        type="email"
                        value={companySetupForm.email}
                        onChange={(event) => updateSetupField("email", event.target.value)}
                        placeholder="Company email"
                        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                      />
                      <input
                        type="tel"
                        value={companySetupForm.phone}
                        onChange={(event) => updateSetupField("phone", event.target.value)}
                        inputMode="tel"
                        placeholder="Phone number"
                        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                      />
                    </div>
                    <textarea
                      value={companySetupForm.bio}
                      onChange={(event) => updateSetupField("bio", event.target.value)}
                      placeholder="Short company description"
                      rows={4}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                    {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}
                    <div className="flex flex-col gap-3">
                      <button type="button" onClick={() => void handleCreateCompanyProfile()} disabled={creatingCompanyProfile} className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
                        {creatingCompanyProfile ? "Creating company profile..." : "Create company profile"}
                        {!creatingCompanyProfile ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
                      </button>
                      <Link to="/company-register" className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
                        Open full registration form
                      </Link>
                      <button type="button" onClick={() => void fetchCompanyData()} className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh company hub
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            <p className="font-semibold">We couldn&apos;t load the company hub.</p>
            <p className="mt-1">{loadError || "An unexpected error occurred while loading company data."}</p>
            <button type="button" onClick={() => void fetchCompanyData()} className="mt-3 inline-flex items-center rounded-xl border border-red-200 bg-white px-3 py-2 font-medium text-red-700 transition-colors hover:bg-red-100">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </button>
          </div>
        )}
      </DashboardShell>
    );
  }

  if (companyData.verification_status === "pending") {
    return (
      <DashboardShell title="Company Hub">
        <div className="max-w-2xl mx-auto">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Clock className="w-8 h-8 text-blue-500" />
            </div>
            <h2 className="text-2xl font-display font-bold text-blue-900 mb-3">
              Verification In Progress
            </h2>
            <p className="text-blue-800 mb-4">
              Your company registration is being reviewed by our team. This typically takes 2-3 business days.
            </p>
            <p className="text-sm text-blue-700">
              We&apos;ll contact you at <strong>{companyData.email || user?.email || "your email address"}</strong> once your application has been reviewed.
            </p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (companyData.verification_status === "rejected") {
    return (
      <DashboardShell title="Company Hub">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-2xl font-display font-bold text-red-900 mb-3">
              Application Rejected
            </h2>
            <p className="text-red-800 mb-4">
              We are unable to activate your company account at this time.
            </p>
            <p className="text-sm text-red-700 mb-6">
              Please contact our team at <a href="mailto:companies@agrilink.ke" className="underline font-semibold">companies@agrilink.ke</a> for more information.
            </p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (companyData.verification_status === "suspended") {
    return (
      <DashboardShell title="Company Hub">
        <div className="max-w-2xl mx-auto">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
            </div>
            <h2 className="text-2xl font-display font-bold text-amber-900 mb-3">
              Company Access Suspended
            </h2>
            <p className="text-amber-800 mb-4">
              Your company account is currently suspended while our team reviews recent activity.
            </p>
            <p className="text-sm text-amber-700">
              Contact <a href="mailto:companies@agrilink.ke" className="underline font-semibold">companies@agrilink.ke</a> to restore access.
            </p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  const readinessItems = [
    {
      label: "Company profile",
      ready: Boolean(companyData.company_name && companyData.bio),
      href: "/dashboard/company/settings?section=company",
    },
    {
      label: "Contact channels",
      ready: Boolean(companyData.email && companyData.phone),
      href: "/dashboard/company/settings?section=contact",
    },
    {
      label: "Service coverage",
      ready: Boolean(companyData.service_areas?.length),
      href: "/dashboard/company/settings?section=contact",
    },
    {
      label: "Product catalog",
      ready: stats.products_count > 0,
      href: "/dashboard/company/products",
    },
    {
      label: "Farmer network",
      ready: stats.farmer_partners > 0,
      href: "/dashboard/company/partners",
    },
    {
      label: "Procurement board",
      ready: latestRequests.length > 0,
      href: "/dashboard/company/procurement",
    },
  ];

  const readinessScore = readinessItems.filter((item) => item.ready).length;

  const nextMoves = [
    !stats.products_count
      ? {
          title: "Add your first product",
          description: "Build your visible company catalog so farmers and buyers understand what you supply.",
          href: "/dashboard/company/products",
          icon: Package,
          tone: "bg-blue-500/10 text-blue-700",
        }
      : null,
    !stats.farmer_partners
      ? {
          title: "Invite farmer partners",
          description: "Start a supplier network and turn your company account into an active sourcing channel.",
          href: "/dashboard/company/partners",
          icon: Users,
          tone: "bg-green-500/10 text-green-700",
        }
      : null,
    !latestRequests.length
      ? {
          title: "Post a procurement request",
          description: "Tell farmers exactly what you need, where, and by when so demand is visible immediately.",
          href: "/dashboard/company/procurement",
          icon: Target,
          tone: "bg-orange-500/10 text-orange-700",
        }
      : null,
    !companyData.service_areas?.length
      ? {
          title: "Set service areas",
          description: "Coverage data helps farmers discover your company faster and tells partners where you operate.",
          href: "/dashboard/company/settings?section=contact",
          icon: MapPin,
          tone: "bg-violet-500/10 text-violet-700",
        }
      : null,
  ].filter(Boolean) as Array<{
    title: string;
    description: string;
    href: string;
    icon: typeof Package;
    tone: string;
  }>;

  const stockedProducts = latestProducts.filter((product) => product.stock > 0).length;
  const lowStockProducts = latestProducts.filter(
    (product) => product.stock > 0 && product.stock <= (product.minimum_order_quantity ?? 1),
  ).length;
  const openRequests = latestRequests.filter((request) => request.status === "open").length;
  const activePartners = latestPartners.filter((partner) => partner.status === "active").length;

  const workspaceHighlights = [
    {
      title: "Latest products",
      href: "/dashboard/company/products",
      empty: "No company products yet. Add your first listing to begin building a usable catalog.",
      items: latestProducts.map((product) => ({
        id: product.id,
        title: product.name,
        meta: `${product.category} • ${product.stock} ${product.unit} in stock`,
        badge: product.is_available ? "Live" : "Paused",
      })),
    },
    {
      title: "Farmer partners",
      href: "/dashboard/company/partners",
      empty: "No partner relationships yet. Invite or approve farmers that match your sourcing needs.",
      items: latestPartners.map((partner) => ({
        id: partner.id,
        title: partner.farmer_profile?.full_name || "Farmer partner",
        meta: `${partner.farmer_profile?.county || "County not set"} • ${partner.status}`,
        badge: partner.status,
      })),
    },
    {
      title: "Procurement board",
      href: "/dashboard/company/procurement",
      empty: "No procurement requests posted yet. Publish one to make company demand visible.",
      items: latestRequests.map((request) => ({
        id: request.id,
        title: request.title,
        meta: `${request.quantity_needed} ${request.unit} • ${request.target_county || "Any county"}`,
        badge: request.status,
      })),
    },
  ];

  const readinessPercent = Math.round((readinessScore / readinessItems.length) * 100);
  const serviceAreas = companyData.service_areas?.length
    ? companyData.service_areas
    : companyData.headquarters_location
      ? [companyData.headquarters_location]
      : [];
  const primaryMetrics = [
    {
      label: "Catalog",
      value: stats.products_count,
      note: stats.products_count ? "Live company listings" : "Start your first listing",
      icon: Package,
      tone: "border-sky-200/80 bg-sky-50/80 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300",
    },
    {
      label: "Partners",
      value: stats.farmer_partners,
      note: stats.farmer_partners ? "Farmer relationships active" : "Grow the supply network",
      icon: Users,
      tone: "border-emerald-200/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
    },
    {
      label: "Demand",
      value: openRequests,
      note: latestRequests.length ? "Open procurement requests" : "Signal what you need",
      icon: Target,
      tone: "border-amber-200/80 bg-amber-50/80 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    },
    {
      label: "Orders",
      value: stats.orders_count,
      note: stats.orders_count ? "Orders managed here" : "Execution starts after sourcing",
      icon: ClipboardCheck,
      tone: "border-violet-200/80 bg-violet-50/80 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300",
    },
  ];
  const quickActions = [
    { href: "/dashboard/services", label: "Services Hub", icon: Layers },
    { href: "/dashboard/company/products", label: "Manage catalog", icon: Package },
    { href: "/dashboard/company/procurement", label: "Open procurement", icon: Target },
    { href: "/dashboard/company/partners", label: "Farmer partners", icon: Users },
    { href: "/dashboard/company/orders", label: "Orders and payments", icon: ClipboardCheck },
    { href: "/dashboard/messages", label: "Supplier messages", icon: Mail },
    { href: "/dashboard/company/settings", label: "Business settings", icon: CheckCircle },
  ];
  const missingLinks = [
    !companyData.bio
      ? { label: "Add company bio", href: "/dashboard/company/settings?section=company" }
      : null,
    !companyData.registration_number
      ? { label: "Add registration number", href: "/dashboard/company/settings?section=company" }
      : null,
    !companyData.tax_id
      ? { label: "Add tax ID", href: "/dashboard/company/settings?section=company" }
      : null,
    !companyData.certifications?.length
      ? { label: "Add certifications", href: "/dashboard/company/settings?section=company" }
      : null,
    !companyData.email
      ? { label: "Add company email", href: "/dashboard/company/settings?section=contact" }
      : null,
    !companyData.phone
      ? { label: "Add phone number", href: "/dashboard/company/settings?section=contact" }
      : null,
    !companyData.website
      ? { label: "Add website", href: "/dashboard/company/settings?section=contact" }
      : null,
    !companyData.headquarters_location
      ? { label: "Add headquarters", href: "/dashboard/company/settings?section=contact" }
      : null,
    !serviceAreas.length
      ? { label: "Add service areas", href: "/dashboard/company/settings?section=contact" }
      : null,
  ].filter(Boolean) as Array<{ label: string; href: string }>;
  const companyOverview = [
    `${formatCompanyType(companyData.company_type)} business account`,
    companyData.headquarters_location
      ? `Operating from ${companyData.headquarters_location}`
      : "Headquarters still needs to be added",
    serviceAreas.length
      ? `${serviceAreas.length} service ${serviceAreas.length === 1 ? "area" : "areas"} configured`
      : "Service areas still need to be configured",
  ];
  const serviceCenterCards = [
    {
      title: "Trade channels",
      description: "Marketplace, B2B procurement, wholesale demand, and retail routes for agricultural supply.",
      href: "/dashboard/services",
      icon: ShoppingCart,
    },
    {
      title: "Logistics visibility",
      description: "Transport, cold-chain, storage, and order tracking signals for active supply.",
      href: "/dashboard/services",
      icon: Truck,
    },
    {
      title: "Finance options",
      description: "Microloans, insurance readiness, and green credit signals from verified activity.",
      href: "/dashboard/services",
      icon: Banknote,
    },
    {
      title: "GMCIS intelligence",
      description: "Geospatial, climate, commodity, market, and AI advisory insight for agricultural decisions.",
      href: "/dashboard/services",
      icon: Radar,
    },
  ];

  return (
    <DashboardShell title="Company Hub">
      <section className="mb-8 overflow-hidden rounded-[2rem] border border-emerald-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_26%),radial-gradient(circle_at_82%_18%,_rgba(59,130,246,0.14),_transparent_24%),linear-gradient(135deg,rgba(248,255,251,0.98),rgba(255,255,255,0.96))] p-6 shadow-[0_28px_60px_-40px_rgba(16,185,129,0.32)] dark:border-emerald-500/20 dark:bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_24%),radial-gradient(circle_at_82%_18%,_rgba(59,130,246,0.14),_transparent_20%),linear-gradient(135deg,rgba(7,20,15,0.98),rgba(10,16,22,0.98))]">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="inline-flex rounded-full border border-emerald-300/70 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:border-emerald-500/25 dark:bg-background/60 dark:text-emerald-300">
              Verified Company Workspace
            </div>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-3xl font-bold text-foreground sm:text-[2.15rem]">{companyData.company_name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Welcome back, {firstName}. Keep sourcing, partner growth, and active demand in one cleaner command center.
                </p>
              </div>
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
                Approved company
              </div>
            </div>

            <p className="mt-5 max-w-3xl text-sm leading-6 text-muted-foreground">
              {companyData.bio || "Complete your company profile with a stronger business summary so farmers and suppliers understand exactly how you operate and where you buy or sell."}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {primaryMetrics.map((metric) => (
                <div key={metric.label} className={`rounded-[1.35rem] border p-4 shadow-sm ${metric.tone}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{metric.label}</p>
                    <metric.icon className="h-4 w-4" />
                  </div>
                  <p className="mt-2 font-display text-[1.8rem] font-bold text-foreground dark:text-white">{metric.value}</p>
                  <p className="mt-1 text-xs leading-5 text-current/80">{metric.note}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/dashboard/company/products" className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700">
                Manage catalog
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link to="/dashboard/company/procurement" className="inline-flex items-center rounded-xl border border-border bg-white/90 px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted dark:bg-background/70">
                Open procurement board
              </Link>
              <Link to="/dashboard/marketplace" className="inline-flex items-center rounded-xl border border-border bg-white/90 px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted dark:bg-background/70">
                Explore marketplace
                <ShoppingCart className="ml-2 h-4 w-4" />
              </Link>
              <Link to="/dashboard/services" className="inline-flex items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200">
                Open services hub
                <Layers className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[1.55rem] border border-white/80 bg-white/88 p-5 shadow-sm dark:border-white/10 dark:bg-background/60">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Workspace Readiness</p>
                  <p className="mt-2 font-display text-3xl font-bold text-foreground">{readinessPercent}%</p>
                  <p className="mt-1 text-sm text-muted-foreground">{readinessScore} of {readinessItems.length} core setup signals are in place.</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/12">
                  <Sparkles className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-500/10">
                <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${readinessPercent}%` }} />
              </div>
              <div className="mt-4 space-y-2">
                {readinessItems.map((item) => (
                  <Link
                    key={item.label}
                    to={item.href}
                    className="flex items-center justify-between rounded-xl bg-background/80 px-3 py-2 transition-colors hover:bg-background dark:bg-background/50"
                  >
                    <span className={`text-sm ${item.ready ? "text-foreground" : "font-medium text-primary"}`}>
                      {item.label}
                    </span>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${item.ready ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
                      {item.ready ? "ready" : "fill now"}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-[1.55rem] border border-white/80 bg-slate-950 p-5 text-white shadow-sm dark:border-white/10">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Coverage and trust</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/60">Service areas</p>
                  <p className="mt-2 font-display text-2xl font-bold">{serviceAreas.length || 0}</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/60">Rating</p>
                  <p className="mt-2 font-display text-2xl font-bold">{companyData.rating ? companyData.rating.toFixed(1) : "New"}</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-white/70">
                Companies that keep coverage, demand, and supplier access current tend to look more credible to farmers immediately.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mb-8 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[1.6rem] border border-border bg-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-xl font-bold text-foreground">Operational overview</h3>
              <p className="mt-1 text-sm text-muted-foreground">Keep the hub focused on what the team needs to run day to day.</p>
            </div>
            <Link to="/dashboard/company/settings" className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
              Update settings
            </Link>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.2rem] bg-background p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Company overview</p>
              <div className="mt-3 space-y-2">
                {companyOverview.map((item) => (
                  <p key={item} className="text-sm text-foreground">{item}</p>
                ))}
              </div>
            </div>

            <div className="rounded-[1.2rem] bg-background p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">What to watch now</p>
              <div className="mt-3 space-y-3 text-sm text-foreground">
                <p>
                  {lowStockProducts > 0
                    ? `${lowStockProducts} recent products are close to their minimum order quantity.`
                    : latestProducts.length
                      ? "Recent product listings look healthy enough for current sourcing conversations."
                      : "Your catalog is still empty, so products should be the first focus area."}
                </p>
                <p>
                  {!stats.farmer_partners
                    ? "Supplier reach is still low because no farmer partners are active yet."
                    : `${activePartners || stats.farmer_partners} partner relationships are active in the latest view.`}
                </p>
                <p>
                  {latestRequests.length
                    ? `${openRequests} procurement requests are currently open.`
                    : "No procurement requests are live yet."}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[1.2rem] bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Services Hub</p>
                <h4 className="mt-1 font-display text-lg font-bold text-foreground">Company operating layer</h4>
              </div>
              <Link to="/dashboard/services" className="text-sm font-semibold text-primary hover:underline">
                Open
              </Link>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {serviceCenterCards.map((card) => (
                <Link
                  key={card.title}
                  to={card.href}
                  className="group rounded-[1rem] border border-border/80 bg-card p-4 transition-colors hover:border-primary/35 hover:bg-primary/5"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <card.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{card.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{card.description}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {missingLinks.length ? (
            <div className="mt-4 rounded-[1.2rem] bg-background p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Complete these details</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {missingLinks.map((item) => (
                  <Link
                    key={item.label}
                    to={item.href}
                    className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="space-y-6">
          <div className="rounded-[1.6rem] border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-bold text-foreground">Quick actions</h3>
                <p className="mt-1 text-sm text-muted-foreground">Jump into the company tools that matter most.</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                <Zap className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {quickActions.map((action) => (
                <Link key={action.href} to={action.href} className="group rounded-[1.15rem] border border-border bg-background px-4 py-4 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-primary/10 p-2 text-primary">
                        <action.icon className="h-4 w-4" />
                      </div>
                      <span>{action.label}</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-xl font-bold text-foreground">Priority moves</h3>
                <p className="mt-1 text-sm text-muted-foreground">Simple next steps based on the current workspace state.</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10">
                <ClipboardCheck className="h-5 w-5 text-amber-700" />
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {nextMoves.length ? nextMoves.slice(0, 3).map((move) => (
                <Link key={move.title} to={move.href} className="block rounded-[1.2rem] border border-border bg-background p-4 transition-colors hover:border-primary/30 hover:bg-primary/5">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${move.tone}`}>
                      <move.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{move.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{move.description}</p>
                    </div>
                  </div>
                </Link>
              )) : (
                <div className="rounded-[1.2rem] bg-emerald-50 p-4 dark:bg-emerald-500/10">
                  <p className="font-medium text-emerald-900 dark:text-emerald-200">Your workspace is in a strong state.</p>
                  <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">Keep products, procurement, and supplier follow-up moving consistently.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="rounded-[1.6rem] border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-display font-bold text-foreground">Recent Workspace Activity</h3>
            <p className="mt-1 text-sm text-muted-foreground">This is where the company can quickly see what is already live across catalog, supplier relationships, and procurement.</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <ClipboardCheck className="h-5 w-5 text-primary" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {workspaceHighlights.map((section) => (
            <div key={section.title} className="rounded-xl bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{section.title}</p>
                <Link to={section.href} className="text-xs font-semibold text-primary hover:underline">
                  Open
                </Link>
              </div>
              <div className="mt-3 space-y-2">
                {section.items.length ? section.items.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border/70 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                        {item.badge}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{item.meta}</p>
                  </div>
                )) : <p className="text-sm text-muted-foreground">{section.empty}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
