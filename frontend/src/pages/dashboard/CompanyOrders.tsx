import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Package, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import DashboardShell from "@/components/dashboard/DashboardShell";
import CompanySetupRequired from "@/components/dashboard/CompanySetupRequired";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";

type CompanyOrder = {
  id: string;
  product_id: string | null;
  farmer_id: string | null;
  buyer_id: string | null;
  quantity: number;
  total_amount: number;
  status: string;
  notes: string | null;
  created_at: string;
};

const statusTone: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700",
  confirmed: "bg-sky-500/10 text-sky-700",
  processing: "bg-violet-500/10 text-violet-700",
  shipped: "bg-blue-500/10 text-blue-700",
  delivered: "bg-emerald-500/10 text-emerald-700",
  cancelled: "bg-rose-500/10 text-rose-700",
};

export default function CompanyOrders() {
  const [orders, setOrders] = useState<CompanyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingCompanyProfile, setMissingCompanyProfile] = useState(false);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ orders: CompanyOrder[] }>("/companies/me/orders");
      setOrders(data.orders || []);
      setMissingCompanyProfile(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setMissingCompanyProfile(true);
        setOrders([]);
        return;
      }
      toast.error(error instanceof Error ? error.message : "Failed to load company orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders();
  }, []);

  const summary = useMemo(() => {
    const pending = orders.filter((order) => order.status === "pending").length;
    const processing = orders.filter((order) => order.status === "processing").length;
    const revenue = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    return { pending, processing, revenue };
  }, [orders]);

  return (
    <DashboardShell title="Company Orders">
      {missingCompanyProfile ? (
        <CompanySetupRequired title="Set up your company profile before viewing company orders" />
      ) : (
      <div className="space-y-6">
        <section className="rounded-[1.8rem] border border-violet-200/70 bg-[linear-gradient(135deg,rgba(245,243,255,0.98),rgba(255,255,255,0.95))] p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10">
                <ClipboardList className="h-6 w-6 text-violet-600" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold text-foreground">Company order operations</h2>
                <p className="mt-1 text-sm text-muted-foreground">Track supply requests, settlement values, and the current fulfillment workload for your company account.</p>
              </div>
            </div>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => void loadOrders()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pending</p>
            <p className="mt-2 font-display text-3xl font-bold text-foreground">{summary.pending}</p>
            <p className="mt-1 text-sm text-muted-foreground">Orders waiting for the next company action.</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Processing</p>
            <p className="mt-2 font-display text-3xl font-bold text-foreground">{summary.processing}</p>
            <p className="mt-1 text-sm text-muted-foreground">Orders currently moving through internal handling.</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total Order Value</p>
            <p className="mt-2 font-display text-3xl font-bold text-foreground">KES {summary.revenue.toLocaleString()}</p>
            <p className="mt-1 text-sm text-muted-foreground">Combined order value across the company order book.</p>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h3 className="font-display text-xl font-bold text-foreground">Order book</h3>
          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="rounded-xl bg-background p-4 text-sm text-muted-foreground">Loading company orders...</div>
            ) : orders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">No company orders yet. Orders created for company products will appear here.</div>
            ) : (
              orders.map((order) => (
                <div key={order.id} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="font-semibold text-foreground">Order #{order.id.slice(0, 8)}</p>
                      <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                        <Package className="h-4 w-4" />
                        Quantity {order.quantity} • Value KES {Number(order.total_amount || 0).toLocaleString()}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">Created {new Date(order.created_at).toLocaleString()}</p>
                      {order.notes ? <p className="mt-2 text-sm text-foreground">{order.notes}</p> : null}
                    </div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusTone[order.status] || "bg-primary/10 text-primary"}`}>
                      {order.status}
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
