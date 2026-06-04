import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, Chip, EmptyState, SectionHeader, Stack } from '../components/ui';
import { type AppRole, type MobileRoute, type MobileRouteKey, isAdminRole } from '../config/navigation';
import { apiFetch } from '../lib/api';
import { extractRows, firstText, formatMoney, getNumber, type RecordRow } from '../lib/records';
import { colors, radii, spacing, typography } from '../theme';

type Profile = { full_name?: string | null; county?: string | null };

type DashboardProps = {
  profile: Profile | null;
  role: AppRole | null;
  routes: MobileRoute[];
  setActiveKey: (key: MobileRouteKey) => void;
};

const routeDescriptions: Partial<Record<MobileRouteKey, string>> = {
  performance: 'Revenue, orders, listings, and operational performance.',
  farm: 'Farm profile, county, crops, and field information.',
  products: 'Create and manage produce listings shown to buyers.',
  marketplace: 'Browse available produce and company products.',
  cart: 'Review selected items before checkout.',
  messages: 'Buyer, company, admin, and support conversations.',
  orders: 'Track buying and selling order workflows.',
  notifications: 'Account, order, loan, and admin updates.',
  activity: 'Recent movement across your AgriLink account.',
  discover: 'Companies, procurement requests, and farmer opportunities.',
  scanner: 'Upload a crop photo and get field diagnosis guidance.',
  calendar: 'Crop events, reminders, and planting windows.',
  dealMatches: 'Buyer opportunities matched to your listings.',
  community: 'Farmer and buyer network activity.',
  microLoans: 'Loan applications, status, and repayments.',
  upgrade: 'Unlock Pro tools, scanner, and finance workflows.',
  idVerification: 'Upload and review national ID verification.',
  companyHub: 'Company profile, verification, and operating summary.',
  companyProducts: 'Company product catalogue management.',
  companyPartners: 'Farmer partners and sourcing relationships.',
  companyOrders: 'Company-side marketplace order management.',
  companyProcurement: 'Procurement requests and farmer responses.',
  companySettings: 'Company profile and verification settings.',
  adminOverview: 'Platform summary for users, orders, loans, reviews.',
  adminLoans: 'Loan offers available to farmers and companies.',
  adminLoanDecisions: 'Review and decide submitted loan applications.',
  adminTransactions: 'Order payments, delivery signoff, and payouts.',
  adminDisputes: 'Resolve delivery and marketplace disputes.',
  adminCompanies: 'Review and verify company accounts.',
  adminVerifications: 'Review ID verification submissions.',
  adminFeatureFlags: 'Control feature availability by user role.',
  adminAuditLogs: 'Admin action history and platform audit trail.',
  adminUsers: 'User roles and account summaries.',
  profile: 'Personal profile, settings, plan, and sign out.',
};

export function DashboardScreen({ profile, role, routes, setActiveKey }: DashboardProps) {
  const grouped = routes.reduce<Record<string, MobileRoute[]>>((acc, route) => {
    if (route.key === 'dashboard') return acc;
    acc[route.section] = [...(acc[route.section] ?? []), route];
    return acc;
  }, {});

  return (
    <Stack gap={spacing.lg}>
      {/* Hero / greeting */}
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>{formatRole(role).toUpperCase()}</Text>
        <Text style={styles.heroName}>{profile?.full_name || 'AgriLink User'}</Text>
        <Text style={styles.heroNote}>
          {profile?.county || 'Set your county'} · Synced across AgriLink X.
        </Text>
      </View>

      <DashboardSummary role={role} />

      <View>
        <SectionHeader eyebrow="Shortcuts" title="Quick actions" />
        <View style={styles.actionRow}>
          {getQuickActions(role).map((action, index) => (
            <View key={action.key} style={styles.actionSlot}>
              <Button
                fullWidth
                label={action.label}
                variant={index === 0 ? 'primary' : 'secondary'}
                onPress={() => setActiveKey(action.key)}
              />
            </View>
          ))}
        </View>
      </View>

      {Object.entries(grouped).map(([section, items]) => (
        <View key={section}>
          <SectionHeader eyebrow={section} title={section} />
          <View style={styles.grid}>
            {items.map((route) => (
              <Card key={route.key} style={styles.gridCard}>
                <View style={styles.gridIcon}>
                  <Text style={styles.gridInitial}>{route.title.slice(0, 1)}</Text>
                </View>
                <Text style={styles.gridTitle} numberOfLines={1}>{route.title}</Text>
                <Text style={styles.gridDescription} numberOfLines={2}>
                  {routeDescriptions[route.key] || 'Open this AgriLink X tool.'}
                </Text>
                <Button size="sm" variant="ghost" label="Open" onPress={() => setActiveKey(route.key)} />
              </Card>
            ))}
          </View>
        </View>
      ))}
    </Stack>
  );
}

