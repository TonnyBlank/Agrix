import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, ImagePlus, LoaderCircle, LucideIcon, MapPin, PackageCheck, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { toast } from "sonner";

import DashboardShell from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { Order } from "@/hooks/useOrders";

type DispatchStatus = "open" | "assigned" | "accepted" | "picked_up" | "in_transit" | "delivered" | "cancelled";

type LogisticsDispatch = {
  id: string;
  order_id: string;
  transporter_id: string | null;
  status: DispatchStatus;
  pickup_location: string | null;
  dropoff_location: string | null;
  vehicle_label: string | null;
  driver_phone: string | null;
  pickup_note: string | null;
  delivery_note: string | null;
  delivery_proof_photo_url: string | null;
  assigned_at: string | null;
  accepted_at: string | null;
  pickup_confirmed_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  order?: Order | null;
  transporter_profile?: { full_name: string | null; phone: string | null; county: string | null } | null;
};

type DispatchDraft = {
  order_id: string;
  transporter_id: string;
  pickup_location: string;
  dropoff_location: string;
  vehicle_label: string;
  driver_phone: string;
};

const statusLabels: Record<DispatchStatus, string> = {
  open: "Open",
  assigned: "Assigned",
  accepted: "Accepted",
  picked_up: "Picked Up",
  in_transit: "In Transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const statusClasses: Record<DispatchStatus, string> = {
  open: "border-amber-200 bg-amber-50 text-amber-700",
  assigned: "border-sky-200 bg-sky-50 text-sky-700",
  accepted: "border-primary/20 bg-primary/10 text-primary",
  picked_up: "border-indigo-200 bg-indigo-50 text-indigo-700",
  in_transit: "border-violet-200 bg-violet-50 text-violet-700",
  delivered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelled: "border-red-200 bg-red-50 text-red-700",
};

