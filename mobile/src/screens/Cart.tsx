import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { apiFetch } from '../lib/api';

type RecordRow = Record<string, unknown>;

export function CartScreen() {
  const [items, setItems] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(extractRows(await apiFetch<unknown>('/cart')) as RecordRow[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load cart.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const removeItem = async (item: RecordRow) => {
    const id = firstText(item, ['id']);
    if (!id) return;
    setBusyId(id);
    try {
      await apiFetch(`/cart/${id}`, { method: 'DELETE' });
      await load();
    } catch (requestError) {
      Alert.alert('Could not remove item', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const placeOrder = async (item: RecordRow) => {
    const product = nestedRecord(item, 'product') || nestedRecord(item, 'products') || item;
    const productId = firstText(item, ['product_id']) || firstText(product, ['id']);
    if (!productId) {
      Alert.alert('Product missing', 'This cart item is missing its product reference.');
      return;
    }
    const itemId = firstText(item, ['id']);
    setBusyId(itemId || productId);
    try {
      await apiFetch('/orders', {
        method: 'POST',
        body: {
          product_id: productId,
          quantity: getNumber(item, ['quantity']) || 1,
          unit: firstText(item, ['unit']) || firstText(product, ['unit']) || 'kg',
          notes: firstText(item, ['notes']),
        },
      });
      if (itemId) {
        await apiFetch(`/cart/${itemId}`, { method: 'DELETE' }).catch(() => undefined);
      }
      await load();
      Alert.alert('Order placed', 'Your order has been sent to the seller.');
    } catch (requestError) {
      Alert.alert('Could not place order', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const total = items.reduce((sum, item) => {
    const product = nestedRecord(item, 'product');
    const price = getNumber(product || item, ['price_per_unit', 'price']);
    const quantity = getNumber(item, ['quantity']);
    return sum + price * quantity;
  }, 0);

  if (loading) return <StateMessage title="Loading" detail="Loading your cart..." />;
  if (error) {
    return (
      <View style={styles.screen}>
        <StateMessage title="Could not load cart" detail={error} />
        <Pressable onPress={load} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.totalPanel}>
        <Text style={styles.panelLabel}>CART TOTAL</Text>
        <Text style={styles.totalText}>{formatMoney(total)}</Text>
        <Text style={styles.panelNote}>{items.length} item{items.length === 1 ? '' : 's'} selected for checkout</Text>
      </View>
      {items.length === 0 ? (
        <StateMessage title="Cart is empty" detail="Open Marketplace, choose a product, then add it to the cart." />
      ) : (
        items.map((item, index) => {
          const product = nestedRecord(item, 'product') || nestedRecord(item, 'products') || item;
          const id = firstText(item, ['id']) || `${index}`;
          return (
            <View key={id} style={styles.actionCard}>
              <Text style={styles.cardTitle}>{recordTitle(product)}</Text>
              <Text style={styles.cardDetail}>
                Quantity: {firstText(item, ['quantity']) || '1'} {firstText(item, ['unit']) || firstText(product, ['unit'])}
              </Text>
              <Pressable onPress={() => removeItem(item)} disabled={busyId === id} style={styles.dangerButtonSmall}>
                <Text style={styles.dangerButtonText}>{busyId === id ? 'Removing...' : 'Remove'}</Text>
              </Pressable>
              <Pressable onPress={() => placeOrder(item)} disabled={busyId === id} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{busyId === id ? 'Working...' : 'Place order'}</Text>
              </Pressable>
            </View>
          );
        })
      )}
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

function recordTitle(record: RecordRow) {
  return (
    firstText(record, ['title', 'name', 'full_name', 'company_name', 'product_name', 'product_title', 'crop_name']) ||
    firstText(record, ['status']) ||
    'Record'
  );
}

function nestedRecord(record: RecordRow, key: string) {
  const value = record[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordRow) : null;
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

const styles = StyleSheet.create({
  screen: { gap: 14 },
  totalPanel: {
    backgroundColor: '#203d2b',
    borderRadius: 8,
    padding: 18,
  },
  panelLabel: {
    color: '#cfe4d0',
    fontSize: 13,
    fontWeight: '900',
  },
  totalText: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '900',
    marginTop: 8,
  },
  panelNote: {
    color: '#e8f1e7',
    fontSize: 14,
    marginTop: 7,
  },
  actionCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  cardTitle: {
    color: '#162016',
    fontSize: 16,
    fontWeight: '900',
  },
  cardDetail: {
    color: '#687365',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2f6b3f',
    borderRadius: 8,
    height: 52,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  dangerButtonSmall: {
    alignItems: 'center',
    backgroundColor: '#fff1ef',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 14,
  },
  dangerButtonText: {
    color: '#a13b2f',
    fontSize: 15,
    fontWeight: '900',
  },
  statePanel: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
  },
  stateTitle: {
    color: '#162016',
    fontSize: 18,
    fontWeight: '900',
  },
  stateDetail: {
    color: '#687365',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
});
