import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  type AppRole,
  type MobileRoute,
  type MobileRouteKey,
  isAdminRole,
} from '../config/navigation';
import { apiFetch } from '../lib/api';

type RecordRow = Record<string, unknown>;

type Profile = {
  full_name?: string | null;
  county?: string | null;
};

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
  notifications: 'Important account, order, loan, and admin updates.',
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
  adminOverview: 'Platform summary for users, orders, loans, and reviews.',
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
    <View style={styles.screen}>
      <View style={styles.heroPanel}>
        <Text style={styles.panelLabel}>{formatRole(role).toUpperCase()}</Text>
        <Text style={styles.bigName}>{profile?.full_name || 'AgriLink User'}</Text>
        <Text style={styles.panelNote}>
          {profile?.county || 'Set your county'} - Your workspace is synced across AgriLink X.
        </Text>
      </View>

      <DashboardSummary role={role} />

      <View style={styles.quickActions}>
        {getQuickActions(role).map((action, index) => (
          <Pressable
            key={action.key}
            onPress={() => setActiveKey(action.key)}
            style={index === 0 ? styles.quickButton : styles.quickButtonLight}
          >
            <Text style={index === 0 ? styles.quickButtonText : styles.quickButtonLightText}>{action.label}</Text>
          </Pressable>
        ))}
      </View>

      {Object.entries(grouped).map(([section, items]) => (
        <View key={section}>
          <Text style={styles.sectionTitle}>{section}</Text>
          <View style={styles.grid}>
            {items.map((route) => (
              <Pressable key={route.key} onPress={() => setActiveKey(route.key)} style={styles.gridButton}>
                <View style={styles.gridIcon}>
                  <Text style={styles.gridInitial}>{route.title.slice(0, 1)}</Text>
                </View>
                <Text style={styles.gridText}>{route.title}</Text>
                <Text style={styles.gridDescription}>
                  {routeDescriptions[route.key] || 'Open this AgriLink X tool.'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function DashboardSummary({ role }: { role: AppRole | null }) {
  const [summary, setSummary] = useState({
    revenue: 0,
    products: 0,
    pendingOrders: 0,
    unreadMessages: 0,
    notifications: 0,
    loansValue: 0,
    users: 0,
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
        const orderRows = extractRows(orders) as RecordRow[];
        setSummary({
          revenue: orderRows.reduce((sum, order) => sum + getNumber(order, ['total_price', 'total_amount']), 0),
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

      const orderRows = [...extractRows(sellingOrders), ...extractRows(buyingOrders)];
      const sellingRows = extractRows(sellingOrders) as RecordRow[];
      const pendingOrders = orderRows.filter((row) => {
        if (!row || typeof row !== 'object') return false;
        const status = String((row as Record<string, unknown>).status || '').toLowerCase();
        return !['delivered', 'completed', 'cancelled', 'failed'].includes(status);
      }).length;
      const revenue = sellingRows.reduce((sum, order) => {
        const status = firstText(order, ['payment_status']);
        if (status && !['paid', 'released', 'initiated'].includes(status)) return sum;
        return sum + getNumber(order, ['seller_payout_amount', 'total_price', 'total_amount', 'amount']);
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
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load dashboard summary.');
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = [
    {
      label: isAdminRole(role) ? 'Platform Revenue' : 'Revenue This Week',
      value: summary.revenue,
      display: formatMoney(summary.revenue),
      helper: role === 'company' ? 'Company order value' : isAdminRole(role) ? 'Tracked order value' : 'From recent selling orders',
    },
    {
      label: role === 'company' ? 'Products' : 'Active Listings',
      value: summary.products,
      display: String(summary.products),
      helper: role === 'company' ? 'Company catalogue' : 'Visible to buyers',
    },
    { label: isAdminRole(role) ? 'Orders' : 'Pending Orders', value: summary.pendingOrders, display: String(summary.pendingOrders), helper: 'Need follow-up' },
    { label: isAdminRole(role) ? 'Users' : 'Messages', value: isAdminRole(role) ? summary.users : summary.unreadMessages, display: String(isAdminRole(role) ? summary.users : summary.unreadMessages), helper: isAdminRole(role) ? 'Platform accounts' : 'Conversations' },
    { label: isAdminRole(role) ? 'Loan Value' : 'Notifications', value: isAdminRole(role) ? summary.loansValue : summary.notifications, display: isAdminRole(role) ? formatMoney(summary.loansValue) : String(summary.notifications), helper: isAdminRole(role) ? 'Approved financing' : 'Latest updates' },
  ];

  return (
    <View style={styles.summaryWrap}>
      <View style={styles.summaryHeader}>
        <Text style={styles.sectionTitle}>Summary</Text>
        <Pressable onPress={load} style={styles.refreshButton}>
          <Text style={styles.refreshButtonText}>{loading ? 'Loading' : 'Refresh'}</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.inlineError}>{error}</Text> : null}
      <View style={styles.summaryGrid}>
        {items.map((item) => (
          <View key={item.label} style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{loading ? '--' : item.display}</Text>
            <Text style={styles.summaryLabel}>{item.label}</Text>
            <Text style={styles.summaryHelper}>{item.helper}</Text>
          </View>
        ))}
      </View>
      <MiniBarChart items={items.map((item) => ({ label: item.label, value: item.value }))} loading={loading} />
    </View>
  );
}

function getQuickActions(role: AppRole | null): Array<{ key: MobileRouteKey; label: string }> {
  if (isAdminRole(role)) {
    return [
      { key: 'adminOverview', label: 'Platform Summary' },
      { key: 'adminLoanDecisions', label: 'Loan Reviews' },
      { key: 'adminCompanies', label: 'Company Reviews' },
      { key: 'adminVerifications', label: 'ID Checks' },
    ];
  }

  if (role === 'company') {
    return [
      { key: 'companyProcurement', label: 'Procurement' },
      { key: 'companyProducts', label: 'Products' },
      { key: 'companyOrders', label: 'Orders' },
      { key: 'messages', label: 'Messages' },
    ];
  }

  return [
    { key: 'products', label: 'Add Listing' },
    { key: 'microLoans', label: 'Loans' },
    { key: 'scanner', label: 'AI Scanner' },
    { key: 'orders', label: 'Orders' },
  ];
}

function MiniBarChart({ items, loading }: { items: Array<{ label: string; value: number }>; loading: boolean }) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);
  return (
    <View style={styles.chartPanel}>
      <Text style={styles.chartTitle}>Activity Graph</Text>
      {items.map((item) => (
        <View key={`chart-${item.label}`} style={styles.chartRow}>
          <Text style={styles.chartLabel} numberOfLines={1}>{item.label}</Text>
          <View style={styles.chartTrack}>
            <View style={[styles.chartFill, { width: loading ? '18%' : `${Math.max(8, (item.value / maxValue) * 100)}%` }]} />
          </View>
          <Text style={styles.chartValue}>{loading ? '--' : item.value}</Text>
        </View>
      ))}
    </View>
  );
}

function extractRows(data: unknown): unknown[] {
  const value = unwrapData(data);
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return [value];
  return [];
}

function unwrapData(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const record = data as Record<string, unknown>;
  const keys = ['products', 'orders', 'requests', 'responses', 'partners', 'companies', 'notifications', 'conversations', 'applications', 'profile', 'company'];
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return data;
}

function firstText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function getNumber(record: RecordRow, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return 0;
}

function formatMoney(value: number) {
  return `KES ${Math.round(value).toLocaleString('en-KE')}`;
}

function formatRole(role: AppRole | null) {
  if (role === 'farmer_pro') return 'Farmer Pro';
  if (role === 'farmer_free') return 'Free';
  if (role === 'company') return 'Company';
  if (isAdminRole(role)) return 'Admin';
  return 'Free';
}

const styles = StyleSheet.create({
  screen: {
    gap: 14,
  },
  heroPanel: {
    backgroundColor: '#203d2b',
    borderRadius: 8,
    padding: 18,
  },
  panelLabel: {
    color: '#cfe4d0',
    fontSize: 13,
    fontWeight: '900',
  },
  bigName: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 8,
  },
  panelNote: {
    color: '#e8f1e7',
    fontSize: 14,
    marginTop: 7,
  },
  sectionTitle: {
    color: '#162016',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 10,
    marginTop: 4,
  },
  summaryWrap: {
    gap: 10,
  },
  summaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  refreshButton: {
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshButtonText: {
    color: '#2f6b3f',
    fontSize: 12,
    fontWeight: '900',
  },
  inlineError: {
    color: '#a13b2f',
    fontSize: 13,
    lineHeight: 18,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 106,
    padding: 14,
    width: '48%',
  },
  summaryValue: {
    color: '#203d2b',
    fontSize: 28,
    fontWeight: '900',
  },
  summaryLabel: {
    color: '#162016',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 5,
  },
  summaryHelper: {
    color: '#687365',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
  },
  chartPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  chartTitle: {
    color: '#162016',
    fontSize: 14,
    fontWeight: '900',
  },
  chartRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  chartLabel: {
    color: '#687365',
    fontSize: 11,
    fontWeight: '800',
    width: 88,
  },
  chartTrack: {
    backgroundColor: '#eef2ea',
    borderRadius: 8,
    flex: 1,
    height: 12,
    overflow: 'hidden',
  },
  chartFill: {
    backgroundColor: '#2f6b3f',
    borderRadius: 8,
    height: '100%',
  },
  chartValue: {
    color: '#203d2b',
    fontSize: 12,
    fontWeight: '900',
    minWidth: 24,
    textAlign: 'right',
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickButton: {
    alignItems: 'center',
    backgroundColor: '#2f6b3f',
    borderRadius: 8,
    height: 52,
    justifyContent: 'center',
    minWidth: '48%',
    paddingHorizontal: 10,
  },
  quickButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  quickButtonLight: {
    alignItems: 'center',
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    height: 52,
    justifyContent: 'center',
    minWidth: '48%',
    paddingHorizontal: 10,
  },
  quickButtonLightText: {
    color: '#2f6b3f',
    fontSize: 14,
    fontWeight: '900',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    minHeight: 142,
    padding: 12,
    width: '48%',
  },
  gridIcon: {
    alignItems: 'center',
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  gridInitial: {
    color: '#2f6b3f',
    fontSize: 18,
    fontWeight: '900',
  },
  gridText: {
    color: '#162016',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  gridDescription: {
    color: '#687365',
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
});
