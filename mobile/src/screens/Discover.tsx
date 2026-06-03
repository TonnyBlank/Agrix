import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { type AppRole } from '../config/navigation';
import { apiFetch } from '../lib/api';

type RecordRow = Record<string, unknown>;
type Draft = {
  open: boolean;
  product_id: string;
  quantity_offered: string;
  price_per_unit: string;
  notes: string;
};

export function DiscoverScreen({ role }: { role: AppRole | null }) {
  const [companies, setCompanies] = useState<RecordRow[]>([]);
  const [farmers, setFarmers] = useState<RecordRow[]>([]);
  const [requests, setRequests] = useState<RecordRow[]>([]);
  const [myProducts, setMyProducts] = useState<RecordRow[]>([]);
  const [query, setQuery] = useState('');
  const [county, setCounty] = useState('all');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isFarmer = role === 'farmer_free' || role === 'farmer_pro';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const suffix = query.trim() ? `?search=${encodeURIComponent(query.trim())}` : '';
      const farmersSuffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
      const [companiesData, farmersData, requestsData, productsData] = await Promise.all([
        apiFetch<unknown>(isFarmer ? `/farmer/companies${suffix}` : `/companies${suffix}`).catch(() => []),
        apiFetch<unknown>(`/profiles/farmers${farmersSuffix}`).catch(() => []),
        apiFetch<unknown>(`/farmer/procurement${suffix}`).catch(() => []),
        isFarmer ? apiFetch<unknown>('/products/mine').catch(() => []) : Promise.resolve([]),
      ]);
      setCompanies(rows(companiesData));
      setFarmers(rows(farmersData));
      setRequests(rows(requestsData));
      setMyProducts(rows(productsData).filter((product) => product.is_available !== false));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load discovery.');
    } finally {
      setLoading(false);
    }
  }, [isFarmer, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const productById = useMemo(() => new Map(myProducts.map((product) => [firstText(product, ['id']), product])), [myProducts]);
  const counties = useMemo(() => {
    const values = new Set<string>();
    companies.forEach((company) => arrayValues(company.service_areas).forEach((item) => values.add(item)));
    farmers.forEach((farmer) => firstText(farmer, ['county']) && values.add(firstText(farmer, ['county'])));
    requests.forEach((request) => firstText(request, ['target_county']) && values.add(firstText(request, ['target_county'])));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [companies, farmers, requests]);

  const filteredCompanies = companies.filter((company) => county === 'all' || arrayValues(company.service_areas).includes(county));
  const filteredFarmers = farmers.filter((farmer) => county === 'all' || firstText(farmer, ['county']) === county);
  const filteredRequests = requests.filter((request) => county === 'all' || firstText(request, ['target_county']) === county);

  const openDraft = (requestId: string) => {
    const firstProduct = myProducts[0];
    const productId = firstText(firstProduct || {}, ['id']);
    setDrafts((current) => ({
      ...current,
      [requestId]: current[requestId]
        ? { ...current[requestId], open: !current[requestId].open }
        : {
            open: true,
            product_id: productId,
            quantity_offered: '',
            price_per_unit: firstText(firstProduct || {}, ['price_per_unit']),
            notes: '',
          },
    }));
  };

  const updateDraft = (requestId: string, update: Partial<Draft>) => {
    setDrafts((current) => {
      const existing: Draft = current[requestId] || {
        open: true,
        product_id: '',
        quantity_offered: '',
        price_per_unit: '',
        notes: '',
      };
      return {
        ...current,
        [requestId]: { ...existing, ...update },
      };
    });
  };

  const submitResponse = async (requestItem: RecordRow) => {
    const requestId = firstText(requestItem, ['id']);
    const draft = drafts[requestId];
    if (!requestId || !draft?.product_id) {
      Alert.alert('Product needed', 'Choose one of your listed products.');
      return;
    }
    const quantity = Number(draft.quantity_offered);
    const price = Number(draft.price_per_unit);
    const selectedProduct = productById.get(draft.product_id);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) {
      Alert.alert('Check offer', 'Enter a valid quantity and price.');
      return;
    }
    if (selectedProduct && quantity > getNumber(selectedProduct, ['stock'])) {
      Alert.alert('Stock too low', 'Quantity offered exceeds your listed stock.');
      return;
    }
    setBusyId(requestId);
    try {
      await apiFetch(`/farmer/procurement/${requestId}/responses`, {
        method: 'POST',
        body: { product_id: draft.product_id, quantity_offered: quantity, price_per_unit: price, notes: draft.notes.trim() || null },
      });
      setDrafts((current) => ({ ...current, [requestId]: { ...draft, open: false } }));
      await load();
      Alert.alert('Offer sent', 'Your offer was submitted to the company.');
    } catch (requestError) {
      Alert.alert('Offer not sent', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const withdrawResponse = async (requestId: string, responseId: string) => {
    setBusyId(responseId);
    try {
      await apiFetch(`/farmer/procurement/${requestId}/responses/${responseId}/withdraw`, { method: 'POST' });
      await load();
      Alert.alert('Offer withdrawn', 'Your procurement offer was withdrawn.');
    } catch (requestError) {
      Alert.alert('Could not withdraw', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.heroPanel}>
        <Text style={styles.panelLabel}>NETWORK DISCOVERY</Text>
        <Text style={styles.bigName}>Find trade partners</Text>
        <Text style={styles.panelNote}>Search companies, farmers, and procurement requests by county.</Text>
      </View>

      <TextInput placeholder="Search by company, county, crop, or farmer" placeholderTextColor="#7a8276" value={query} onChangeText={setQuery} onSubmitEditing={load} style={styles.input} />
      <View style={styles.buttonRow}>
        <Pressable onPress={() => setCounty('all')} style={[styles.chip, county === 'all' && styles.chipActive]}>
          <Text style={[styles.chipText, county === 'all' && styles.chipTextActive]}>All counties</Text>
        </Pressable>
        {counties.slice(0, 10).map((item) => (
          <Pressable key={item} onPress={() => setCounty(item)} style={[styles.chip, county === item && styles.chipActive]}>
            <Text style={[styles.chipText, county === item && styles.chipTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={load} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>{loading ? 'Loading...' : 'Refresh discovery'}</Text>
      </Pressable>
      {error ? <StateMessage title="Could not load discovery" detail={error} /> : null}

      <SectionTitle title="Companies" count={filteredCompanies.length} />
      {filteredCompanies.slice(0, 8).map((company, index) => (
        <View key={`company-${firstText(company, ['id']) || index}`} style={styles.actionCard}>
          <Text style={styles.cardTitle}>{recordTitle(company)}</Text>
          <Text style={styles.cardDetail}>{firstText(company, ['bio', 'company_type']) || 'Company profile'}</Text>
          <Text style={styles.rowMeta}>{arrayValues(company.service_areas).join(', ') || firstText(company, ['headquarters_location']) || 'Coverage not set'}</Text>
        </View>
      ))}

      <SectionTitle title="Farmers" count={filteredFarmers.length} />
      {filteredFarmers.slice(0, 8).map((farmer, index) => (
        <View key={`farmer-${firstText(farmer, ['user_id', 'id']) || index}`} style={styles.actionCard}>
          <Text style={styles.cardTitle}>{recordTitle(farmer)}</Text>
          <Text style={styles.cardDetail}>{arrayValues(farmer.main_crops).join(', ') || firstText(farmer, ['bio']) || 'Farmer profile'}</Text>
          <Text style={styles.rowMeta}>{firstText(farmer, ['county']) || 'County not set'}</Text>
        </View>
      ))}

      <SectionTitle title="Procurement" count={filteredRequests.length} />
      {filteredRequests.map((requestItem, index) => {
        const requestId = firstText(requestItem, ['id']) || `${index}`;
        const draft = drafts[requestId];
        const responses = rows(requestItem.my_responses);
        return (
          <View key={`request-${requestId}`} style={styles.actionCard}>
            <Text style={styles.cardTitle}>{recordTitle(requestItem)}</Text>
            <Text style={styles.cardDetail}>
              {firstText(requestItem, ['quantity_needed']) || '-'} {firstText(requestItem, ['unit']) || 'kg'} needed in {firstText(requestItem, ['target_county']) || 'Kenya'}.
            </Text>
            <View style={styles.metricLine}>
              <Text style={styles.metricChip}>{firstText(requestItem, ['status']) || 'open'}</Text>
              <Text style={styles.metricChip}>{firstText(requestItem, ['needed_by']) || 'Date open'}</Text>
            </View>
            {isFarmer ? (
              <>
                <Pressable onPress={() => openDraft(requestId)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>{draft?.open ? 'Close offer' : 'Respond with product'}</Text>
                </Pressable>
                {draft?.open ? (
                  <View style={styles.subPanel}>
                    <Text style={styles.inputLabel}>Product</Text>
                    <View style={styles.buttonRow}>
                      {myProducts.map((product) => {
                        const productId = firstText(product, ['id']);
                        return (
                          <Pressable key={productId} onPress={() => updateDraft(requestId, { product_id: productId, price_per_unit: firstText(product, ['price_per_unit']) })} style={[styles.chip, draft.product_id === productId && styles.chipActive]}>
                            <Text style={[styles.chipText, draft.product_id === productId && styles.chipTextActive]}>{recordTitle(product)}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <TextInput keyboardType="numeric" placeholder="Quantity offered" placeholderTextColor="#7a8276" value={draft.quantity_offered} onChangeText={(value) => updateDraft(requestId, { quantity_offered: value })} style={styles.input} />
                    <TextInput keyboardType="numeric" placeholder="Price per unit" placeholderTextColor="#7a8276" value={draft.price_per_unit} onChangeText={(value) => updateDraft(requestId, { price_per_unit: value })} style={styles.input} />
                    <TextInput placeholder="Notes" placeholderTextColor="#7a8276" value={draft.notes} onChangeText={(value) => updateDraft(requestId, { notes: value })} style={[styles.input, styles.textArea]} multiline />
                    <Pressable onPress={() => submitResponse(requestItem)} disabled={busyId === requestId} style={styles.primaryButton}>
                      <Text style={styles.primaryButtonText}>{busyId === requestId ? 'Sending...' : 'Submit offer'}</Text>
                    </Pressable>
                  </View>
                ) : null}
                {responses.map((response, responseIndex) => {
                  const responseId = firstText(response, ['id']) || `${responseIndex}`;
                  return (
                    <View key={responseId} style={styles.subPanel}>
                      <Text style={styles.cardDetail}>Your offer: {firstText(response, ['quantity_offered'])} at {formatMoney(getNumber(response, ['price_per_unit']))}</Text>
                      <Text style={styles.rowMeta}>{firstText(response, ['status']) || 'submitted'}</Text>
                      <Pressable onPress={() => withdrawResponse(requestId, responseId)} disabled={busyId === responseId} style={styles.dangerButtonSmall}>
                        <Text style={styles.dangerButtonText}>Withdraw</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.countText}>{count}</Text>
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
  const keys = ['companies', 'farmers', 'requests', 'products', 'responses', 'data'];
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

function arrayValues(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function recordTitle(record: RecordRow) {
  return firstText(record, ['title', 'name', 'full_name', 'company_name', 'product_name', 'crop_name']) || 'Record';
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

const styles = StyleSheet.create({
  screen: { gap: 14 },
  heroPanel: { backgroundColor: '#203d2b', borderRadius: 8, gap: 8, padding: 18 },
  panelLabel: { color: '#cfe4d0', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  bigName: { color: '#ffffff', fontSize: 26, fontWeight: '900' },
  panelNote: { color: '#e8f1e7', fontSize: 14, lineHeight: 20 },
  input: { backgroundColor: '#ffffff', borderColor: '#d9e2d2', borderRadius: 8, borderWidth: 1, color: '#173421', fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  actionCard: { backgroundColor: '#ffffff', borderColor: '#dfe5d8', borderRadius: 8, borderWidth: 1, gap: 10, padding: 14 },
  cardTitle: { color: '#173421', fontSize: 16, fontWeight: '900' },
  cardDetail: { color: '#52604e', fontSize: 13, lineHeight: 19 },
  rowMeta: { color: '#7a8276', fontSize: 12, fontWeight: '800' },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { color: '#173421', fontSize: 20, fontWeight: '900' },
  countText: { backgroundColor: '#edf4e9', borderRadius: 999, color: '#31523b', fontSize: 12, fontWeight: '900', paddingHorizontal: 10, paddingVertical: 5 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#eef4ea', borderColor: '#dfe8d8', borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  chipActive: { backgroundColor: '#14532d', borderColor: '#14532d' },
  chipText: { color: '#31523b', fontSize: 12, fontWeight: '900' },
  chipTextActive: { color: '#ffffff' },
  primaryButton: { alignItems: 'center', backgroundColor: '#14532d', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12 },
  primaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', backgroundColor: '#eef4ea', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11 },
  secondaryButtonText: { color: '#14532d', fontSize: 13, fontWeight: '900' },
  dangerButtonSmall: { alignItems: 'center', backgroundColor: '#fee2e2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  dangerButtonText: { color: '#991b1b', fontSize: 13, fontWeight: '900' },
  metricLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricChip: { backgroundColor: '#edf4e9', borderRadius: 999, color: '#31523b', fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 6 },
  subPanel: { backgroundColor: '#f7faf4', borderColor: '#e2eadb', borderRadius: 8, borderWidth: 1, gap: 8, padding: 12 },
  inputLabel: { color: '#52604e', fontSize: 12, fontWeight: '900' },
  statePanel: { backgroundColor: '#eef4ea', borderRadius: 8, gap: 6, padding: 14 },
  stateTitle: { color: '#173421', fontSize: 16, fontWeight: '900' },
  stateDetail: { color: '#52604e', fontSize: 13, lineHeight: 19 },
});
