import { useEffect, useMemo, useState } from "react";
import { Save, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { AdminFeatureFlag, AppRole, ROLE_OPTIONS, adminRoleBadgeClass, adminTone, formatCount } from "./shared";

function toggleRole(enabledFor: AppRole[], role: AppRole) {
  if (enabledFor.includes(role)) {
    return enabledFor.filter((value) => value !== role);
  }
  return [...enabledFor, role].sort();
}

export default function AdminFeatureFlags() {
  const [flags, setFlags] = useState<AdminFeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const loadFlags = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await apiFetch<AdminFeatureFlag[]>("/admin/feature-flags");
      setFlags(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load feature flags.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFlags();
  }, []);

  const filteredFlags = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return flags.filter((flag) => {
      if (!normalized) return true;
      const haystack = [flag.feature_key, flag.description].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(normalized);
    });
  }, [flags, searchTerm]);

  const roleCounts = useMemo(
    () =>
      ROLE_OPTIONS.map((role) => ({
        role,
        count: flags.filter((flag) => flag.enabled_for.includes(role)).length,
      })),
    [flags],
  );

  const updateFlagRoles = async (featureKey: string, enabledFor: AppRole[]) => {
    setSavingKey(featureKey);
    try {
      const updated = await apiFetch<AdminFeatureFlag>(`/admin/feature-flags/${featureKey}`, {
        method: "PATCH",
        body: { enabled_for: enabledFor },
      });
      setFlags((current) =>
        current.map((flag) =>
          flag.feature_key === featureKey ? { ...flag, enabled_for: (updated.enabled_for as AppRole[]).slice().sort() } : flag,
        ),
      );
      toast.success(`Saved roles for ${featureKey}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save feature flag.");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <DashboardShell title="Feature Flags">
      <div className="space-y-5">
        <section className="rounded-[1.6rem] border border-sky-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(240,249,255,0.94))] p-5 shadow-[0_20px_50px_-28px_rgba(56,189,248,0.28)] dark:border-sky-500/20 dark:bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(24,24,27,0.95))]">
          <h2 className="font-display text-[1.7rem] font-bold text-foreground">Feature flag control</h2>
          <p className="mt-1 text-sm text-muted-foreground">Enable or limit each feature by role without editing SQL manually.</p>
          {errorMessage ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">{errorMessage}</div> : null}
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search feature flags" className="h-11 rounded-xl pl-10" />
            </div>
            <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => void loadFlags()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {roleCounts.map((item) => {
            const tone = item.role === "admin" ? adminTone("rose") : item.role === "company" ? adminTone("emerald") : item.role === "farmer_pro" ? adminTone("emerald") : adminTone("amber");
            return (
              <div key={item.role} className={`rounded-[1.3rem] border p-4 ${tone.card}`}>
                <div className={`flex h-10 w-10 items-center justify-center rounded-[1rem] ${tone.iconWrap}`}>
                  <SlidersHorizontal className={`h-5 w-5 ${tone.icon}`} />
                </div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{item.role}</p>
                <p className="mt-2 font-display text-[1.7rem] font-bold text-foreground">{formatCount(item.count)}</p>
                <p className="mt-1 text-sm text-muted-foreground">Flags enabled for this role.</p>
              </div>
            );
          })}
        </section>

        <section className="rounded-[1.5rem] border border-border/70 bg-card/90 p-4 shadow-sm">
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full min-w-[960px] border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/25 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="px-3 py-3">Feature</th>
                  <th className="px-3 py-3">Description</th>
                  <th className="px-3 py-3">Enabled For</th>
                  <th className="px-3 py-3 text-right">Save</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">Loading feature flags...</td>
                  </tr>
                ) : filteredFlags.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">No feature flags matched your search.</td>
                  </tr>
                ) : (
                  filteredFlags.map((flag) => (
                    <tr key={flag.feature_key} className="border-b border-border/70 align-top text-sm last:border-b-0">
                      <td className="px-3 py-3">
                        <p className="font-semibold text-foreground">{flag.feature_key}</p>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{flag.description || "No description"}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          {ROLE_OPTIONS.map((role) => {
                            const enabled = flag.enabled_for.includes(role);
                            return (
                              <label key={role} className={`inline-flex cursor-pointer items-center gap-2 rounded-full px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${adminRoleBadgeClass(role)} ${enabled ? "" : "opacity-60"}`}>
                                <input
                                  type="checkbox"
                                  checked={enabled}
                                  onChange={() =>
                                    setFlags((current) =>
                                      current.map((row) =>
                                        row.feature_key === flag.feature_key
                                          ? { ...row, enabled_for: toggleRole(row.enabled_for, role) }
                                          : row,
                                      ),
                                    )
                                  }
                                />
                                {role}
                              </label>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-xl"
                          disabled={savingKey === flag.feature_key}
                          onClick={() => void updateFlagRoles(flag.feature_key, flag.enabled_for)}
                        >
                          <Save className="mr-1 h-4 w-4" />
                          {savingKey === flag.feature_key ? "Saving..." : "Save"}
                        </Button>
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
