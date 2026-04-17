import { useEffect, useState } from "react";
import { Building2, CalendarDays, PackageSearch, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import DashboardShell from "@/components/dashboard/DashboardShell";
import CompanySetupRequired from "@/components/dashboard/CompanySetupRequired";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";
import { countyOptions } from "@/lib/kenyaLocations";

const procurementCategoryOptions = ["produce", "livestock", "inputs", "equipment", "logistics", "other"];
const procurementUnitOptions = ["kg", "g", "tonne", "bag", "crate", "piece", "litre", "packet"];

type ProcurementRequest = {
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
  status: string;
  created_at: string;
};

const initialForm = {
  title: "",
  category: "produce",
  target_county: "",
  quantity_needed: "",
  unit: "kg",
  budget_min: "",
  budget_max: "",
  needed_by: "",
  notes: "",
};

export default function CompanyProcurement() {
  const [requests, setRequests] = useState<ProcurementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [missingCompanyProfile, setMissingCompanyProfile] = useState(false);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ requests: ProcurementRequest[] }>("/companies/me/procurement");
      setRequests(data.requests || []);
      setMissingCompanyProfile(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setMissingCompanyProfile(true);
        setRequests([]);
        return;
      }
      toast.error(error instanceof Error ? error.message : "Failed to load procurement requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  const submit = async () => {
    setSaving(true);
    try {
      await apiFetch("/companies/me/procurement", {
        method: "POST",
        body: {
          title: form.title.trim(),
          category: form.category.trim(),
          target_county: form.target_county.trim() || null,
          quantity_needed: Number(form.quantity_needed) || 0,
          unit: form.unit.trim() || "kg",
          budget_min: form.budget_min ? Number(form.budget_min) : null,
          budget_max: form.budget_max ? Number(form.budget_max) : null,
          needed_by: form.needed_by || null,
          notes: form.notes.trim() || null,
          status: "open",
        },
      });
      setForm(initialForm);
      toast.success("Procurement request published.");
      await loadRequests();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create procurement request.");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (requestId: string, status: string) => {
    try {
      await apiFetch(`/companies/me/procurement/${requestId}`, { method: "PATCH", body: { status } });
      setRequests((current) => current.map((item) => (item.id === requestId ? { ...item, status } : item)));
      toast.success("Procurement request updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update procurement request.");
    }
  };

  const deleteRequest = async (requestId: string) => {
    try {
      await apiFetch(`/companies/me/procurement/${requestId}`, { method: "DELETE" });
      setRequests((current) => current.filter((item) => item.id !== requestId));
      toast.success("Procurement request deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete procurement request.");
    }
  };

  return (
    <DashboardShell title="Company Procurement">
      {missingCompanyProfile ? (
        <CompanySetupRequired title="Set up your company profile before posting procurement requests" />
      ) : (
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10">
              <PackageSearch className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">Post a procurement need</h2>
              <p className="mt-1 text-sm text-muted-foreground">Tell farmers what you need, where you need it, and the target volume so they can respond faster.</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="title">Request title</Label>
              <Input id="title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Need 5 tonnes of dry maize in Nakuru" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <select
                  id="category"
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  {procurementCategoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="target_county">Target county</Label>
                <select
                  id="target_county"
                  value={form.target_county}
                  onChange={(event) => setForm((current) => ({ ...current, target_county: event.target.value }))}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="">Any county</option>
                  {countyOptions.map((county) => (
                    <option key={county} value={county}>
                      {county}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="quantity_needed">Quantity needed</Label>
                <Input id="quantity_needed" type="number" min="0" step="0.01" value={form.quantity_needed} onChange={(event) => setForm((current) => ({ ...current, quantity_needed: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <select
                  id="unit"
                  value={form.unit}
                  onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  {procurementUnitOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="needed_by">Needed by</Label>
                <Input id="needed_by" type="date" value={form.needed_by} onChange={(event) => setForm((current) => ({ ...current, needed_by: event.target.value }))} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="budget_min">Budget minimum</Label>
                <Input id="budget_min" type="number" min="0" step="0.01" value={form.budget_min} onChange={(event) => setForm((current) => ({ ...current, budget_min: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget_max">Budget maximum</Label>
                <Input id="budget_max" type="number" min="0" step="0.01" value={form.budget_max} onChange={(event) => setForm((current) => ({ ...current, budget_max: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Procurement notes</Label>
              <Textarea id="notes" rows={5} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </div>
          </div>

          <Button type="button" className="rounded-xl" disabled={saving} onClick={() => void submit()}>
            <Plus className="mr-2 h-4 w-4" />
            {saving ? "Publishing..." : "Publish procurement request"}
          </Button>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/10">
              <Building2 className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">Open requests</h2>
              <p className="mt-1 text-sm text-muted-foreground">Keep procurement signals visible and close or pause them as supply gets confirmed.</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="rounded-xl bg-background p-4 text-sm text-muted-foreground">Loading procurement requests...</div>
            ) : requests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">No procurement requests yet. Publish one from the form.</div>
            ) : (
              requests.map((request) => (
                <div key={request.id} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{request.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{request.category} • {request.quantity_needed} {request.unit} • {request.target_county || "Any county"}</p>
                      {(request.budget_min || request.budget_max) ? (
                        <p className="mt-1 text-sm text-foreground">Budget: KES {request.budget_min?.toLocaleString() || 0} - {request.budget_max?.toLocaleString() || 0}</p>
                      ) : null}
                      {request.needed_by ? (
                        <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                          <CalendarDays className="h-4 w-4" />
                          Needed by {new Date(request.needed_by).toLocaleDateString()}
                        </p>
                      ) : null}
                      {request.notes ? <p className="mt-2 text-sm text-muted-foreground">{request.notes}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={request.status} onChange={(event) => void updateStatus(request.id, event.target.value)} className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground">
                        <option value="open">open</option>
                        <option value="paused">paused</option>
                        <option value="closed">closed</option>
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl text-destructive hover:text-destructive"
                        onClick={() => void deleteRequest(request.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
