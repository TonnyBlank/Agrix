import { useEffect, useMemo, useState } from "react";
import { Building2, Leaf, MapPin, Search, ShieldCheck, Sprout, Users } from "lucide-react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { AdminUser, AdminUserSummary, AppRole, ROLE_OPTIONS, adminRoleBadgeClass, adminRoleRowClass, adminRoleSurfaceClass, adminRoleTone, adminTone, formatCount, formatDateTime, formatMoney } from "./shared";

function normalizeAdminRole(role: AppRole): AppRole {
  return role;
}

function UserCard({
  user,
  savingKey,
  summaryLoadingKey,
  onRoleChange,
  onSave,
  onViewSummary,
}: {
  user: AdminUser;
  savingKey: string | null;
  summaryLoadingKey: string | null;
  onRoleChange: (role: AppRole) => void;
  onSave: () => void;
  onViewSummary: () => void;
}) {
  const roleSurfaceClass = adminRoleSurfaceClass(user.role);
  const roleBadgeClass = adminRoleBadgeClass(user.role);
  return (
    <div className={`rounded-[1.25rem] border p-4 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.18)] lg:hidden dark:bg-card/90 ${roleSurfaceClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold text-foreground">{user.full_name || "Unnamed user"}</p>
          <p className="mt-1 break-all text-sm text-muted-foreground">{user.email || "No email found"}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${roleBadgeClass}`}>
          {user.role}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[1rem] border border-border bg-background/70 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Phone</p>
          <p className="mt-1 text-sm text-foreground">{user.phone || "No phone"}</p>
        </div>
        <div className="rounded-[1rem] border border-border bg-background/70 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Location</p>
          <p className="mt-1 flex items-center gap-2 text-sm text-foreground">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            {user.county || "Not set"}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-[1rem] border border-border bg-background/70 px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Joined</p>
        <p className="mt-1 text-sm text-foreground">{formatDateTime(user.created_at)}</p>
      </div>

      <div className="mt-4 space-y-3">
        <select
          value={user.role}
          onChange={(event) => onRoleChange(event.target.value as AppRole)}
          className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
        >
          {ROLE_OPTIONS.map((roleOption) => (
            <option key={roleOption} value={roleOption}>
              {roleOption}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="w-full rounded-xl" disabled={summaryLoadingKey === `summary-${user.user_id}`} onClick={onViewSummary}>
            View Summary
          </Button>
          <Button type="button" className="w-full rounded-xl" disabled={savingKey === `user-${user.user_id}`} onClick={onSave}>
            Save Role
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summaryLoadingKey, setSummaryLoadingKey] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryData, setSummaryData] = useState<AdminUserSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<AdminUser[]>("/admin/users")
      .then((rows) =>
        setUsers(rows.map((user) => ({ ...user, role: normalizeAdminRole(user.role) }))),
      )
      .catch((error) => setErrorMessage(error instanceof Error ? error.message : "Failed to load users."));
  }, []);

  const updateUserRole = async (userId: string, role: AppRole) => {
    setSavingKey(`user-${userId}`);
    try {
      await apiFetch(`/admin/users/${userId}/role`, { method: "PATCH", body: { role } });
      setUsers((current) => current.map((user) => (user.user_id === userId ? { ...user, role } : user)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update role.");
    } finally {
      setSavingKey(null);
    }
  };

  const viewUserSummary = async (userId: string) => {
    setSummaryOpen(true);
    setSummaryError(null);
    setSummaryData(null);
    setSummaryLoadingKey(`summary-${userId}`);
    try {
      const summary = await apiFetch<AdminUserSummary>(`/admin/users/${userId}/summary`);
      setSummaryData(summary);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "Could not load the user summary.");
    } finally {
      setSummaryLoadingKey(null);
    }
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredUsers = users.filter((user) => {
    if (!normalizedSearch) return true;
    const haystack = [
      user.full_name,
      user.email,
      user.phone,
      user.county,
      user.role,
      user.user_id,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedSearch);
  });
  const roleSummary = useMemo(
    () => [
      {
        role: "farmer_free" as const,
        label: "Farmer Free",
        icon: Leaf,
        detail: "Entry-level accounts getting started on the platform.",
      },
      {
        role: "farmer_pro" as const,
        label: "Farmer Pro",
        icon: Sprout,
        detail: "Premium members with advanced workflow access.",
      },
      {
        role: "company" as const,
        label: "Company",
        icon: Building2,
        detail: "B2B suppliers and agricultural companies.",
      },
      {
        role: "admin" as const,
        label: "Admin",
        icon: ShieldCheck,
        detail: "Control-plane access for operations and review work.",
      },
    ].map((item) => ({
      ...item,
      count: filteredUsers.filter((user) => user.role === item.role).length,
    })),
    [filteredUsers],
  );
  const summaryProfile = summaryData?.profile;
  const summaryCoordinates =
    summaryProfile?.farm_gps_lat !== null &&
    summaryProfile?.farm_gps_lat !== undefined &&
    summaryProfile?.farm_gps_lng !== null &&
    summaryProfile?.farm_gps_lng !== undefined
      ? {
          lat: Number(summaryProfile.farm_gps_lat),
          lng: Number(summaryProfile.farm_gps_lng),
        }
      : null;
  const summaryMapUrl = summaryCoordinates ? `https://maps.google.com/?q=${summaryCoordinates.lat},${summaryCoordinates.lng}` : null;

  return (
    <DashboardShell title="User Roles">
      <div className="space-y-6">
        <section className="rounded-[2rem] border border-amber-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.14),_transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,251,235,0.94))] p-6 shadow-[0_24px_54px_-34px_rgba(245,158,11,0.28)] dark:border-amber-500/20 dark:bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.12),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.12),_transparent_36%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(24,24,27,0.94))]">
          <h2 className="font-display text-2xl font-bold text-foreground">User management</h2>
          <p className="mt-1 text-sm text-muted-foreground">Search users, update access roles, and open full user summaries including farm profile and GPS coordinates.</p>
          {errorMessage ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">{errorMessage}</div> : null}
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search user roles" className="h-11 rounded-xl pl-10" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{filteredUsers.length} users found</p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {roleSummary.map((item) => {
            const tone = adminTone(adminRoleTone(item.role));
            return (
              <div key={item.role} className={`rounded-[1.5rem] border p-5 ${tone.card}`}>
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone.iconWrap}`}>
                  <item.icon className={`h-5 w-5 ${tone.icon}`} />
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                <p className="mt-2 font-display text-3xl font-bold text-foreground">{item.count}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
              </div>
            );
          })}
        </section>

        <section className="rounded-[2rem] border border-border/70 bg-card/90 p-6 shadow-sm">
          <div className="space-y-3 lg:hidden">
            {filteredUsers.map((user) => (
              <UserCard
                key={user.user_id}
                user={user}
                savingKey={savingKey}
                summaryLoadingKey={summaryLoadingKey}
                onRoleChange={(role) => setUsers((current) => current.map((item) => (item.user_id === user.user_id ? { ...item, role } : item)))}
                onSave={() => void updateUserRole(user.user_id, user.role)}
                onViewSummary={() => void viewUserSummary(user.user_id)}
              />
            ))}
            {filteredUsers.length === 0 ? (
              <div className="rounded-[1.25rem] border border-dashed border-border bg-background/40 p-4 text-sm text-muted-foreground">
                No users match that search.
              </div>
            ) : null}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[880px] border-collapse">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="px-3 py-3">User</th>
                  <th className="px-3 py-3">Contact</th>
                  <th className="px-3 py-3">Location</th>
                  <th className="px-3 py-3">Joined</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.user_id} className={`border-b border-border/70 align-top text-sm transition-colors last:border-b-0 ${adminRoleRowClass(user.role)}`}>
                  <td className="px-3 py-3.5">
                    <p className="font-semibold text-foreground">{user.full_name || "Unnamed user"}</p>
                    <p className="text-xs text-muted-foreground">{user.email || "No email found"}</p>
                  </td>
                  <td className="px-3 py-3.5 text-muted-foreground">{user.phone || "No phone"}</td>
                  <td className="px-3 py-3.5 text-muted-foreground">{user.county || "Not set"}</td>
                  <td className="px-3 py-3.5 text-muted-foreground">{formatDateTime(user.created_at)}</td>
                  <td className="px-3 py-3.5">
                    <span className={`mb-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${adminRoleBadgeClass(user.role)}`}>
                      {user.role}
                    </span>
                      <select value={user.role} onChange={(event) => setUsers((current) => current.map((item) => (item.user_id === user.user_id ? { ...item, role: event.target.value as AppRole } : item)))} className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground">
                        {ROLE_OPTIONS.map((roleOption) => (
                          <option key={roleOption} value={roleOption}>
                            {roleOption}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" className="rounded-xl" disabled={summaryLoadingKey === `summary-${user.user_id}`} onClick={() => void viewUserSummary(user.user_id)}>
                          View Summary
                        </Button>
                        <Button type="button" className="rounded-xl" disabled={savingKey === `user-${user.user_id}`} onClick={() => void updateUserRole(user.user_id, user.role)}>
                          Save Role
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No users match that search.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>User Summary</DialogTitle>
            <DialogDescription>
              Complete account, farm, GPS, and activity snapshot for the selected user.
            </DialogDescription>
          </DialogHeader>

          {summaryLoadingKey ? (
            <div className="rounded-xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">Loading user summary...</div>
          ) : null}
          {summaryError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              {summaryError}
            </div>
          ) : null}

          {!summaryLoadingKey && !summaryError && summaryData ? (
            <div className="space-y-5">
              <section className="rounded-2xl border border-border bg-background/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Account</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Name</p>
                    <p className="font-medium text-foreground">{summaryProfile?.full_name || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Role</p>
                    <p className="font-medium text-foreground">{summaryData.user.role}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="break-all font-medium text-foreground">{summaryData.user.email || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="font-medium text-foreground">{summaryProfile?.phone || summaryData.user.phone || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">User ID</p>
                    <p className="break-all text-xs text-muted-foreground">{summaryData.user.user_id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last Sign In</p>
                    <p className="font-medium text-foreground">{formatDateTime(summaryData.user.last_sign_in_at)}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-background/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Farm Details</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">County</p>
                    <p className="font-medium text-foreground">{summaryProfile?.county || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Farm Size</p>
                    <p className="font-medium text-foreground">{summaryProfile?.farm_size || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Farm Type</p>
                    <p className="font-medium text-foreground">{summaryProfile?.farm_type || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Irrigation</p>
                    <p className="font-medium text-foreground">{summaryProfile?.irrigation_type || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Soil Type</p>
                    <p className="font-medium text-foreground">{summaryProfile?.soil_type || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Years Farming</p>
                    <p className="font-medium text-foreground">{summaryProfile?.years_farming ?? "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Storage</p>
                    <p className="font-medium text-foreground">{summaryProfile?.has_storage ? "Yes" : "No"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Transport</p>
                    <p className="font-medium text-foreground">{summaryProfile?.has_transport ? "Yes" : "No"}</p>
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground">Main Crops</p>
                  <p className="font-medium text-foreground">{summaryProfile?.main_crops?.length ? summaryProfile.main_crops.join(", ") : "Not set"}</p>
                </div>
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground">Farm Bio</p>
                  <p className="text-sm text-foreground">{summaryProfile?.bio || "No farm bio added."}</p>
                </div>
                <div className="mt-3 rounded-xl border border-border bg-background px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">Farm GPS</p>
                  <p className="font-medium text-foreground">
                    {summaryCoordinates ? `${summaryCoordinates.lat}, ${summaryCoordinates.lng}` : "GPS not set"}
                  </p>
                  {summaryMapUrl ? (
                    <a href={summaryMapUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-primary underline underline-offset-2">
                      Open map coordinates
                    </a>
                  ) : null}
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-background/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Payout & Company</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-border bg-background p-3">
                    <p className="text-xs text-muted-foreground">Payout Method</p>
                    <p className="mt-1 font-medium text-foreground">{summaryProfile?.payout_method || "Not set"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {summaryProfile?.payout_method === "mpesa"
                        ? summaryProfile?.payout_mpesa_number || "M-Pesa number not set"
                        : summaryProfile?.payout_method === "bank"
                          ? `${summaryProfile?.bank_name || "Bank"} • ${summaryProfile?.bank_account_name || "Account name missing"}`
                          : "No payout destination added."}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <p className="text-xs text-muted-foreground">Company Record</p>
                    <p className="mt-1 font-medium text-foreground">{summaryData.company?.company_name || "No company profile"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {summaryData.company
                        ? `${summaryData.company.verification_status || "pending"} • ${summaryData.company.headquarters_location || "No HQ location"}`
                        : "This user has not created a company profile."}
                    </p>
                  </div>
                </div>
              </section>

              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border bg-background/70 p-3">
                  <p className="text-xs text-muted-foreground">Products</p>
                  <p className="font-display text-2xl font-bold text-foreground">{formatCount(summaryData.stats.products_count)}</p>
                </div>
                <div className="rounded-xl border border-border bg-background/70 p-3">
                  <p className="text-xs text-muted-foreground">Selling Orders</p>
                  <p className="font-display text-2xl font-bold text-foreground">{formatCount(summaryData.stats.selling_orders_count)}</p>
                </div>
                <div className="rounded-xl border border-border bg-background/70 p-3">
                  <p className="text-xs text-muted-foreground">Buying Orders</p>
                  <p className="font-display text-2xl font-bold text-foreground">{formatCount(summaryData.stats.buying_orders_count)}</p>
                </div>
                <div className="rounded-xl border border-border bg-background/70 p-3">
                  <p className="text-xs text-muted-foreground">Loan Applications</p>
                  <p className="font-display text-2xl font-bold text-foreground">{formatCount(summaryData.stats.loan_applications_count)}</p>
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-background/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Recent Marketplace Orders</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-border bg-background p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Selling</p>
                    <div className="mt-2 space-y-2">
                      {summaryData.recent.selling_orders.length ? summaryData.recent.selling_orders.map((order) => (
                        <div key={order.id} className="rounded-lg border border-border/70 bg-background/70 px-2.5 py-2">
                          <p className="text-xs text-foreground">{order.product?.name || "Product"} • {order.status || "pending"} • {order.payment_status}</p>
                          <p className="text-xs text-muted-foreground">{formatMoney(order.total_price)} • {formatDateTime(order.created_at)}</p>
                        </div>
                      )) : <p className="text-xs text-muted-foreground">No selling orders yet.</p>}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Buying</p>
                    <div className="mt-2 space-y-2">
                      {summaryData.recent.buying_orders.length ? summaryData.recent.buying_orders.map((order) => (
                        <div key={order.id} className="rounded-lg border border-border/70 bg-background/70 px-2.5 py-2">
                          <p className="text-xs text-foreground">{order.product?.name || "Product"} • {order.status || "pending"} • {order.payment_status}</p>
                          <p className="text-xs text-muted-foreground">{formatMoney(order.total_price)} • {formatDateTime(order.created_at)}</p>
                        </div>
                      )) : <p className="text-xs text-muted-foreground">No buying orders yet.</p>}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-background/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Verification & Loans</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-border bg-background p-3">
                    <p className="text-xs text-muted-foreground">ID Verification</p>
                    <p className="mt-1 font-medium text-foreground">{summaryData.id_verification?.status || "unverified"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{summaryData.id_verification?.reviewer_note || "No reviewer note."}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <p className="text-xs text-muted-foreground">Latest Loan Applications</p>
                    <div className="mt-2 space-y-2">
                      {summaryData.recent.loan_applications.length ? summaryData.recent.loan_applications.map((loan) => (
                        <div key={loan.id} className="rounded-lg border border-border/70 bg-background/70 px-2.5 py-2">
                          <p className="text-xs text-foreground">{loan.product_title} • {loan.status}</p>
                          <p className="text-xs text-muted-foreground">{formatMoney(loan.approved_amount ?? loan.requested_amount)} • {formatDateTime(loan.created_at)}</p>
                        </div>
                      )) : <p className="text-xs text-muted-foreground">No loan applications yet.</p>}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
