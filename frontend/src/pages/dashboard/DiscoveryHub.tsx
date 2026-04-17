import { useEffect, useMemo, useState } from "react";
import { Building2, CalendarDays, MapPin, Search, Sprout, Star, Target, Users } from "lucide-react";

import DashboardShell from "@/components/dashboard/DashboardShell";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";

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
  company: {
    id: string;
    company_name: string;
    company_type: string;
    headquarters_location: string | null;
    service_areas: string[];
  };
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
  const [loading, setLoading] = useState(true);
  const [selectedCounty, setSelectedCounty] = useState("all");

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const companyPath =
          role === "farmer_free" || role === "farmer_pro"
            ? `/farmer/companies${query.trim() ? `?search=${encodeURIComponent(query.trim())}` : ""}`
            : `/companies${query.trim() ? `?search=${encodeURIComponent(query.trim())}` : ""}`;

        const [companiesResponse, farmersResponse, procurementResponse] = await Promise.allSettled([
          apiFetch<{ companies: DiscoverCompany[] }>(companyPath),
          apiFetch<DiscoverFarmer[]>(`/profiles/farmers${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`),
          apiFetch<{ requests: DiscoverProcurementRequest[] }>(`/farmer/procurement${query.trim() ? `?search=${encodeURIComponent(query.trim())}` : ""}`),
        ]);

        if (!active) return;

        setCompanies(companiesResponse.status === "fulfilled" ? companiesResponse.value.companies ?? [] : []);
        setFarmers(farmersResponse.status === "fulfilled" ? farmersResponse.value ?? [] : []);
        setProcurementRequests(procurementResponse.status === "fulfilled" ? procurementResponse.value.requests ?? [] : []);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [query, role]);

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
              <p className="mt-1 text-sm text-muted-foreground">Open demand from companies that farmers can use to understand what buyers need right now.</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="rounded-xl bg-background p-4 text-sm text-muted-foreground">Loading procurement requests...</div>
            ) : filteredProcurementRequests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">No procurement requests matched the current search or county filter.</div>
            ) : (
              filteredProcurementRequests.map((request) => (
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
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
