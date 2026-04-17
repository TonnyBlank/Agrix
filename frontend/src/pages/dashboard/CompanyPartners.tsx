import { useEffect, useState } from "react";
import { Building2, MapPin, Search, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import DashboardShell from "@/components/dashboard/DashboardShell";
import CompanySetupRequired from "@/components/dashboard/CompanySetupRequired";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";

type FarmerSearchResult = {
  user_id: string;
  full_name: string | null;
  county: string | null;
  farm_size: string | null;
  main_crops?: string[] | null;
};

type CompanyPartner = {
  id: string;
  farmer_id: string;
  status: string;
  notes: string | null;
  created_at: string;
  farmer_profile: {
    full_name: string | null;
    county: string | null;
    phone?: string | null;
    farm_size?: string | null;
    main_crops?: string[] | null;
  } | null;
};

export default function CompanyPartners() {
  const [partners, setPartners] = useState<CompanyPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FarmerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviteNotes, setInviteNotes] = useState("");
  const [missingCompanyProfile, setMissingCompanyProfile] = useState(false);

  const loadPartners = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ partners: CompanyPartner[] }>("/companies/me/partners");
      setPartners(data.partners || []);
      setMissingCompanyProfile(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setMissingCompanyProfile(true);
        setPartners([]);
        return;
      }
      toast.error(error instanceof Error ? error.message : "Failed to load company partners.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPartners();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const searchFarmers = async () => {
      if (!query.trim()) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      try {
        const rows = await apiFetch<FarmerSearchResult[]>(`/profiles/farmers?q=${encodeURIComponent(query.trim())}`);
        if (!cancelled) {
          setSearchResults(rows.slice(0, 8));
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to search farmers.");
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    };
    void searchFarmers();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const inviteFarmer = async (farmerId: string) => {
    try {
      await apiFetch("/companies/me/partners", {
        method: "POST",
        body: {
          farmer_id: farmerId,
          status: "pending",
          notes: inviteNotes.trim() || null,
        },
      });
      toast.success("Partnership invite created.");
      setInviteNotes("");
      await loadPartners();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create partnership invite.");
    }
  };

  return (
    <DashboardShell title="Company Partners">
      {missingCompanyProfile ? (
        <CompanySetupRequired title="Set up your company profile before inviting partners" />
      ) : (
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/10">
              <UserPlus className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">Find and invite farmers</h2>
              <p className="mt-1 text-sm text-muted-foreground">Search farm profiles and send partnership invitations directly from the company workspace.</p>
            </div>
          </div>

          <div className="relative mt-5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search farmers by name, county, crops, or farm size" className="pl-9" />
          </div>
          <div className="mt-3">
            <Textarea rows={4} value={inviteNotes} onChange={(event) => setInviteNotes(event.target.value)} placeholder="Optional invite note for the farmer" />
          </div>
          <div className="mt-5 space-y-3">
            {searching ? <div className="rounded-xl bg-background p-4 text-sm text-muted-foreground">Searching farmers...</div> : null}
            {!searching && query.trim() && searchResults.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">No farmers matched your search.</div>
            ) : null}
            {searchResults.map((farmer) => (
              <div key={farmer.user_id} className="rounded-xl border border-border bg-background p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{farmer.full_name || "Farmer"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{[farmer.county, farmer.farm_size].filter(Boolean).join(" • ") || "Farm profile available"}</p>
                    {farmer.main_crops?.length ? <p className="mt-1 text-sm text-foreground">Main crops: {farmer.main_crops.join(", ")}</p> : null}
                  </div>
                  <Button type="button" className="rounded-xl" onClick={() => void inviteFarmer(farmer.user_id)}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Invite partner
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10">
              <Users className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">Partner network</h2>
              <p className="mt-1 text-sm text-muted-foreground">Track active suppliers, pending partnership invites, and outreach notes.</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="rounded-xl bg-background p-4 text-sm text-muted-foreground">Loading partners...</div>
            ) : partners.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">No company partners yet. Invite farmers from the search panel.</div>
            ) : (
              partners.map((partner) => (
                <div key={partner.id} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{partner.farmer_profile?.full_name || "Farmer partner"}</p>
                      <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        {partner.farmer_profile?.county || "County not set"}
                      </p>
                      {partner.farmer_profile?.main_crops?.length ? <p className="mt-1 text-sm text-foreground">Crops: {partner.farmer_profile.main_crops.join(", ")}</p> : null}
                      {partner.notes ? <p className="mt-2 text-sm text-muted-foreground">{partner.notes}</p> : null}
                    </div>
                    <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                      {partner.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      )}
    </DashboardShell>
  );
}
