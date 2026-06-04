import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { Button, Card, Chip, EmptyState, SectionHeader, Stack } from '../components/ui';
import { apiFetch } from '../lib/api';
import {
  extractRows, firstText, formatMoney, getNumber, recordTitle,
  type RecordRow,
} from '../lib/records';
import { colors, radii, spacing, typography } from '../theme';

type MarketplaceProps = { isDark?: boolean };

export function MarketplaceScreen(_props: MarketplaceProps) {
  // The web app sets the dark mode via OS-level theme; for now we keep the
  // mobile palette in light mode for consistency with the rest of the app.
  const [products, setProducts] = useState<RecordRow[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<RecordRow | null>(null);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setProducts(extractRows(await apiFetch<unknown>('/products')));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load marketplace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const addToCart = async (product: RecordRow, quantity = 1) => {
    const id = firstText(product, ['id']);
    if (!id) return;
    setBusyId(id);
    try {
      await apiFetch('/cart', {
        method: 'POST',
        body: {
          product_id: id,
          quantity,
          unit: firstText(product, ['unit']) || 'kg',
          selected_for_checkout: true,
        },
      });
      Alert.alert(
        'Added to cart',
        `${quantity} ${firstText(product, ['unit']) || 'item'} of ${recordTitle(product)} added.`,
      );
    } catch (err) {
      Alert.alert('Could not add to cart', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleLike = (id: string) => {
    setLikedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      const c = firstText(p, ['category']);
      if (c) set.add(c);
    });
    return ['All', ...Array.from(set)];
  }, [products]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products.filter((p) => {
      const hay = [
        recordTitle(p),
        firstText(p, ['category']),
        firstText(p, ['county', 'location']),
        firstText(p, ['description']),
      ].join(' ').toLowerCase();
      const matchSearch = !needle || hay.includes(needle);
      const matchCategory = category === 'All' || firstText(p, ['category']) === category;
      return matchSearch && matchCategory;
    });
  }, [products, search, category]);

  if (error) {
    return (
      <Stack gap={spacing.lg}>
        <EmptyState
          title="Could not load marketplace"
          description={error}
          action={<Button label="Try again" onPress={load} />}
        />
      </Stack>
    );
  }

  return (
    <Stack gap={spacing.lg}>
      <SectionHeader
        eyebrow="Trade"
        title="Marketplace"
        subtitle={loading ? 'Loading produce…' : `${filtered.length} listing${filtered.length === 1 ? '' : 's'} available`}
      />

      <TextInput
        placeholder="Search produce, county, or category"
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
        style={styles.input}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {categories.map((item) => (
          <Chip
            key={item}
            label={item}
            tone="primary"
            active={category === item}
            onPress={() => setCategory(item)}
          />
        ))}
      </ScrollView>

      <ProductMediaModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={addToCart}
        busyId={busyId}
      />

      {loading ? (
        <EmptyState title="Loading" description="Fetching the latest produce…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="New marketplace products will appear here when farmers publish listings."
        />
      ) : (
        <View style={styles.grid}>
          {filtered.map((product, index) => {
            const id = firstText(product, ['id']) || `${index}`;
            const price = getNumber(product, ['price_per_unit', 'price']);
            const stock = getNumber(product, ['stock', 'quantity']);
            const cover = firstText(product, ['cover_image_url', 'image_url', 'photo_url']);
            const video = firstText(product, ['video_url']);
            const liked = likedIds.includes(id);
            return (
              <Card key={id} style={styles.productCard}>
                <Pressable onPress={() => setSelectedProduct(product)} style={styles.thumbWrap}>
                  {cover ? (
                    <Image source={{ uri: cover }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbFallback]}>
                      <Text style={styles.thumbInitial}>{recordTitle(product).slice(0, 1).toUpperCase()}</Text>
                    </View>
                  )}
                  {video ? (
                    <View style={styles.videoBadge}>
                      <Text style={styles.videoBadgeText}>VIDEO</Text>
                    </View>
                  ) : null}
                  {product.is_organic !== false ? (
                    <View style={styles.organicBadge}>
                      <Text style={styles.organicBadgeText}>ORGANIC</Text>
                    </View>
                  ) : null}
                </Pressable>
                <Text style={styles.productTitle} numberOfLines={2}>{recordTitle(product)}</Text>
                <Text style={styles.productMeta} numberOfLines={1}>
                  {[firstText(product, ['category']), firstText(product, ['county', 'location'])]
                    .filter(Boolean)
                    .join(' · ') || 'Marketplace'}
                </Text>
                <Text style={styles.productPrice}>
                  {price ? `${formatMoney(price)}/${firstText(product, ['unit']) || 'unit'}` : 'Price not set'}
                </Text>
                <Text style={styles.productStock}>
                  {stock > 0 ? `${stock} ${firstText(product, ['unit']) || ''} in stock` : 'Out of stock'}
                </Text>
                <View style={styles.cardActions}>
                  <Pressable
                    onPress={() => toggleLike(id)}
                    style={[styles.likeButton, liked && styles.likeButtonActive]}
                  >
                    <Text style={[styles.likeText, liked && styles.likeTextActive]}>
                      {liked ? '♥' : '♡'}
                    </Text>
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Button
                      fullWidth
                      size="sm"
                      label={busyId === id ? '…' : 'Add to cart'}
                      onPress={() => addToCart(product)}
                      loading={busyId === id}
                      disabled={stock <= 0}
                    />
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Stack>
  );
}

function ProductMediaModal({
  product, onClose, onAddToCart, busyId,
}: {
  product: RecordRow | null;
  onClose: () => void;
  onAddToCart: (product: RecordRow, quantity?: number) => Promise<void>;
  busyId: string | null;
}) {
  const [quantity, setQuantity] = useState(1);
  useEffect(() => { setQuantity(1); }, [product]);

  if (!product) return null;
  const id = firstText(product, ['id']);
  const cover = firstText(product, ['cover_image_url', 'image_url', 'photo_url']);
  const video = firstText(product, ['video_url']);
  const price = getNumber(product, ['price_per_unit', 'price']);
  const stock = getNumber(product, ['stock', 'quantity']);
  const seller = firstText(product, ['seller_name', 'farmer_name', 'company_name', 'owner_name']);
  const location = firstText(product, ['county', 'location']);
  const description = firstText(product, ['description', 'details', 'notes']);

  const openLocation = async () => {
    if (!location) {
      Alert.alert('Location missing', 'This product does not have a saved county or location.');
      return;
    }
    await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location}, Kenya`)}`);
  };

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <ScrollView style={styles.modalSheet} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          {cover ? <Image source={{ uri: cover }} style={styles.modalImage} /> : null}
          <Text style={styles.modalTitle}>{recordTitle(product)}</Text>
          <Text style={styles.modalMeta}>
            {[firstText(product, ['category']), location].filter(Boolean).join(' · ') || 'Marketplace listing'}
          </Text>
          {description ? <Text style={styles.modalDescription}>{description}</Text> : null}

          <View style={styles.chipRowWrap}>
            <Chip label={price ? `${formatMoney(price)}/${firstText(product, ['unit']) || 'unit'}` : 'Price not set'} tone="primary" active />
            <Chip label={stock ? `${stock} ${firstText(product, ['unit']) || ''}` : 'No stock'} tone="neutral" />
            <Chip label={product.is_organic === false ? 'Standard' : 'Organic'} tone="success" />
          </View>

          <Card style={{ gap: spacing.sm }}>
            <Text style={styles.fieldLabel}>Quantity</Text>
            <View style={styles.qtyRow}>
              <Pressable onPress={() => setQuantity((c) => Math.max(1, c - 1))} style={styles.qtyButton}>
                <Text style={styles.qtyButtonText}>−</Text>
              </Pressable>
              <Text style={styles.qtyValue}>{quantity}</Text>
              <Pressable
                onPress={() => setQuantity((c) => (stock ? Math.min(stock, c + 1) : c + 1))}
                style={styles.qtyButton}
              >
                <Text style={styles.qtyButtonText}>+</Text>
              </Pressable>
            </View>
          </Card>

          <Card style={{ gap: spacing.sm }}>
            <Text style={styles.fieldLabel}>Seller & location</Text>
            <Text style={styles.modalMeta}>
              {seller || 'Seller profile'}{location ? ` · ${location}` : ''}
            </Text>
            <Button
              fullWidth
              variant="secondary"
              label="Open in Maps"
              onPress={openLocation}
              disabled={!location}
            />
          </Card>

          {video ? <ProductVideoPlayer uri={video} /> : (
            <Card>
              <Text style={styles.modalMeta}>No product video uploaded for this listing.</Text>
            </Card>
          )}

          <Button
            fullWidth
            label={busyId === id ? 'Adding…' : 'Add to cart'}
            onPress={() => onAddToCart(product, quantity)}
            loading={busyId === id}
          />
          <Button fullWidth variant="ghost" label="Close" onPress={onClose} />
        </ScrollView>
      </View>
    </Modal>
  );
}

function ProductVideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = false; });
  return (
    <Card style={{ gap: spacing.sm }}>
      <Text style={styles.fieldLabel}>Product video</Text>
      <VideoView contentFit="contain" nativeControls player={player} style={styles.videoPlayer} />
    </Card>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    height: 48,
    paddingHorizontal: spacing.lg,
  },
  chipRow: { gap: spacing.sm, paddingRight: spacing.lg },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  productCard: { width: '47.5%', padding: spacing.sm, gap: spacing.xs },
  thumbWrap: { position: 'relative' },
  thumb: { aspectRatio: 1, backgroundColor: colors.primarySoft, borderRadius: radii.md, width: '100%' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  thumbInitial: { color: colors.primaryDark, fontSize: 28, fontWeight: '900' },
  videoBadge: {
    backgroundColor: colors.primaryDeep, borderRadius: radii.sm,
    bottom: 6, paddingHorizontal: 8, paddingVertical: 3, position: 'absolute', right: 6,
  },
  videoBadgeText: { color: colors.textInverse, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  organicBadge: {
    backgroundColor: colors.gold, borderRadius: radii.sm,
    top: 6, left: 6, paddingHorizontal: 8, paddingVertical: 3, position: 'absolute',
  },
  organicBadgeText: { color: colors.primaryDeep, fontSize: 9, fontWeight: '900', letterSpacing: 1 },

  productTitle: { ...typography.subheading, color: colors.text, minHeight: 36, marginTop: spacing.xs },
  productMeta: { ...typography.caption, color: colors.textSecondary, fontWeight: '500' },
  productPrice: { color: colors.primary, fontSize: 15, fontWeight: '900' },
  productStock: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },

  cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  likeButton: {
    width: 36, height: 36, borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  likeButtonActive: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  likeText: { fontSize: 16, color: colors.textMuted },
  likeTextActive: { color: colors.danger },

  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    maxHeight: '92%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
  },
  modalImage: { width: '100%', aspectRatio: 16 / 10, borderRadius: radii.lg, backgroundColor: colors.primarySoft },
  modalTitle: { ...typography.title, color: colors.text },
  modalMeta: { ...typography.body, color: colors.textSecondary },
  modalDescription: { ...typography.body, color: colors.text },
  fieldLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qtyButton: {
    width: 44, height: 44, borderRadius: radii.md,
    backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  qtyButtonText: { color: colors.primaryDark, fontSize: 22, fontWeight: '900' },
  qtyValue: { fontSize: 22, fontWeight: '900', color: colors.text },
  videoPlayer: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.md, backgroundColor: '#000' },
});