function DashboardSummary({ role }: { role: AppRole | null }) {
  const [summary, setSummary] = useState({
    revenue: 0, products: 0, pendingOrders: 0, unreadMessages: 0,
    notifications: 0, loansValue: 0, users: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isAdminRole(role)) {
        const [overview, orders, notifications] = await Promise.all([
          apiFetch<RecordRow>('/admin/overview').catch(() => ({})),
          apiFetch<unknown>('/admin/orders').catch(() => []),
          apiFetch<unknown>('/notifications?limit=80').catch(() => []),
        ]);
        const orderRows = extractRows(orders);
        setSummary({
          revenue: orderRows.reduce((s, o) => s + getNumber(o, ['total_price', 'total_amount']), 0),
          products: getNumber(overview, ['productsCount']),
          pendingOrders: getNumber(overview, ['ordersCount']),
          unreadMessages: getNumber(overview, ['pendingVerificationsCount']),
          notifications: extractRows(notifications).length,
          loansValue: getNumber(overview, ['totalApprovedLoanValue']),
          users: getNumber(overview, ['usersCount']),
        });
        return;
      }

      const [products, sellingOrders, buyingOrders, conversations, notifications] = await Promise.all([
        apiFetch<unknown>(role === 'company' ? '/companies/me/products' : '/products/mine').catch(() => []),
        apiFetch<unknown>(role === 'company' ? '/companies/me/orders' : '/orders/selling').catch(() => []),
        apiFetch<unknown>('/orders/buying').catch(() => []),
        apiFetch<unknown>('/messages/conversations').catch(() => []),
        apiFetch<unknown>('/notifications?limit=80').catch(() => []),
      ]);

      const sellingRows = extractRows(sellingOrders);
      const allOrders = [...sellingRows, ...extractRows(buyingOrders)];
      const pendingOrders = allOrders.filter((row) => {
        const status = String(row.status || '').toLowerCase();
        return !['delivered', 'completed', 'cancelled', 'failed'].includes(status);
      }).length;
      const revenue = sellingRows.reduce((s, o) => {
        const status = firstText(o, ['payment_status']);
        if (status && !['paid', 'released', 'initiated'].includes(status)) return s;
        return s + getNumber(o, ['seller_payout_amount', 'total_price', 'total_amount', 'amount']);
      }, 0);

      setSummary({
        revenue,
        products: extractRows(products).length,
        pendingOrders,
        unreadMessages: extractRows(conversations).length,
        notifications: extractRows(notifications).length,
        loansValue: 0,
        users: 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load summary.');
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => { void load(); }, [load]);

  const items = [
    { label: isAdminRole(role) ? 'Platform Revenue' : 'Revenue', value: summary.revenue, display: formatMoney(summary.revenue), helper: isAdminRole(role) ? 'Tracked order value' : 'Recent selling orders' },
    { label: role === 'company' ? 'Products' : 'Listings', value: summary.products, display: String(summary.products), helper: role === 'company' ? 'Catalogue' : 'Visible to buyers' },
    { label: isAdminRole(role) ? 'Orders' : 'Pending Orders', value: summary.pendingOrders, display: String(summary.pendingOrders), helper: 'Need follow-up' },
    { label: isAdminRole(role) ? 'Users' : 'Messages', value: isAdminRole(role) ? summary.users : summary.unreadMessages, display: String(isAdminRole(role) ? summary.users : summary.unreadMessages), helper: isAdminRole(role) ? 'Platform accounts' : 'Conversations' },
    { label: isAdminRole(role) ? 'Loan Value' : 'Notifications', value: isAdminRole(role) ? summary.loansValue : summary.notifications, display: isAdminRole(role) ? formatMoney(summary.loansValue) : String(summary.notifications), helper: isAdminRole(role) ? 'Approved financing' : 'Latest updates' },
  ];

  return (
    <View>
      <SectionHeader
        eyebrow="Snapshot"
        title="Summary"
        right={<Button size="sm" variant="secondary" label={loading ? 'Loading' : 'Refresh'} onPress={load} loading={loading} />}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.summaryGrid}>
        {items.map((item) => (
          <Card key={item.label} style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{loading ? '—' : item.display}</Text>
            <Text style={styles.summaryLabel}>{item.label}</Text>
            <Text style={styles.summaryHelper}>{item.helper}</Text>
          </Card>
        ))}
      </View>
      <MiniBarChart items={items.map((i) => ({ label: i.label, value: i.value }))} loading={loading} />
    </View>
  );
}

function MiniBarChart({ items, loading }: { items: Array<{ label: string; value: number }>; loading: boolean }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <Card style={{ marginTop: spacing.md, gap: spacing.sm }}>
      <Text style={styles.chartTitle}>Activity</Text>
      {items.map((item) => (
        <View key={`chart-${item.label}`} style={styles.chartRow}>
          <Text style={styles.chartLabel} numberOfLines={1}>{item.label}</Text>
          <View style={styles.chartTrack}>
            <View style={[styles.chartFill, { width: loading ? '18%' : `${Math.max(8, (item.value / max) * 100)}%` }]} />
          </View>
          <Text style={styles.chartValue}>{loading ? '—' : item.value}</Text>
        </View>
      ))}
    </Card>
  );
}

