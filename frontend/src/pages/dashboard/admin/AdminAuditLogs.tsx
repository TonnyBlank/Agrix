import { useEffect, useMemo, useState } from "react";
import { History, Search, ShieldCheck } from "lucide-react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { AdminAuditLog, adminTone, formatCount, formatDateTime } from "./shared";

function prettyMetadata(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata || {});
  if (!entries.length) return "No metadata";
  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" • ");
}

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const loadLogs = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await apiFetch<AdminAuditLog[]>("/admin/audit-logs");
      setLogs(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load admin audit logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return logs.filter((log) => {
      if (!normalized) return true;
      const haystack = [
        log.action,
        log.entity_type,
        log.entity_id,
        log.summary,
        log.actor_profile?.full_name,
        log.actor_user_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [logs, searchTerm]);

  const orderEvents = logs.filter((log) => log.entity_type === "order").length;
  const loanEvents = logs.filter((log) => log.entity_type.includes("loan")).length;
  const verificationEvents = logs.filter((log) => log.entity_type === "id_verification").length;

  return (
    <DashboardShell title="Audit Logs">
      <div className="space-y-5">
        <section className="rounded-[1.6rem] border border-violet-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(167,139,250,0.18),_transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(245,243,255,0.94))] p-5 shadow-[0_20px_50px_-28px_rgba(139,92,246,0.28)] dark:border-violet-500/20 dark:bg-[radial-gradient(circle_at_top_left,_rgba(167,139,250,0.16),_transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(24,24,27,0.95))]">
          <h2 className="font-display text-[1.7rem] font-bold text-foreground">Admin audit logs</h2>
          <p className="mt-1 text-sm text-muted-foreground">Trace critical admin decisions across orders, loans, user roles, verifications, and feature flags.</p>
          {errorMessage ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">{errorMessage}</div> : null}
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search actor, action, entity, or summary" className="h-11 rounded-xl pl-10" />
            </div>
            <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => void loadLogs()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className={`rounded-[1.3rem] border p-4 ${adminTone("slate").card}`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-[1rem] ${adminTone("slate").iconWrap}`}><History className={`h-5 w-5 ${adminTone("slate").icon}`} /></div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Total Events</p>
            <p className="mt-2 font-display text-[1.7rem] font-bold text-foreground">{formatCount(logs.length)}</p>
          </div>
          <div className={`rounded-[1.3rem] border p-4 ${adminTone("sky").card}`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-[1rem] ${adminTone("sky").iconWrap}`}><ShieldCheck className={`h-5 w-5 ${adminTone("sky").icon}`} /></div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Order Events</p>
            <p className="mt-2 font-display text-[1.7rem] font-bold text-foreground">{formatCount(orderEvents)}</p>
          </div>
          <div className={`rounded-[1.3rem] border p-4 ${adminTone("emerald").card}`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-[1rem] ${adminTone("emerald").iconWrap}`}><ShieldCheck className={`h-5 w-5 ${adminTone("emerald").icon}`} /></div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Loan Events</p>
            <p className="mt-2 font-display text-[1.7rem] font-bold text-foreground">{formatCount(loanEvents)}</p>
          </div>
          <div className={`rounded-[1.3rem] border p-4 ${adminTone("amber").card}`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-[1rem] ${adminTone("amber").iconWrap}`}><ShieldCheck className={`h-5 w-5 ${adminTone("amber").icon}`} /></div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Verification Events</p>
            <p className="mt-2 font-display text-[1.7rem] font-bold text-foreground">{formatCount(verificationEvents)}</p>
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-border/70 bg-card/90 p-4 shadow-sm">
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/25 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="px-3 py-3">When</th>
                  <th className="px-3 py-3">Actor</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Entity</th>
                  <th className="px-3 py-3">Summary</th>
                  <th className="px-3 py-3">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">Loading audit events...</td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">No audit events matched your search.</td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="border-b border-border/70 align-top text-sm last:border-b-0">
                      <td className="px-3 py-3 text-xs text-muted-foreground">{formatDateTime(log.created_at)}</td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-foreground">{log.actor_profile?.full_name || "Unknown admin"}</p>
                        <p className="text-xs text-muted-foreground">{log.actor_user_id ? log.actor_user_id.slice(0, 8) : "n/a"}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex rounded-full bg-slate-500/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-300">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-foreground">{log.entity_type}</p>
                        <p className="text-xs text-muted-foreground">{log.entity_id || "n/a"}</p>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{log.summary || "No summary"}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{prettyMetadata(log.metadata || {})}</td>
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
