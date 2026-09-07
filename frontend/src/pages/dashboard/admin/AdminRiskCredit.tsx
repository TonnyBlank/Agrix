import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

import DashboardShell from "@/components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { adminTone, formatCount } from "./shared";

type RiskRecordStatus = "draft" | "ready" | "submitted" | "reviewing" | "approved" | "declined";

type AdminRiskRecord = {
  id: string;
  userId: string;
  type: "insurance" | "green_credit";
  title: string;
  amount: string;
  enterprise: string;
  riskFocus: string;
  evidence: string;
  climatePractice: string;
  readinessScore: number;
  greenScore: number;
  status: RiskRecordStatus;
  partnerNote: string;
  partnerReference: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  profile?: {
    full_name?: string | null;
    county?: string | null;
    phone?: string | null;
  } | null;
};

const reviewStatuses = ["all", "submitted", "reviewing", "approved", "declined"] as const;

function statusClass(status: RiskRecordStatus) {
  if (status === "approved") return "bg-emerald-500/10 text-emerald-700";
  if (status === "submitted" || status === "reviewing") return "bg-sky-500/10 text-sky-700";
  if (status === "declined") return "bg-rose-500/10 text-rose-700";
  return "bg-amber-500/12 text-amber-700";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not submitted";
  return new Intl.DateTimeFormat("en-KE", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default function AdminRiskCredit() {
  const [records, setRecords] = useState<AdminRiskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof reviewStatuses)[number]>("all");
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [referencesById, setReferencesById] = useState<Record<string, string>>({});

  const loadRecords = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const statusQuery = statusFilter === "all" ? "" : `?status=${encodeURIComponent(statusFilter)}`;
      const rows = await apiFetch<AdminRiskRecord[]>(`/admin/risk-credit${statusQuery}`);
      setRecords(rows);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load risk and credit files.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filteredRecords = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return records.filter((record) => {
      if (!normalized) return true;
      const haystack = [
        record.title,
        record.enterprise,
        record.riskFocus,
        record.profile?.full_name,
        record.profile?.county,
        record.profile?.phone,
        record.partnerReference,
        record.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [records, searchTerm]);

  const summary = useMemo(
    () => [
      { label: "Submitted", value: records.filter((record) => record.status === "submitted").length, icon: FileText, tone: adminTone("sky") },
      { label: "Reviewing", value: records.filter((record) => record.status === "reviewing").length, icon: ShieldCheck, tone: adminTone("amber") },
      { label: "Approved", value: records.filter((record) => record.status === "approved").length, icon: CheckCircle2, tone: adminTone("emerald") },
      { label: "Declined", value: records.filter((record) => record.status === "declined").length, icon: XCircle, tone: adminTone("rose") },
    ],
    [records],
  );

  const updateDecision = async (record: AdminRiskRecord, status: "reviewing" | "approved" | "declined") => {
    const key = `${status}-${record.id}`;
    setSavingKey(key);
    try {
      const updated = await apiFetch<AdminRiskRecord>(`/admin/risk-credit/${record.id}`, {
        method: "PATCH",
        body: {
          status,
          partnerNote: notesById[record.id] || record.partnerNote || "",
          partnerReference: referencesById[record.id] || record.partnerReference || "",
        },
      });
      setRecords((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      toast.success(`Risk and credit file marked ${status}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update risk and credit file.");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <DashboardShell title="Risk & Credit Review">
      <div className="space-y-5">
        <section className="rounded-[1.3rem] border border-border/70 bg-white/90 p-4 shadow-[0_16px_28px_-24px_rgba(15,23,42,0.18)] dark:bg-card/90">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Partner Review Queue</p>
              <p className="text-sm text-muted-foreground">Review submitted insurance and green-credit files from farmers and companies.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as (typeof reviewStatuses)[number])}
                className="h-9 rounded-xl border border-input bg-background px-3 text-xs text-foreground shadow-sm"
              >
                {reviewStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status === "all" ? "All statuses" : status}
                  </option>
                ))}
              </select>
              <Button type="button" className="h-9 rounded-xl" onClick={() => void loadRecords()} disabled={loading}>
                <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>
          {errorMessage ? (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
              {errorMessage}
            </div>
          ) : null}
          <div className="mt-4 relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search applicant, county, enterprise, status, or reference" className="h-10 rounded-xl pl-10" />
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summary.map((item) => (
            <div key={item.label} className="rounded-[1.3rem] border border-border/70 bg-white/90 p-4 shadow-[0_16px_28px_-24px_rgba(15,23,42,0.18)] dark:bg-card/90">
              <div className={`flex h-10 w-10 items-center justify-center rounded-[0.9rem] ${item.tone.iconWrap}`}>
                <item.icon className={`h-5 w-5 ${item.tone.icon}`} />
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
              <p className="mt-2 font-display text-2xl font-bold text-foreground">{formatCount(item.value)}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Files in this status.</p>
            </div>
          ))}
        </section>

        <section className="rounded-[1.1rem] border border-border/70 bg-white/90 p-4 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.18)] dark:bg-card/90">
          <div className="space-y-3">
            {loading ? (
              <div className="rounded-[1.2rem] border border-border bg-white/85 p-4 text-sm text-muted-foreground">Loading risk and credit files...</div>
            ) : filteredRecords.length ? (
              filteredRecords.map((record) => {
                const applicant = record.profile?.full_name || "Applicant";
                return (
                  <div key={record.id} className="rounded-[1.1rem] border border-border/70 bg-muted/20 p-4">
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]", statusClass(record.status))}>
                            {record.status}
                          </span>
                          <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {record.type === "green_credit" ? "Green credit" : "Insurance"}
                          </span>
                        </div>
                        <h3 className="mt-3 font-display text-xl font-bold text-foreground">{record.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {applicant} • {record.profile?.county || "County not set"} • {record.enterprise}
                        </p>
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">{record.riskFocus}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full border border-border/70 bg-background px-2.5 py-1">Risk {record.readinessScore}%</span>
                          <span className="rounded-full border border-border/70 bg-background px-2.5 py-1">Green {record.greenScore}%</span>
                          <span className="rounded-full border border-border/70 bg-background px-2.5 py-1">{record.amount || "No amount set"}</span>
                          <span className="rounded-full border border-border/70 bg-background px-2.5 py-1">Submitted {formatDate(record.submittedAt || record.createdAt)}</span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <textarea
                          value={notesById[record.id] ?? record.partnerNote ?? ""}
                          onChange={(event) => setNotesById((current) => ({ ...current, [record.id]: event.target.value }))}
                          placeholder="Partner review note"
                          rows={3}
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                        />
                        <Input
                          value={referencesById[record.id] ?? record.partnerReference ?? ""}
                          onChange={(event) => setReferencesById((current) => ({ ...current, [record.id]: event.target.value }))}
                          placeholder="Partner reference"
                          className="h-10 rounded-xl"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <Button type="button" variant="outline" className="h-9 rounded-xl text-xs" disabled={savingKey === `reviewing-${record.id}`} onClick={() => void updateDecision(record, "reviewing")}>
                            Review
                          </Button>
                          <Button type="button" className="h-9 rounded-xl text-xs" disabled={savingKey === `approved-${record.id}`} onClick={() => void updateDecision(record, "approved")}>
                            Approve
                          </Button>
                          <Button type="button" variant="outline" className="h-9 rounded-xl text-xs text-rose-700 hover:bg-rose-50 hover:text-rose-700" disabled={savingKey === `declined-${record.id}`} onClick={() => void updateDecision(record, "declined")}>
                            Decline
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-[1.2rem] border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
                No risk and credit files match this view.
              </div>
            )}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
