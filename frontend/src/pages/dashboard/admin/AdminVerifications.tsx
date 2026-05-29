import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, ExternalLink, Search, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { AdminVerification, adminTone, formatCount, formatDateTime } from "./shared";

type VerificationStatus = AdminVerification["status"];
type VerificationFilter = "all" | "attention" | "verified" | "rejected";

const ATTENTION_STATUSES: VerificationStatus[] = ["pending", "pending_review", "unverified"];

function statusBadgeClass(status: VerificationStatus) {
  if (status === "verified") return "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300";
  if (status === "rejected") return "bg-rose-500/12 text-rose-700 dark:text-rose-300";
  return "bg-amber-500/12 text-amber-700 dark:text-amber-300";
}

export default function AdminVerifications() {
  const [rows, setRows] = useState<AdminVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<VerificationFilter>("attention");
  const [searchTerm, setSearchTerm] = useState("");
  const [reviewerNote, setReviewerNote] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadRows = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await apiFetch<AdminVerification[]>("/admin/verifications");
      setRows(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load verification queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  const filteredRows = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "verified" && row.status !== "verified") return false;
      if (filter === "rejected" && row.status !== "rejected") return false;
      if (filter === "attention" && !ATTENTION_STATUSES.includes(row.status)) return false;
      if (!normalized) return true;
      const haystack = [
        row.profile?.full_name,
        row.profile?.county,
        row.profile?.phone,
        row.user_id,
        row.status,
        row.reviewer_note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [filter, rows, searchTerm]);

  const selectedCount = selectedIds.size;
  const attentionCount = rows.filter((row) => ATTENTION_STATUSES.includes(row.status)).length;
  const verifiedCount = rows.filter((row) => row.status === "verified").length;
  const rejectedCount = rows.filter((row) => row.status === "rejected").length;

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (filteredRows.length === 0) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = filteredRows.every((row) => next.has(row.id));
      if (allSelected) {
        filteredRows.forEach((row) => next.delete(row.id));
      } else {
        filteredRows.forEach((row) => next.add(row.id));
      }
      return next;
    });
  };

  const updateOne = async (id: string, status: VerificationStatus) => {
    setSavingKey(`one-${id}`);
    try {
      const updated = await apiFetch<AdminVerification>(`/admin/verifications/${id}`, {
        method: "PATCH",
        body: {
          status,
          reviewer_note: reviewerNote.trim() || null,
        },
      });
      setRows((current) => current.map((row) => (row.id === id ? { ...row, ...updated } : row)));
      toast.success(`Verification marked as ${status}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update verification.");
    } finally {
      setSavingKey(null);
    }
  };

  const updateBulk = async (status: VerificationStatus) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setSavingKey(`bulk-${status}`);
    const note = reviewerNote.trim() || null;
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          apiFetch<AdminVerification>(`/admin/verifications/${id}`, {
            method: "PATCH",
            body: { status, reviewer_note: note },
          }).then((updated) => ({ id, updated })),
        ),
      );
      const updates = new Map<string, AdminVerification>();
      let failed = 0;
      results.forEach((result) => {
        if (result.status === "fulfilled") {
          updates.set(result.value.id, result.value.updated);
        } else {
          failed += 1;
        }
      });
      if (updates.size) {
        setRows((current) => current.map((row) => (updates.has(row.id) ? { ...row, ...updates.get(row.id)! } : row)));
      }
      setSelectedIds(new Set());
      if (failed) {
        toast.error(`Updated ${updates.size} records, ${failed} failed.`);
      } else {
        toast.success(`Updated ${updates.size} verification records.`);
      }
    } finally {
      setSavingKey(null);
    }
  };

  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedIds.has(row.id));

  return (
    <DashboardShell title="Verification Queue">
      <div className="space-y-5">
        <section className="rounded-[1.6rem] border border-amber-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.99),rgba(255,251,235,0.94))] p-5 shadow-[0_20px_50px_-28px_rgba(245,158,11,0.28)] dark:border-amber-500/20 dark:bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.12),_transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(24,24,27,0.95))]">
          <h2 className="font-display text-[1.7rem] font-bold text-foreground">Identity verification queue</h2>
          <p className="mt-1 text-sm text-muted-foreground">Review incoming ID records, approve or reject in bulk, and keep a consistent reviewer note trail.</p>
          {errorMessage ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">{errorMessage}</div> : null}
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by user, county, phone, status, or note" className="h-11 rounded-xl pl-10" />
            </div>
            <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => void loadRows()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className={`rounded-[1.3rem] border p-4 ${adminTone("amber").card}`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-[1rem] ${adminTone("amber").iconWrap}`}><Clock3 className={`h-5 w-5 ${adminTone("amber").icon}`} /></div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Needs Review</p>
            <p className="mt-2 font-display text-[1.7rem] font-bold text-foreground">{formatCount(attentionCount)}</p>
          </div>
          <div className={`rounded-[1.3rem] border p-4 ${adminTone("emerald").card}`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-[1rem] ${adminTone("emerald").iconWrap}`}><CheckCircle2 className={`h-5 w-5 ${adminTone("emerald").icon}`} /></div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Verified</p>
            <p className="mt-2 font-display text-[1.7rem] font-bold text-foreground">{formatCount(verifiedCount)}</p>
          </div>
          <div className={`rounded-[1.3rem] border p-4 ${adminTone("rose").card}`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-[1rem] ${adminTone("rose").iconWrap}`}><XCircle className={`h-5 w-5 ${adminTone("rose").icon}`} /></div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Rejected</p>
            <p className="mt-2 font-display text-[1.7rem] font-bold text-foreground">{formatCount(rejectedCount)}</p>
          </div>
          <div className={`rounded-[1.3rem] border p-4 ${adminTone("sky").card}`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-[1rem] ${adminTone("sky").iconWrap}`}><ShieldAlert className={`h-5 w-5 ${adminTone("sky").icon}`} /></div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Selected</p>
            <p className="mt-2 font-display text-[1.7rem] font-bold text-foreground">{formatCount(selectedCount)}</p>
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-border/70 bg-card/90 p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Reviewer Note</p>
              <Input value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} placeholder="Optional note for approve/reject actions" className="mt-2 h-11 rounded-xl" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={filter === "attention" ? "default" : "outline"} className="rounded-xl" onClick={() => setFilter("attention")}>Needs Review</Button>
              <Button type="button" variant={filter === "verified" ? "default" : "outline"} className="rounded-xl" onClick={() => setFilter("verified")}>Verified</Button>
              <Button type="button" variant={filter === "rejected" ? "default" : "outline"} className="rounded-xl" onClick={() => setFilter("rejected")}>Rejected</Button>
              <Button type="button" variant={filter === "all" ? "default" : "outline"} className="rounded-xl" onClick={() => setFilter("all")}>All</Button>
            </div>
          </div>

          {selectedCount > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/70 p-3">
              <p className="text-sm text-foreground">{selectedCount} selected</p>
              <Button type="button" size="sm" className="rounded-xl" disabled={savingKey === "bulk-verified"} onClick={() => void updateBulk("verified")}>
                {savingKey === "bulk-verified" ? "Saving..." : "Bulk Approve"}
              </Button>
              <Button type="button" size="sm" variant="outline" className="rounded-xl" disabled={savingKey === "bulk-rejected"} onClick={() => void updateBulk("rejected")}>
                {savingKey === "bulk-rejected" ? "Saving..." : "Bulk Reject"}
              </Button>
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full min-w-[1040px] border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/25 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="px-3 py-3">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} aria-label="Select all visible verifications" />
                  </th>
                  <th className="px-3 py-3">User</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Submitted</th>
                  <th className="px-3 py-3">Reviewed</th>
                  <th className="px-3 py-3">Docs</th>
                  <th className="px-3 py-3">Note</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">Loading verification queue...</td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">No verifications matched your current filter.</td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-border/70 align-top text-sm last:border-b-0">
                      <td className="px-3 py-3">
                        <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleSelected(row.id)} aria-label={`Select verification ${row.id}`} />
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-foreground">{row.profile?.full_name || "Unknown user"}</p>
                        <p className="text-xs text-muted-foreground">{row.user_id.slice(0, 8)} • {row.profile?.county || "County not set"}</p>
                        <p className="text-xs text-muted-foreground">{row.profile?.phone || "No phone"}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${statusBadgeClass(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{formatDateTime(row.submitted_at || row.created_at)}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{formatDateTime(row.reviewed_at)}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          {row.front_doc_url ? <a className="inline-flex items-center gap-1 text-xs text-primary hover:underline" href={row.front_doc_url} target="_blank" rel="noreferrer">Front <ExternalLink className="h-3 w-3" /></a> : null}
                          {row.back_doc_url ? <a className="inline-flex items-center gap-1 text-xs text-primary hover:underline" href={row.back_doc_url} target="_blank" rel="noreferrer">Back <ExternalLink className="h-3 w-3" /></a> : null}
                          {row.doc_url ? <a className="inline-flex items-center gap-1 text-xs text-primary hover:underline" href={row.doc_url} target="_blank" rel="noreferrer">Legacy Doc <ExternalLink className="h-3 w-3" /></a> : null}
                          {!row.front_doc_url && !row.back_doc_url && !row.doc_url ? <span className="text-xs text-muted-foreground">No documents</span> : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{row.reviewer_note || "No reviewer note."}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <Button type="button" size="sm" className="rounded-xl" disabled={savingKey === `one-${row.id}`} onClick={() => void updateOne(row.id, "verified")}>
                            Approve
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="rounded-xl" disabled={savingKey === `one-${row.id}`} onClick={() => void updateOne(row.id, "rejected")}>
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