function getQuickActions(role: AppRole | null): Array<{ key: MobileRouteKey; label: string }> {
  if (isAdminRole(role)) return [
    { key: 'adminOverview', label: 'Platform Summary' },
    { key: 'adminLoanDecisions', label: 'Loan Reviews' },
    { key: 'adminCompanies', label: 'Company Reviews' },
    { key: 'adminVerifications', label: 'ID Checks' },
  ];
  if (role === 'company') return [
    { key: 'companyProcurement', label: 'Procurement' },
    { key: 'companyProducts', label: 'Products' },
    { key: 'companyOrders', label: 'Orders' },
    { key: 'messages', label: 'Messages' },
  ];
  return [
    { key: 'products', label: 'Add Listing' },
    { key: 'microLoans', label: 'Loans' },
    { key: 'scanner', label: 'AI Scanner' },
    { key: 'orders', label: 'Orders' },
  ];
}

function formatRole(role: AppRole | null) {
  if (role === 'farmer_pro') return 'Farmer Pro';
  if (role === 'farmer_free') return 'Free';
  if (role === 'company') return 'Company';
  if (isAdminRole(role)) return 'Admin';
  return 'Free';
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primaryDeep,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  heroEyebrow: { color: colors.goldSoft, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  heroName: { color: colors.textInverse, fontSize: 28, fontWeight: '900', marginTop: 4 },
  heroNote: { color: colors.primarySoft, fontSize: 14, marginTop: 4 },

  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionSlot: { width: '48%' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gridCard: { width: '48%', padding: spacing.md, gap: spacing.xs },
  gridIcon: {
    width: 36, height: 36, borderRadius: radii.md,
    backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  gridInitial: { color: colors.primaryDark, fontWeight: '900', fontSize: 16 },
  gridTitle: { ...typography.subheading, color: colors.text },
  gridDescription: { ...typography.caption, color: colors.textSecondary, fontWeight: '500', lineHeight: 16 },

  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  summaryCard: { width: '48%', padding: spacing.md, gap: 2 },
  summaryValue: { color: colors.primaryDeep, fontSize: 24, fontWeight: '900' },
  summaryLabel: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 4 },
  summaryHelper: { color: colors.textMuted, fontSize: 11, lineHeight: 14, marginTop: 2 },

  chartTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chartLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', width: 92 },
  chartTrack: { flex: 1, height: 10, backgroundColor: colors.surfaceMuted, borderRadius: radii.pill, overflow: 'hidden' },
  chartFill: { height: '100%', backgroundColor: colors.primary, borderRadius: radii.pill },
  chartValue: { color: colors.text, fontSize: 12, fontWeight: '900', minWidth: 28, textAlign: 'right' },

  error: { color: colors.danger, fontSize: 13, marginBottom: spacing.sm },
});
