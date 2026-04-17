import { useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle, Globe, MapPin, Search, Mail, Phone, FileText, ShieldCheck, XCircle, Clock } from "lucide-react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { apiFetch } from "@/lib/api";

interface CompanyRequest {
  id: string;
  company_name: string;
  company_type: string;
  email: string | null;
  phone: string | null;
  website?: string | null;
  registration_number: string | null;
  tax_id: string | null;
  headquarters_location: string | null;
  service_areas?: string[] | null;
  certifications?: string[] | null;
  bio: string | null;
  verification_status: "pending" | "approved" | "rejected" | "suspended";
  created_at: string;
}

function formatCompanyType(companyType: string) {
  return companyType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function AdminCompanyVerification() {
  const [companies, setCompanies] = useState<CompanyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [search, setSearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<CompanyRequest | null>(null);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCompanies();
  }, [filter]);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const queryParam = filter === "all" ? "" : `?status=${filter}`;
      const data = await apiFetch<{ companies: CompanyRequest[] }>(`/admin/companies${queryParam}`);
      setCompanies(data.companies || []);
    } catch (error) {
      console.error("Error fetching companies:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = (company: CompanyRequest, approveAction: "approve" | "reject") => {
    setSelectedCompany(company);
    setAction(approveAction);
    setNotes("");
  };

  const submitVerification = async () => {
    if (!selectedCompany || !action) return;

    try {
      setSubmitting(true);
      await apiFetch<{ success: boolean }>(`/admin/companies/${selectedCompany.id}/verify`, {
        method: "POST",
        body: JSON.stringify({
          action,
          notes,
        }),
      });

      setCompanies(
        companies.map((c) =>
          c.id === selectedCompany.id
            ? {
                ...c,
                verification_status: action === "approve" ? "approved" : "rejected",
              }
            : c
        )
      );
      setSelectedCompany(null);
      setAction(null);
    } catch (error) {
      console.error("Error verifying company:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCompanies = useMemo(
    () =>
      companies.filter((c) => {
        const term = search.toLowerCase();
        return (
          c.company_name.toLowerCase().includes(term) ||
          (c.email || "").toLowerCase().includes(term) ||
          (c.registration_number || "").toLowerCase().includes(term) ||
          (c.tax_id || "").toLowerCase().includes(term)
        );
      }),
    [companies, search],
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <span className="px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-700 text-xs font-semibold flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>;
      case "approved":
        return <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-700 text-xs font-semibold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Approved</span>;
      case "rejected":
        return <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-700 text-xs font-semibold flex items-center gap-1"><XCircle className="w-3 h-3" /> Rejected</span>;
      default:
        return null;
    }
  };

  return (
    <DashboardShell title="Company Verification">
      <div className="mb-8">
        <h2 className="text-2xl font-display font-bold text-foreground">Company Registration Requests</h2>
        <p className="text-muted-foreground text-sm mt-1">Review and verify new company registrations</p>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by company name, email, or registration..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-background border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div className="flex gap-2">
            {["pending", "approved", "rejected", "all"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f as any)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-background border border-border text-foreground hover:bg-background/80"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Company List */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <p className="text-muted-foreground">No companies found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCompanies.map((company) => (
            <div key={company.id} className="bg-card rounded-[1.4rem] border border-border p-6 transition-shadow hover:shadow-lg">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-foreground">{company.company_name}</h3>
                    {getStatusBadge(company.verification_status)}
                  </div>
                  <p className="text-sm text-muted-foreground">{formatCompanyType(company.company_type)}</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(company.created_at).toLocaleDateString()}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 mb-4 rounded-[1.1rem] bg-background p-4">
                <div className="flex gap-2 items-start">
                  <FileText className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Registration</p>
                    <p className="text-sm font-mono text-foreground">{company.registration_number || "Not set"}</p>
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <FileText className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Tax ID</p>
                    <p className="text-sm font-mono text-foreground">{company.tax_id || "Not set"}</p>
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <Mail className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm text-foreground">{company.email || "Not set"}</p>
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <Phone className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="text-sm text-foreground">{company.phone || "Not set"}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-[1.1rem] bg-background p-4">
                  <p className="text-xs text-muted-foreground mb-1">About Company</p>
                  <p className="text-sm text-foreground line-clamp-3">{company.bio || "No company bio provided."}</p>
                </div>
                <div className="rounded-[1.1rem] bg-background p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Headquarters</p>
                      <p className="text-sm text-foreground">{company.headquarters_location || "Not set"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Building2 className="mt-0.5 h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Service areas</p>
                      <p className="text-sm text-foreground">{company.service_areas?.length ? company.service_areas.join(", ") : "Not set"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Certifications</p>
                      <p className="text-sm text-foreground">{company.certifications?.length ? company.certifications.join(", ") : "Not set"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Globe className="mt-0.5 h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Website</p>
                      <p className="text-sm text-foreground break-all">{company.website || "Not set"}</p>
                    </div>
                  </div>
                </div>
              </div>

              {company.verification_status === "pending" && (
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => handleVerify(company, "approve")}
                    className="flex-1 py-2 px-4 rounded-lg bg-green-500 text-white font-medium hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => handleVerify(company, "reject")}
                    className="flex-1 py-2 px-4 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Verification Modal */}
      {selectedCompany && action && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-xl max-w-md w-full p-6 border border-border">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              {action === "approve" ? "Approve Company" : "Reject Company"}
            </h3>

            <p className="text-sm text-muted-foreground mb-4">
              <strong>{selectedCompany.company_name}</strong>
              <br />
              {selectedCompany.registration_number || "No registration number"}
            </p>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={action === "approve" ? "Optional approval notes..." : "Please provide rejection reason..."}
              className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none mb-4"
              rows={3}
            />

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedCompany(null);
                  setAction(null);
                }}
                className="flex-1 py-2 px-4 rounded-lg bg-background border border-border text-foreground hover:bg-background/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitVerification}
                disabled={submitting}
                className={`flex-1 py-2 px-4 rounded-lg text-white font-medium transition-colors ${
                  action === "approve"
                    ? "bg-green-500 hover:bg-green-600 disabled:bg-green-500/50"
                    : "bg-red-500 hover:bg-red-600 disabled:bg-red-500/50"
                }`}
              >
                {submitting ? "Processing..." : action === "approve" ? "Approve" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
