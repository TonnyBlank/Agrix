import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button, Card, EmptyState, Stack } from '../components/ui';
import { apiFetch } from '../lib/api';
import {
  extractRows, firstText, formatMoney, getNumber, nestedRecord, recordTitle,
  type RecordRow,
} from '../lib/records';
import { colors, radii, spacing, typography } from '../theme';

export function CartScreen() {
  const [items, setItems] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(extractRows(await apiFetch<unknown>('/cart')));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load cart.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const removeItem = async (item: RecordRow) => {
    const id = firstText(item, ['id']);
    if (!id) return;
    setBusyId(id);
    try {
      await apiFetch(`/cart/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      Alert.alert('Could not remove item', err instanceof Error ? err.message : 'Try again.');
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
      if (itemId) await apiFetch(`/cart/${itemId}`, { method: 'DELETE' }).catch(() => undefined);
      await load();
      Alert.alert('Order placed', 'Your order has been sent to the seller.');
    } catch (err) {
      Alert.alert('Could not place order', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const total = items.reduce((sum, item) => {
    const product = nestedRecord(item, 'product') || item;
    return sum + getNumber(product, ['price_per_unit', 'price']) * getNumber(item, ['quantity']);
  }, 0);

  if (error) {
    return (
      <Stack gap={spacing.lg}>
        <EmptyState
          title="Could not load cart"
          description={error}
          action={<Button label="Try again" onPress={load} />}
        />
      </Stack>
    );
  }

  return (
    <Stack gap={spacing.lg}>
      <View style={styles.totalCard}>
        <Text style={styles.totalEyebrow}>CART TOTAL</Text>
        <Text style={styles.totalValue}>{formatMoney(total)}</Text>
        <Text style={styles.totalNote}>
          {items.length} item{items.length === 1 ? '' : 's'} ready for checkout
        </Text>
      </View>

      {loading ? (
        <EmptyState title="Loading" description="Fetching your cart…" />
      ) : items.length === 0 ? (
        <EmptyState
          title="Your cart is empty"
          description="Open the Marketplace, pick produce, and add it to your cart to checkout."
        />
      ) : (
        items.map((item, index) => {
          const product = nestedRecord(item, 'product') || nestedRecord(item, 'products') || item;
          const id = firstText(item, ['id']) || `${index}`;
          const qty = firstText(item, ['quantity']) || '1';
          const unit = firstText(item, ['unit']) || firstText(product, ['unit']) || 'kg';
          const price = getNumber(product, ['price_per_unit', 'price']);
          return (
            <Card key={id}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{recordTitle(product)}</Text>
                  <Text style={styles.cardMeta}>{qty} {unit} · {formatMoney(price * Number(qty || 1))}</Text>
                </View>
                <Text style={styles.cardPrice}>{formatMoney(price)}/{unit}</Text>
              </View>
              <View style={styles.actions}>
                <View style={{ flex: 1 }}>
                  <Button
                    fullWidth
                    variant="danger"
                    label={busyId === id ? 'Removing…' : 'Remove'}
                    onPress={() => removeItem(item)}
                    loading={busyId === id}
                  />
                </View>
                <View style={{ flex: 2 }}>
                  <Button
                    fullWidth
                    label={busyId === id ? 'Working…' : 'Place order'}
                    onPress={() => placeOrder(item)}
                    loading={busyId === id}
                  />
                </View>
              </View>
            </Card>
          );
        })
      )}
    </Stack>
  );
}

const styles = StyleSheet.create({
  totalCard: {
    backgroundColor: colors.primaryDeep,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  totalEyebrow: { color: colors.goldSoft, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  totalValue: { color: colors.textInverse, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
  totalNote: { color: colors.primarySoft, fontSize: 14, marginTop: 4 },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardTitle: { ...typography.heading, color: colors.text },
  cardMeta: { ...typography.body, color: colors.textSecondary, marginTop: 2 },
  cardPrice: { ...typography.bodyStrong, color: colors.primary },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
