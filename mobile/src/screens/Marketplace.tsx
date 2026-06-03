import { useEffect, useState } from 'react';
import { Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { apiFetch } from '../lib/api';

type RecordRow = Record<string, unknown>;

type MarketplaceProps = {
  isDark: boolean;
};

export function MarketplaceScreen({ isDark }: MarketplaceProps) {
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
      setProducts(extractRows(await apiFetch<unknown>('/products')) as RecordRow[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load marketplace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

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
      Alert.alert('Added to cart', `${quantity} ${firstText(product, ['unit']) || 'item'} of ${recordTitle(product)} is now in your cart.`);
    } catch (requestError) {
      Alert.alert('Could not add to cart', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const categories = ['All', ...Array.from(new Set(products.map((product) => firstText(product, ['category'])).filter(Boolean)))];
  const filteredProducts = products.filter((product) => {
    const haystack = [
      recordTitle(product),
      firstText(product, ['category']),
      firstText(product, ['county', 'location']),
      firstText(product, ['description']),
    ].join(' ').toLowerCase();
    const matchesSearch = !search.trim() || haystack.includes(search.trim().toLowerCase());
    const matchesCategory = category === 'All' || firstText(product, ['category']) === category;
    return matchesSearch && matchesCategory;
  });

  const toggleLike = (id: string) => {
    setLikedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  if (loading) return <StateMessage isDark={isDark} title="Loading" detail="Loading marketplace products..." />;
  if (error) {
    return (
      <View style={styles.screen}>
        <StateMessage isDark={isDark} title="Could not load marketplace" detail={error} />
        <Pressable onPress={load} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.marketHeader}>
        <View>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Marketplace</Text>
          <Text style={[styles.marketCount, isDark && styles.mutedTextDark]}>{filteredProducts.length} product{filteredProducts.length === 1 ? '' : 's'}</Text>
        </View>
      </View>
      <TextInput
        placeholder="Search products, county, or category"
        placeholderTextColor={isDark ? '#8fa08e' : '#7a8276'}
        value={search}
        onChangeText={setSearch}
        style={[styles.input, isDark && styles.inputDark]}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.marketCategoryRow}>
        {categories.map((item) => (
          <Pressable key={item} onPress={() => setCategory(item)} style={[styles.marketCategoryChip, isDark && styles.marketCategoryChipDark, category === item && styles.marketCategoryChipActive]}>
            <Text style={[styles.marketCategoryText, isDark && styles.marketCategoryTextDark, category === item && styles.marketCategoryTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ProductMediaModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onAddToCart={addToCart} busyId={busyId} isDark={isDark} />
      {filteredProducts.length === 0 ? (
        <StateMessage isDark={isDark} title="No products yet" detail="New marketplace products will appear here when farmers publish listings." />
      ) : (
        <View style={styles.marketGrid}>
          {filteredProducts.map((product, index) => {
            const id = firstText(product, ['id']) || `${index}`;
            const price = getNumber(product, ['price_per_unit', 'price']);
            const stock = getNumber(product, ['stock', 'quantity']);
            const coverUrl = firstText(product, ['cover_image_url', 'image_url', 'photo_url']);
            const videoUrl = firstText(product, ['video_url']);
            const rating = getNumber(product, ['rating', 'average_rating']) || 4.7;
            const likes = getNumber(product, ['likes_count', 'likes']) + (likedIds.includes(id) ? 1 : 0);
            return (
              <View key={id} style={[styles.marketProductCard, isDark && styles.marketProductCardDark]}>
                <Pressable onPress={() => setSelectedProduct(product)}>
                  {coverUrl ? (
                    <Image source={{ uri: coverUrl }} style={styles.marketThumb} />
                  ) : (
                    <View style={styles.marketThumbFallback}>
                      <Text style={styles.productThumbText}>{recordTitle(product).slice(0, 1)}</Text>
                    </View>
                  )}
                  {videoUrl ? (
                    <View style={styles.videoBadge}>
                      <Text style={styles.videoBadgeText}>Video</Text>
                    </View>
                  ) : null}
                </Pressable>
                <Text style={[styles.marketProductTitle, isDark && styles.marketProductTitleDark]} numberOfLines={2}>{recordTitle(product)}</Text>
                <Text style={[styles.marketProductMeta, isDark && styles.marketProductMetaDark]} numberOfLines={1}>
                  {[firstText(product, ['category']), firstText(product, ['county', 'location'])].filter(Boolean).join(' - ') || 'Marketplace'}
                </Text>
                <Text style={styles.marketPrice} numberOfLines={1}>{price ? `${formatMoney(price)}/${firstText(product, ['unit']) || 'unit'}` : 'Price not set'}</Text>
                <View style={styles.marketSignalRow}>
                  <Text style={[styles.marketSignal, isDark && styles.marketSignalDark]}>Rating {rating.toFixed(1)}</Text>
                  <Text style={[styles.marketSignal, isDark && styles.marketSignalDark]}>{stock ? `${stock} left` : 'Stock'}</Text>
                </View>
                <View style={styles.marketActions}>
                  <Pressable onPress={() => toggleLike(id)} style={[styles.marketMiniButton, likedIds.includes(id) && styles.marketMiniButtonActive]}>
                    <Text style={[styles.marketMiniButtonText, likedIds.includes(id) && styles.marketMiniButtonTextActive]}>
                      {likedIds.includes(id) ? 'Liked' : 'Like'} {likes || ''}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => addToCart(product)} disabled={busyId === id} style={styles.marketCartButton}>
                    <Text style={styles.marketCartButtonText}>{busyId === id ? '...' : 'Cart'}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function ProductMediaModal({
  product,
  onClose,
  onAddToCart,
  busyId,
  isDark,
}: {
  product: RecordRow | null;
  onClose: () => void;
  onAddToCart: (product: RecordRow, quantity?: number) => Promise<void>;
  busyId: string | null;
  isDark: boolean;
}) {
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    setQuantity(1);
  }, [product]);

  if (!product) return null;
  const id = firstText(product, ['id']);
  const coverUrl = firstText(product, ['cover_image_url', 'image_url', 'photo_url']);
  const videoUrl = firstText(product, ['video_url']);
  const price = getNumber(product, ['price_per_unit', 'price']);
  const stock = getNumber(product, ['stock', 'quantity']);
  const rating = getNumber(product, ['rating', 'average_rating']) || 4.7;
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
        <View style={[styles.modalSheet, isDark && styles.modalSheetDark]}>
          {coverUrl ? <Image source={{ uri: coverUrl }} style={styles.marketModalImage} /> : null}
          <Text style={[styles.cardTitle, isDark && styles.cardTitleDark]}>{recordTitle(product)}</Text>
          <Text style={[styles.cardDetail, isDark && styles.cardDetailDark]}>
            {[firstText(product, ['category']), firstText(product, ['county', 'location'])]
              .filter(Boolean)
              .join(' - ') || 'Marketplace listing'}
          </Text>
          {description ? <Text style={[styles.cardDetail, isDark && styles.cardDetailDark]}>{description}</Text> : null}
          <View style={styles.metricLine}>
            <Text style={styles.metricChip}>{price ? `${formatMoney(price)}/${firstText(product, ['unit']) || 'unit'}` : 'Price not set'}</Text>
            <Text style={styles.metricChip}>{stock ? `${stock} ${firstText(product, ['unit']) || ''}` : 'Stock not set'}</Text>
            <Text style={styles.metricChip}>Rating {rating.toFixed(1)}</Text>
            <Text style={styles.metricChip}>{product.is_organic === false ? 'Standard' : 'Organic'}</Text>
          </View>
          <View style={[styles.quantityPanel, isDark && styles.subPanelDark]}>
            <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>Quantity</Text>
            <View style={styles.quantityControls}>
              <Pressable onPress={() => setQuantity((current) => Math.max(1, current - 1))} style={styles.quantityButton}>
                <Text style={styles.quantityButtonText}>-</Text>
              </Pressable>
              <Text style={[styles.quantityValue, isDark && styles.quantityValueDark]}>{quantity}</Text>
              <Pressable onPress={() => setQuantity((current) => stock ? Math.min(stock, current + 1) : current + 1)} style={styles.quantityButton}>
                <Text style={styles.quantityButtonText}>+</Text>
              </Pressable>
            </View>
          </View>
          <View style={[styles.subPanel, isDark && styles.subPanelDark]}>
            <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>Seller and location</Text>
            <Text style={[styles.cardDetail, isDark && styles.cardDetailDark]}>{seller || 'Seller profile'}{location ? ` - ${location}` : ''}</Text>
            <Pressable onPress={openLocation} disabled={!location} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Open location map</Text>
            </Pressable>
          </View>
          {videoUrl ? <ProductVideoPlayer uri={videoUrl} /> : (
            <View style={[styles.videoEmpty, isDark && styles.subPanelDark]}>
              <Text style={[styles.cardDetail, isDark && styles.cardDetailDark]}>No product video has been uploaded for this listing.</Text>
            </View>
          )}
          <Pressable onPress={() => onAddToCart(product, quantity)} disabled={busyId === id} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{busyId === id ? 'Adding...' : 'Add to cart'}</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ProductVideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (nextPlayer) => {
    nextPlayer.loop = false;
  });

  return (
    <View style={styles.videoPlayerPanel}>
      <Text style={styles.inputLabelDark}>Product video</Text>
      <VideoView contentFit="contain" nativeControls player={player} style={styles.videoPlayer} />
    </View>
  );
}

function StateMessage({ title, detail, isDark }: { title: string; detail: string; isDark: boolean }) {
  return (
    <View style={[styles.statePanel, isDark && styles.statePanelDark]}>
      <Text style={[styles.stateTitle, isDark && styles.stateTitleDark]}>{title}</Text>
      <Text style={[styles.stateDetail, isDark && styles.stateDetailDark]}>{detail}</Text>
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
  sectionTitle: { color: '#162016', fontSize: 17, fontWeight: '900', marginBottom: 10, marginTop: 4 },
  sectionTitleDark: { color: '#f6f7f2' },
  marketHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  marketCount: { color: '#687365', fontSize: 12, fontWeight: '800', marginTop: -6 },
  mutedTextDark: { color: '#b9c8b7' },
  input: {
    backgroundColor: '#f6f7f2',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#162016',
    fontSize: 16,
    height: 52,
    paddingHorizontal: 14,
  },
  inputDark: { backgroundColor: '#18231b', borderColor: '#304231', color: '#f6f7f2' },
  marketCategoryRow: { gap: 8, paddingRight: 20 },
  marketCategoryChip: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  marketCategoryChipDark: { backgroundColor: '#18231b', borderColor: '#304231' },
  marketCategoryChipActive: { backgroundColor: '#2f6b3f', borderColor: '#2f6b3f' },
  marketCategoryText: { color: '#687365', fontSize: 12, fontWeight: '900' },
  marketCategoryTextDark: { color: '#b9c8b7' },
  marketCategoryTextActive: { color: '#ffffff' },
  marketGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  marketProductCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 7,
    padding: 8,
    width: '48%',
  },
  marketProductCardDark: { backgroundColor: '#18231b', borderColor: '#304231' },
  marketThumb: { aspectRatio: 1, backgroundColor: '#e8f3df', borderRadius: 8, width: '100%' },
  marketThumbFallback: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    justifyContent: 'center',
    width: '100%',
  },
  productThumbText: { color: '#2f6b3f', fontSize: 20, fontWeight: '900', textTransform: 'uppercase' },
  videoBadge: {
    backgroundColor: '#203d2b',
    borderRadius: 8,
    bottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
    right: 6,
  },
  videoBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: '900' },
  marketProductTitle: { color: '#162016', fontSize: 13, fontWeight: '900', lineHeight: 16, minHeight: 32 },
  marketProductTitleDark: { color: '#f6f7f2' },
  marketProductMeta: { color: '#687365', fontSize: 11, fontWeight: '700' },
  marketProductMetaDark: { color: '#9fb09d' },
  marketPrice: { color: '#2f6b3f', fontSize: 14, fontWeight: '900' },
  marketSignalRow: { flexDirection: 'row', gap: 5 },
  marketSignal: {
    backgroundColor: '#f6f7f2',
    borderRadius: 6,
    color: '#687365',
    flex: 1,
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 5,
    textAlign: 'center',
  },
  marketSignalDark: { backgroundColor: '#111812', color: '#b9c8b7' },
  marketActions: { flexDirection: 'row', gap: 6 },
  marketMiniButton: {
    alignItems: 'center',
    backgroundColor: '#f6f7f2',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 6,
  },
  marketMiniButtonActive: { backgroundColor: '#fff1ef', borderColor: '#f1c1ba' },
  marketMiniButtonText: { color: '#687365', fontSize: 11, fontWeight: '900' },
  marketMiniButtonTextActive: { color: '#a13b2f' },
  marketCartButton: {
    alignItems: 'center',
    backgroundColor: '#2f6b3f',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 6,
  },
  marketCartButtonText: { color: '#ffffff', fontSize: 11, fontWeight: '900' },
  modalBackdrop: { backgroundColor: 'rgba(10, 18, 12, 0.55)', flex: 1, justifyContent: 'flex-end', padding: 18 },
  modalSheet: { backgroundColor: '#ffffff', borderRadius: 8, gap: 12, maxHeight: '88%', padding: 14 },
  modalSheetDark: { backgroundColor: '#111812' },
  marketModalImage: { aspectRatio: 1.45, backgroundColor: '#e8f3df', borderRadius: 8, width: '100%' },
  cardTitle: { color: '#162016', fontSize: 16, fontWeight: '900' },
  cardTitleDark: { color: '#f6f7f2' },
  cardDetail: { color: '#687365', fontSize: 13, lineHeight: 19, marginTop: 4 },
  cardDetailDark: { color: '#b9c8b7' },
  metricLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricChip: {
    backgroundColor: '#f6f7f2',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#203d2b',
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  quantityPanel: {
    backgroundColor: '#f6f7f2',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  quantityControls: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  quantityButton: { alignItems: 'center', backgroundColor: '#e8f3df', borderRadius: 8, height: 40, justifyContent: 'center', width: 48 },
  quantityButtonText: { color: '#2f6b3f', fontSize: 20, fontWeight: '900' },
  quantityValue: { color: '#162016', flex: 1, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  quantityValueDark: { color: '#f6f7f2' },
  subPanel: { backgroundColor: '#f6f7f2', borderColor: '#dfe5d8', borderRadius: 8, borderWidth: 1, gap: 10, padding: 12 },
  subPanelDark: { backgroundColor: '#18231b', borderColor: '#304231' },
  inputLabel: { color: '#203d2b', fontSize: 12, fontWeight: '900', marginTop: 2, textTransform: 'uppercase' },
  inputLabelDark: { color: '#b9d0b8' },
  secondaryButton: { alignItems: 'center', backgroundColor: '#e8f3df', borderRadius: 8, justifyContent: 'center', minHeight: 48, paddingHorizontal: 14 },
  secondaryButtonText: { color: '#2f6b3f', fontSize: 14, fontWeight: '900' },
  primaryButton: { alignItems: 'center', backgroundColor: '#2f6b3f', borderRadius: 8, height: 52, justifyContent: 'center' },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '900' },
  videoPlayerPanel: { backgroundColor: '#111812', borderRadius: 8, gap: 8, padding: 10 },
  videoPlayer: { aspectRatio: 1.65, backgroundColor: '#000000', borderRadius: 8, width: '100%' },
  videoEmpty: { backgroundColor: '#f6f7f2', borderColor: '#dfe5d8', borderRadius: 8, borderWidth: 1, padding: 12 },
  statePanel: { backgroundColor: '#ffffff', borderColor: '#dfe5d8', borderRadius: 8, borderWidth: 1, padding: 18 },
  statePanelDark: { backgroundColor: '#18231b', borderColor: '#304231' },
  stateTitle: { color: '#162016', fontSize: 18, fontWeight: '900' },
  stateTitleDark: { color: '#f6f7f2' },
  stateDetail: { color: '#687365', fontSize: 14, lineHeight: 20, marginTop: 8 },
  stateDetailDark: { color: '#b9c8b7' },
});