const filterOptions = [
  { value: "all", label: "All" },
  { value: "available", label: "Available" },
  { value: "mine", label: "Mine" },
  { value: "open", label: "Open" },
  { value: "accepted", label: "Accepted" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
];

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function nextActions(status: DispatchStatus) {
  if (status === "accepted") return ["picked_up", "in_transit"] as DispatchStatus[];
  if (status === "picked_up") return ["in_transit", "delivered"] as DispatchStatus[];
  if (status === "in_transit") return ["delivered"] as DispatchStatus[];
  return [] as DispatchStatus[];
}

function shortId(value: string | null | undefined) {
  return value ? value.slice(0, 8) : "pending";
}

export default function LogisticsDispatch() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [dispatches, setDispatches] = useState<LogisticsDispatch[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [proofById, setProofById] = useState<Record<string, string>>({});
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [otpById, setOtpById] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<DispatchDraft>({
    order_id: "",
    transporter_id: "",
    pickup_location: "",
    dropoff_location: "",
    vehicle_label: "",
    driver_phone: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const qs = filter && filter !== "all" ? `?status=${encodeURIComponent(filter)}` : "";
      const rows = await apiFetch<LogisticsDispatch[]>(`/logistics/shipments${qs}`);
      setDispatches(rows);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load logistics dispatches.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => {
    const active = dispatches.filter((item) => ["accepted", "picked_up", "in_transit"].includes(item.status)).length;
    const open = dispatches.filter((item) => item.status === "open").length;
    const delivered = dispatches.filter((item) => item.status === "delivered").length;
    const totalValue = dispatches.reduce((sum, item) => {
      const order = item.order;
      return sum + Number(order?.total_price ?? 0) + Number(order?.delivery_fee ?? 0);
    }, 0);
    return { active, open, delivered, totalValue };
  }, [dispatches]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key);
    try {
      await action();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusyKey(null);
    }
  };

  const createDispatch = async () => {
    if (!draft.order_id.trim()) {
      toast.error("Order ID is required.");
      return;
    }
    await runAction("create-dispatch", async () => {
      await apiFetch("/admin/logistics/dispatches", {
        method: "POST",
        body: {
          ...draft,
          order_id: draft.order_id.trim(),
          transporter_id: draft.transporter_id.trim() || null,
        },
      });
      setDraft({ order_id: "", transporter_id: "", pickup_location: "", dropoff_location: "", vehicle_label: "", driver_phone: "" });
      toast.success("Dispatch created.");
    });
  };

  const uploadDeliveryProof = async (dispatch: LogisticsDispatch, file: File) => {
    if (!dispatch.order_id) {
      toast.error("This dispatch is missing its order reference.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Choose a JPEG, PNG, or WebP photo.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Delivery proof photos must be 8MB or less.");
      return;
    }

    await runAction(`proof-${dispatch.id}`, async () => {
      const formData = new FormData();
      formData.append("image", file);
      const response = await apiFetch<{ url: string }>(`/orders/${dispatch.order_id}/delivery-proof-image`, {
        method: "POST",
        body: formData,
      });
      setProofById((current) => ({ ...current, [dispatch.id]: response.url }));
      toast.success("Delivery proof photo uploaded.");
    });
  };

  return (
    <DashboardShell title="Logistics">
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-4">
          <Metric icon={PackageCheck} label="Open" value={metrics.open.toString()} />
          <Metric icon={Truck} label="Active" value={metrics.active.toString()} />
          <Metric icon={CheckCircle2} label="Delivered" value={metrics.delivered.toString()} />
          <Metric icon={ShieldCheck} label="Value" value={formatMoney(metrics.totalValue)} />
        </section>

        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">Dispatch board</h2>
              <p className="mt-1 text-sm text-muted-foreground">{dispatches.length} shipment{dispatches.length === 1 ? "" : "s"} in view</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                {filterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button type="button" variant="outline" className="rounded-md" onClick={() => void load()} disabled={loading}>
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

          {errorMessage ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
          ) : null}

          {isAdmin ? (
            <div className="mt-5 grid gap-3 border-t border-border pt-4 lg:grid-cols-6">
              <Input value={draft.order_id} onChange={(event) => setDraft((current) => ({ ...current, order_id: event.target.value }))} placeholder="Order ID" />
              <Input value={draft.transporter_id} onChange={(event) => setDraft((current) => ({ ...current, transporter_id: event.target.value }))} placeholder="Transporter ID" />
              <Input value={draft.pickup_location} onChange={(event) => setDraft((current) => ({ ...current, pickup_location: event.target.value }))} placeholder="Pickup location" />
              <Input value={draft.dropoff_location} onChange={(event) => setDraft((current) => ({ ...current, dropoff_location: event.target.value }))} placeholder="Dropoff location" />
              <Input value={draft.vehicle_label} onChange={(event) => setDraft((current) => ({ ...current, vehicle_label: event.target.value }))} placeholder="Vehicle" />
              <Button type="button" className="rounded-md" onClick={() => void createDispatch()} disabled={busyKey === "create-dispatch"}>
                {busyKey === "create-dispatch" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                Create
              </Button>
            </div>
          ) : null}
        </section>

        {loading ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading dispatches...</div>
        ) : dispatches.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/70 p-8 text-center text-sm text-muted-foreground">No dispatches match this view.</div>
        ) : (
          <section className="grid gap-4 xl:grid-cols-2">
            {dispatches.map((dispatch) => {
              const order = dispatch.order;
              const proofValue = proofById[dispatch.id] ?? dispatch.delivery_proof_photo_url ?? "";
              const noteValue = noteById[dispatch.id] ?? dispatch.delivery_note ?? "";
              const actionStatuses = nextActions(dispatch.status);
              const canAccept = !isAdmin && (dispatch.status === "open" || (dispatch.status === "assigned" && !dispatch.accepted_at));
              const canRequestOtp = !isAdmin && Boolean(order?.id && dispatch.status === "delivered" && order?.delivery_signoff_status !== "confirmed");

              return (
                <article key={dispatch.id} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={statusClasses[dispatch.status]}>
                          {statusLabels[dispatch.status]}
                        </Badge>
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Dispatch #{shortId(dispatch.id)}</span>
                      </div>
                      <h3 className="mt-3 font-display text-lg font-bold text-foreground">{order?.product?.name || "Marketplace shipment"}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Order #{shortId(dispatch.order_id)} · {formatMoney(Number(order?.total_price ?? 0) + Number(order?.delivery_fee ?? 0))}</p>
                    </div>
                    {canAccept ? (
                      <Button
                        type="button"
                        className="rounded-md"
                        disabled={busyKey === `accept-${dispatch.id}`}
                        onClick={() => void runAction(`accept-${dispatch.id}`, async () => {
                          await apiFetch(`/logistics/shipments/${dispatch.id}/accept`, { method: "POST" });
                          toast.success("Dispatch accepted.");
                        })}
                      >
                        {busyKey === `accept-${dispatch.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                        Accept
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <InfoBlock icon={MapPin} label="Pickup" value={dispatch.pickup_location || dispatch.order?.farmer_profile?.county || "Seller pickup point"} />
                    <InfoBlock icon={MapPin} label="Dropoff" value={dispatch.dropoff_location || dispatch.order?.pickup_office_label || "County handover point"} />
                    <InfoBlock icon={Truck} label="Vehicle" value={dispatch.vehicle_label || "Not assigned"} />
                    <InfoBlock icon={Clock3} label="Updated" value={formatDateTime(dispatch.updated_at)} />
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md border border-border bg-background/70 px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Delivery proof</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {proofValue ? (
                          <a href={proofValue} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary underline underline-offset-2">
                            View uploaded photo
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">Photo required before delivery.</span>
                        )}
                        {!isAdmin ? (
                          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted">
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              capture="environment"
                              className="sr-only"
                              disabled={busyKey === `proof-${dispatch.id}`}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.currentTarget.value = "";
                                if (file) void uploadDeliveryProof(dispatch, file);
                              }}
                            />
                            {busyKey === `proof-${dispatch.id}` ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                            {proofValue ? "Replace photo" : "Upload photo"}
                          </label>
                        ) : null}
                      </div>
                    </div>
                    <Input value={otpById[dispatch.id] ?? ""} onChange={(event) => setOtpById((current) => ({ ...current, [dispatch.id]: event.target.value }))} placeholder="Buyer handover OTP" />
                    <Textarea
                      value={noteValue}
                      onChange={(event) => setNoteById((current) => ({ ...current, [dispatch.id]: event.target.value }))}
                      placeholder="Handover note"
                      className="min-h-[72px] sm:col-span-2"
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {actionStatuses.map((status) => (
                      <Button
                        key={status}
                        type="button"
                        variant={status === "delivered" ? "default" : "outline"}
                        className="rounded-md"
                        disabled={busyKey === `${status}-${dispatch.id}`}
                        onClick={() => {
                          if (status === "delivered" && !proofValue.trim()) {
                            toast.error("Upload a delivery proof photo before marking this dispatch delivered.");
                            return;
                          }
                          void runAction(`${status}-${dispatch.id}`, async () => {
                            await apiFetch(`/logistics/shipments/${dispatch.id}/status`, {
                              method: "PATCH",
                              body: {
                                status,
                                delivery_proof_photo_url: proofValue.trim() || null,
                                delivery_note: noteValue.trim() || null,
                              },
                            });
                            toast.success(`Dispatch marked ${statusLabels[status].toLowerCase()}.`);
                          });
                        }}
                      >
                        {busyKey === `${status}-${dispatch.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                        {statusLabels[status]}
                      </Button>
                    ))}

                    {canRequestOtp ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-md"
                        disabled={busyKey === `otp-${dispatch.id}`}
                        onClick={() => void runAction(`otp-${dispatch.id}`, async () => {
                          const response = await apiFetch<{ otp_code?: string; message?: string }>(`/orders/${dispatch.order_id}/delivery-otp/request`, { method: "POST" });
                          toast.success(response.otp_code ? `OTP created: ${response.otp_code}` : response.message || "OTP created.");
                        })}
                      >
                        {busyKey === `otp-${dispatch.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        Request OTP
                      </Button>
                    ) : null}

                    {!isAdmin && dispatch.status === "delivered" ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-md"
                        disabled={busyKey === `handover-${dispatch.id}`}
                        onClick={() => void runAction(`handover-${dispatch.id}`, async () => {
                          const otp = (otpById[dispatch.id] ?? "").trim();
                          if (!otp) {
                            toast.error("Enter the buyer OTP first.");
                            return;
                          }
                          await apiFetch(`/logistics/shipments/${dispatch.id}/handover`, {
                            method: "POST",
                            body: { otp_code: otp, delivery_note: noteValue.trim() || null },
                          });
                          setOtpById((current) => ({ ...current, [dispatch.id]: "" }));
                          toast.success("Handover confirmed.");
                        })}
                      >
                        {busyKey === `handover-${dispatch.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Verify Handover
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </DashboardShell>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
          <p className="truncate font-display text-2xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/70 px-3 py-2.5">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}
