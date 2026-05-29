import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { AdminOrder, adminTone, formatCount, formatDateTime, formatMoney } from "./shared";

function isOpenDispute(order: AdminOrder) {
  return Boolean(order.dispute_opened_at) || order.delivery_signoff_status === "disputed";
}

function isOverdue(order: AdminOrder) {
  if (!isOpenDispute(order) || !order.dispute_deadline_at) return false;
  return new Date(order.dispute_deadline_at).getTime() < Date.now();
}

export default function AdminDisputes() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [notesByOrderId, setNotesByOrderId] = useState<Record<string, string>>({});

  const loadOrders = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const rows = await apiFetch<AdminOrder[]>("/admin/orders");
      setOrders(rows);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load dispute board.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders();
  }, []);

  const disputeOrders = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return orders
      .filter((order) => isOpenDispute(order))
      .filter((order) => {
        if (!normalized) return true;
        const haystack = [
          order.id,
          order.product?.name,
          order.buyer_profile?.full_name,
          order.farmer_profile?.full_name,
          order.dispute_reason,
          order.payment_ref,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalized);
      })
      .sort((a, b) => new Date(b.dispute_opened_at || b.created_at).getTime() - new Date(a.dispute_opened_at || a.created_at).getTime());
  }, [orders, searchTerm]);

  const openCount = disputeOrders.length;
  const overdueCount = disputeOrders.filter((order) => isOverdue(order)).length;
  const highValueCount = disputeOrders.filter((order) => Number(order.total_price || 0) >= 10000).length;

  const setOrderNote = (orderId: string, note: string) => {
    setNotesByOrderId((current) => ({ ...current, [orderId]: note }));
  };

  const resolveDispute = async (order: AdminOrder, resolution: "confirm" | "waive", releaseNow: boolean) => {
    const resolutionNote = (notesByOrderId[order.id] || "").trim();
    if (!resolutionNote) {
      toast.error("Add a resolution note before submitting.");
      return;
    }
    const key = `${resolution}-${order.id}`;
    setSavingKey(key);
    setErrorMessage(null);
    try {
      const updated = await apiFetch<AdminOrder>(`/admin/orders/${order.id}/resolve-dispute`, {
        method: "PATCH",
        body: {
          resolution,
          resolution_note: resolutionNote,
          release_now: releaseNow,
        },
      });
      setOrders((current) => current.map((row) => (row.id === order.id ? updated : row)));
      setNotesByOrderId((current) => ({ ...current, [order.id]: "" }));
      toast.success(releaseNow ? "Dispute resolved and payout released." : "Dispute resolved successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not resolve dispute.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <DashboardShell title="Disputes">
      <div className="space-y-5">
        <section className="rounded-[1.6rem] border border-rose-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(244,63,94,0.18),_transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,241,242,0.94))] p-5 shadow-[0_20px_50px_-28px_rgba(244,63,94,0.28)] dark:border-rose-500/20 dark:bg-[radial-gradient(circle_at_top_left,_rgba(244,63,94,0.16),_transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(24,24,27,0.95))]">
          <h2 className="font-display text-[1.7rem] font-bold text-foreground">Dispute & SLA board</h2>
          <p className="mt-1 text-sm text-muted-foreground">Triage open disputes quickly, track overdue cases, and resolve with clear notes and payout intent.</p>
          {errorMessage ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">{errorMessage}</div> : null}
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by order, buyer, farmer, reason, or receipt ref" className="h-11 rounded-xl pl-10" />
            </div>
            <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => void loadOrders()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className={`rounded-[1.3rem] border p-4 ${adminTone("rose").card}`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-[1rem] ${adminTone("rose").iconWrap}`}><ShieldAlert className={`h-5 w-5 ${adminTone("rose").icon}`} /></div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Open Disputes</p>
            <p className="mt-2 font-display text-[1.7rem] font-bold text-foreground">{formatCount(openCount)}</p>
          </div>
          <div className={`rounded-[1.3rem] border p-4 ${adminTone("amber").card}`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-[1rem] ${adminTone("amber").iconWrap}`}><Clock3 className={`h-5 w-5 ${adminTone("amber").icon}`} /></div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Overdue Cases</p>
            <p className="mt-2 font-display text-[1.7rem] font-bold text-foreground">{formatCount(overdueCount)}</p>
          </div>
          <div className={`rounded-[1.3rem] border p-4 ${adminTone("violet").card}`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-[1rem] ${adminTone("violet").iconWrap}`}><AlertTriangle className={`h-5 w-5 ${adminTone("violet").icon}`} /></div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">High Value</p>
            <p className="mt-2 font-display text-[1.7rem] font-bold text-foreground">{formatCount(highValueCount)}</p>
          </div>
        </section>

        <section className="space-y-3">
          {loading ? (
            <div className="rounded-xl border border-border bg-card/90 p-5 text-sm text-muted-foreground">Loading dispute cases...</div>
          ) : disputeOrders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/60 p-5 text-sm text-muted-foreground">No open disputes found in the current result set.</div>
          ) : (
            disputeOrders.map((order) => {
              const note = notesByOrderId[order.id] || "";
              const overdue = isOverdue(order);
              const savingConfirm = savingKey === `confirm-${order.id}`;
              const savingWaive = savingKey === `waive-${order.id}`;
              const savingWaiveRelease = savingKey === `waive-release-${order.id}`;
              return (
                <div key={order.id} className={`rounded-[1.4rem] border p-4 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.18)] ${overdue ? "border-rose-300 bg-rose-50/35 dark:border-rose-500/35 dark:bg-rose-500/10" : "border-border bg-card/90"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{order.product?.name || "Product order"}</p>
                      <p className="text-xs text-muted-foreground">Order {order.id.slice(0, 8).toUpperCase()} • Buyer {order.buyer_profile?.full_name || "Unknown"} • Farmer {order.farmer_profile?.full_name || "Unknown"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">{formatMoney(Number(order.total_price || 0) + Number(order.delivery_fee || 0))}</p>
                      <p className="text-xs text-muted-foreground">{order.payment_ref || "No receipt ref"}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <p>Opened: {formatDateTime(order.dispute_opened_at || order.created_at)}</p>
                    <p>Deadline: {order.dispute_deadline_at ? formatDateTime(order.dispute_deadline_at) : "Not set"}</p>
                    <p>Reason: {order.dispute_reason || "No reason provided."}</p>
                    <p>Signoff: {order.delivery_signoff_status || "pending_proof"}</p>
                  </div>

                  <div className="mt-3">
                    <Input
                      value={note}
                      onChange={(event) => setOrderNote(order.id, event.target.value)}
                      placeholder="Resolution note (required)"
                      className="h-11 rounded-xl"
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" className="rounded-xl" disabled={savingConfirm} onClick={() => void resolveDispute(order, "confirm", false)}>
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                      {savingConfirm ? "Saving..." : "Confirm & Close"}
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="rounded-xl" disabled={savingWaive} onClick={() => void resolveDispute(order, "waive", false)}>
                      {savingWaive ? "Saving..." : "Waive (No Release)"}
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="rounded-xl" disabled={savingWaiveRelease} onClick={() => void resolveDispute(order, "waive", true)}>
                      {savingWaiveRelease ? "Saving..." : "Waive + Release Payout"}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
