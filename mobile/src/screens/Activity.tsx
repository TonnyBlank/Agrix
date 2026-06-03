import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { type AppRole, isAdminRole } from '../config/navigation';
import { apiFetch } from '../lib/api';

type RecordRow = Record<string, unknown>;

type TimelineItem = {
  id: string;
  title: string;
  detail: string;
  at: string;
  lane: 'orders' | 'catalog' | 'network' | 'admin' | 'finance';
};

export function ActivityScreen({ role }: { role: AppRole | null }) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isAdminRole(role)) {
        const [companies, users, orders, loans] = await Promise.all([
          apiFetch<unknown>('/admin/companies?status=all').catch(() => []),
          apiFetch<unknown>('/admin/users').catch(() => []),
          apiFetch<unknown>('/admin/orders').catch(() => []),
          apiFetch<unknown>('/admin/loans').catch(() => []),
        ]);
        setItems([
          ...rows(companies).map((company, index) => ({
            id: `admin-company-${firstText(company, ['id']) || index}`,
            title: `Company ${firstText(company, ['verification_status']) || 'review'}`,
            detail: `${recordTitle(company)} entered the company review pipeline.`,
            at: firstText(company, ['created_at', 'updated_at']),
            lane: 'admin' as const,
          })),
          ...rows(users).map((user, index) => ({
            id: `admin-user-${firstText(user, ['user_id', 'id']) || index}`,
            title: 'User role snapshot',
            detail: `${recordTitle(user)} is assigned to ${firstText(user, ['role']) || 'farmer_free'}.`,
            at: firstText(user, ['updated_at', 'created_at', 'last_sign_in_at']),
            lane: 'admin' as const,
          })),
          ...rows(orders).map((order, index) => ({
            id: `admin-order-${firstText(order, ['id']) || index}`,
            title: `Order ${firstText(order, ['status']) || 'pending'}`,
            detail: `${formatMoney(getNumber(order, ['total_amount', 'total_price']))} - payment ${firstText(order, ['payment_status']) || 'unknown'}.`,
            at: firstText(order, ['updated_at', 'created_at']),
            lane: 'orders' as const,
          })),
          ...rows(loans).map((loan, index) => ({
            id: `admin-loan-${firstText(loan, ['id']) || index}`,
            title: `Loan ${firstText(loan, ['status']) || 'review'}`,
            detail: `${recordTitle(loan)} - ${formatMoney(getNumber(loan, ['approved_amount', 'requested_amount']))}.`,
            at: firstText(loan, ['updated_at', 'created_at']),
            lane: 'finance' as const,
          })),
        ]);
        return;
      }

      if (role === 'company') {
        const [products, partners, requests, orders] = await Promise.all([
          apiFetch<unknown>('/companies/me/products').catch(() => []),
          apiFetch<unknown>('/companies/me/partners').catch(() => []),
          apiFetch<unknown>('/companies/me/procurement').catch(() => []),
          apiFetch<unknown>('/companies/me/orders').catch(() => []),
        ]);
        setItems([
          ...rows(orders).map((order, index) => ({
            id: `company-order-${firstText(order, ['id']) || index}`,
            title: `Company order ${firstText(order, ['status']) || 'active'}`,
            detail: `${formatMoney(getNumber(order, ['total_amount', 'total_price']))} order value.`,
            at: firstText(order, ['updated_at', 'created_at']),
            lane: 'orders' as const,
          })),
          ...rows(products).map((product, index) => ({
            id: `company-product-${firstText(product, ['id']) || index}`,
            title: recordTitle(product),
            detail: `${firstText(product, ['stock']) || '0'} units are recorded in stock.`,
            at: firstText(product, ['updated_at', 'created_at']),
            lane: 'catalog' as const,
          })),
          ...rows(partners).map((partner, index) => ({
            id: `company-partner-${firstText(partner, ['id']) || index}`,
            title: 'Farmer partner',
            detail: `${recordTitle(nestedRecord(partner, 'farmer_profile') || partner)} is in your sourcing network.`,
            at: firstText(partner, ['updated_at', 'created_at']),
            lane: 'network' as const,
          })),
          ...rows(requests).map((request, index) => ({
            id: `company-request-${firstText(request, ['id']) || index}`,
            title: `Procurement ${firstText(request, ['status']) || 'open'}`,
            detail: `${firstText(request, ['quantity_needed']) || '-'} ${firstText(request, ['unit']) || 'kg'} needed in ${firstText(request, ['target_county']) || 'Kenya'}.`,
            at: firstText(request, ['updated_at', 'created_at']),
            lane: 'network' as const,
          })),
        ]);
        return;
      }

      const [products, sellingOrders, buyingOrders, loanApplications] = await Promise.all([
        apiFetch<unknown>('/products/mine').catch(() => []),
        apiFetch<unknown>('/orders/selling').catch(() => []),
        apiFetch<unknown>('/orders/buying').catch(() => []),
        apiFetch<unknown>('/micro-loans/applications').catch(() => []),
      ]);
      setItems([
        ...rows(products).map((product, index) => ({
          id: `product-${firstText(product, ['id']) || index}`,
          title: recordTitle(product),
          detail: `${firstText(product, ['stock']) || '0'} ${firstText(product, ['unit']) || 'units'} listed for buyers.`,
          at: firstText(product, ['updated_at', 'created_at']),
          lane: 'catalog' as const,
        })),
        ...rows(sellingOrders).map((order, index) => ({
          id: `selling-order-${firstText(order, ['id']) || index}`,
          title: `Selling order ${firstText(order, ['status']) || 'pending'}`,
          detail: `${formatMoney(getNumber(order, ['seller_payout_amount', 'total_amount', 'total_price']))} expected value.`,
          at: firstText(order, ['updated_at', 'created_at']),
          lane: 'orders' as const,
        })),
        ...rows(buyingOrders).map((order, index) => ({
          id: `buying-order-${firstText(order, ['id']) || index}`,
          title: `Buying order ${firstText(order, ['status']) || 'pending'}`,
          detail: `${formatMoney(getNumber(order, ['total_amount', 'total_price']))} checkout value.`,
          at: firstText(order, ['updated_at', 'created_at']),
          lane: 'orders' as const,
        })),
        ...rows(loanApplications).map((loan, index) => ({
          id: `loan-${firstText(loan, ['id']) || index}`,
          title: `Loan ${firstText(loan, ['status']) || 'application'}`,
          detail: `${recordTitle(loan)} - ${formatMoney(getNumber(loan, ['approved_amount', 'requested_amount']))}.`,
          at: firstText(loan, ['updated_at', 'created_at']),
          lane: 'finance' as const,
        })),
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load activity.');
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sorted = [...items].sort((left, right) => timestamp(right.at) - timestamp(left.at));
    if (!needle) return sorted;
    return sorted.filter((item) => `${item.title} ${item.detail} ${item.lane}`.toLowerCase().includes(needle));
  }, [items, query]);

  return (
    <View style={styles.screen}>
      <View style={styles.heroPanel}>
        <Text style={styles.panelLabel}>ACTIVITY</Text>
        <Text style={styles.bigName}>Timeline</Text>
        <Text style={styles.panelNote}>Recent actions across orders, listings, finance, procurement, and admin reviews.</Text>
      </View>
      <TextInput placeholder="Search activity" placeholderTextColor="#7a8276" value={query} onChangeText={setQuery} style={styles.input} />
      <View style={styles.buttonRow}>
        <Pressable onPress={load} style={styles.secondaryButtonCompact}>
          <Text style={styles.secondaryButtonText}>{loading ? 'Refreshing...' : 'Refresh'}</Text>
        </Pressable>
        <Text style={styles.countText}>{filtered.length} events</Text>
      </View>
      {error ? <StateMessage title="Could not load activity" detail={error} /> : null}
      {!loading && filtered.length === 0 ? <StateMessage title="No activity yet" detail="Your recent platform actions will appear here." /> : null}
      {filtered.map((item) => (
        <View key={item.id} style={styles.timelineRow}>
          <View style={[styles.timelineDot, styles[`${item.lane}Dot`]]} />
          <View style={styles.actionCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.laneChip}>{labelLane(item.lane)}</Text>
            </View>
            <Text style={styles.cardDetail}>{item.detail}</Text>
            <Text style={styles.rowMeta}>{formatDate(item.at)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function StateMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.statePanel}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateDetail}>{detail}</Text>
    </View>
  );
}

function rows(data: unknown): RecordRow[] {
  const value = unwrapData(data);
  if (Array.isArray(value)) return value.filter((item): item is RecordRow => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
  if (value && typeof value === 'object') return [value as RecordRow];
  return [];
}

function unwrapData(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const record = data as Record<string, unknown>;
  const keys = ['products', 'orders', 'requests', 'partners', 'companies', 'users', 'loans', 'applications', 'data'];
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

function nestedRecord(record: RecordRow, key: string) {
  const value = record[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordRow) : null;
}

function recordTitle(record: RecordRow) {
  return firstText(record, ['title', 'name', 'full_name', 'company_name', 'product_name', 'product_title', 'crop_name']) || 'Record';
}

function getNumber(record: RecordRow, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function formatMoney(value: number) {
  return `KES ${Math.round(value).toLocaleString('en-KE')}`;
}

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string) {
  if (!value) return 'Time not recorded';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
}

function labelLane(lane: TimelineItem['lane']) {
  if (lane === 'catalog') return 'Catalog';
  if (lane === 'network') return 'Network';
  if (lane === 'finance') return 'Finance';
  if (lane === 'admin') return 'Admin';
  return 'Orders';
}

const styles = StyleSheet.create({
  screen: { gap: 14 },
  heroPanel: { backgroundColor: '#203d2b', borderRadius: 8, gap: 8, padding: 18 },
  panelLabel: { color: '#cfe4d0', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  bigName: { color: '#ffffff', fontSize: 26, fontWeight: '900' },
  panelNote: { color: '#e8f1e7', fontSize: 14, lineHeight: 20 },
  input: { backgroundColor: '#ffffff', borderColor: '#d9e2d2', borderRadius: 8, borderWidth: 1, color: '#173421', fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  buttonRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  secondaryButtonCompact: { alignItems: 'center', backgroundColor: '#eef4ea', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  secondaryButtonText: { color: '#14532d', fontSize: 13, fontWeight: '900' },
  countText: { color: '#52604e', fontSize: 12, fontWeight: '900' },
  timelineRow: { flexDirection: 'row', gap: 10 },
  timelineDot: { borderRadius: 999, height: 12, marginTop: 18, width: 12 },
  ordersDot: { backgroundColor: '#2563eb' },
  catalogDot: { backgroundColor: '#16a34a' },
  networkDot: { backgroundColor: '#ca8a04' },
  adminDot: { backgroundColor: '#7c3aed' },
  financeDot: { backgroundColor: '#dc2626' },
  actionCard: { backgroundColor: '#ffffff', borderColor: '#dfe5d8', borderRadius: 8, borderWidth: 1, flex: 1, gap: 8, padding: 14 },
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  cardTitle: { color: '#173421', flex: 1, fontSize: 16, fontWeight: '900' },
  cardDetail: { color: '#52604e', fontSize: 13, lineHeight: 19 },
  laneChip: { backgroundColor: '#edf4e9', borderRadius: 999, color: '#31523b', fontSize: 11, fontWeight: '900', paddingHorizontal: 9, paddingVertical: 5 },
  rowMeta: { color: '#7a8276', fontSize: 12, fontWeight: '800' },
  statePanel: { backgroundColor: '#eef4ea', borderRadius: 8, gap: 6, padding: 14 },
  stateTitle: { color: '#173421', fontSize: 16, fontWeight: '900' },
  stateDetail: { color: '#52604e', fontSize: 13, lineHeight: 19 },
});
