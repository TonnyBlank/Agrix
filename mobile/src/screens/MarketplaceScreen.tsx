import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { apiFetch } from '../lib/api';
import { tokens } from '../theme';

type Profile = {
  full_name?: string | null;
  county?: string | null;
  avatar_url?: string | null;
};

type Product = {
  id: string;
  name: string;
  category: string | null;
  description?: string | null;
  price_per_unit: number;
  unit: string;
  stock: number;
  location?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  farmer_id?: string | null;
  profiles?: Profile | null;
  created_at?: string;
};

type ProductsResponse = Product[] | { products: Product[] };

const CATEGORIES = ['All', 'Vegetables', 'Fruits', 'Grains', 'Dairy', 'Poultry', 'Herbs'];

function extractProducts(data: ProductsResponse): Product[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && Array.isArray((data as any).products)) {
    return (data as { products: Product[] }).products;
  }
  return [];
}

export function MarketplaceScreen({ viewerCounty }: { viewerCounty?: string | null }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [localOnly, setLocalOnly] = useState(Boolean(viewerCounty));

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const data = await apiFetch<ProductsResponse>('/products');
      setProducts(extractProducts(data));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load marketplace.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load('initial');
  }, [load]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const viewerNeedle = (viewerCounty || '').trim().toLowerCase();
    return products
      .filter((p) => {
        const productCounty = (p.location || p.profiles?.county || '').toLowerCase();
        const farmer = (p.profiles?.full_name || '').toLowerCase();
        const matchSearch =
          !needle ||
          p.name.toLowerCase().includes(needle) ||
          farmer.includes(needle) ||
          productCounty.includes(needle);
        const matchCategory = category === 'All' || (p.category || '').toLowerCase() === category.toLowerCase();
        const matchLocal = !localOnly || !viewerNeedle || productCounty === viewerNeedle;
        return matchSearch && matchCategory && matchLocal;
      })
      .sort((a, b) => {
        if (viewerNeedle) {
          const aLocal = (a.location || a.profiles?.county || '').toLowerCase() === viewerNeedle ? 1 : 0;
          const bLocal = (b.location || b.profiles?.county || '').toLowerCase() === viewerNeedle ? 1 : 0;
          if (aLocal !== bLocal) return bLocal - aLocal;
        }
        return (b.created_at || '').localeCompare(a.created_at || '');
      });
  }, [products, search, category, localOnly, viewerCounty]);

  const handleAddToCart = async (product: Product) => {
    try {
      await apiFetch('/cart/items', {
        method: 'POST',
        body: { product_id: product.id, quantity: 1, unit: product.unit } as any,
      });
      Alert.alert('Added to cart', `${product.name} added to your cart.`);
    } catch (requestError) {
      Alert.alert(
        'Could not add to cart',
        requestError instanceof Error ? requestError.message : 'Try again.',
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={tokens.accent} />
        <Text style={styles.muted}>Loading marketplace...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.searchRow}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search produce, farmer, or county"
          placeholderTextColor={tokens.mutedText}
          style={styles.searchInput}
        />
      </View>

      {viewerCounty ? (
        <Pressable
          onPress={() => setLocalOnly((value) => !value)}
          style={[styles.localToggle, localOnly && styles.localToggleActive]}
        >
          <Text style={[styles.localToggleText, localOnly && styles.localToggleTextActive]}>
            {localOnly ? `Showing ${viewerCounty} only` : `Show ${viewerCounty} only`}
          </Text>
        </Pressable>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {CATEGORIES.map((entry) => {
          const active = entry === category;
          return (
            <Pressable
              key={entry}
              onPress={() => setCategory(entry)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{entry}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Text style={styles.resultMeta}>{filtered.length} listings</Text>

      {filtered.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>No matching produce</Text>
          <Text style={styles.muted}>Try a different category, county filter, or search term.</Text>
        </View>
      ) : (
        filtered.map((product) => {
          const productCounty = product.location || product.profiles?.county || 'Kenya';
          const farmer = product.profiles?.full_name || 'AgriLink farmer';
          return (
            <View key={product.id} style={styles.card}>
              {product.image_url ? (
                <Image source={{ uri: product.image_url }} style={styles.cardImage} />
              ) : (
                <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
                  <Text style={styles.cardImageInitial}>{product.name.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.cardBody}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{product.name}</Text>
                  <Text style={styles.cardPrice}>
                    KES {Number(product.price_per_unit).toLocaleString()}
                    <Text style={styles.cardUnit}> /{product.unit}</Text>
                  </Text>
                </View>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {farmer} - {productCounty}
                </Text>
                <Text style={styles.cardStock}>
                  {product.stock > 0 ? `${product.stock} ${product.unit} in stock` : 'Out of stock'}
                </Text>
                <Pressable
                  onPress={() => handleAddToCart(product)}
                  disabled={product.stock <= 0}
                  style={[styles.cardCta, product.stock <= 0 && styles.cardCtaDisabled]}
                >
                  <Text style={styles.cardCtaText}>
                    {product.stock > 0 ? 'Add to cart' : 'Unavailable'}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
    gap: 12,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: tokens.text,
    fontSize: 15,
  },
  localToggle: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tokens.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: tokens.surface,
  },
  localToggleActive: {
    backgroundColor: tokens.accent,
    borderColor: tokens.accent,
  },
  localToggleText: {
    color: tokens.text,
    fontSize: 13,
    fontWeight: '600',
  },
  localToggleTextActive: {
    color: '#ffffff',
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: tokens.surface,
    borderWidth: 1,
    borderColor: tokens.border,
  },
  chipActive: {
    backgroundColor: tokens.accent,
    borderColor: tokens.accent,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.text,
  },
  chipTextActive: {
    color: '#ffffff',
  },
  resultMeta: {
    fontSize: 12,
    color: tokens.mutedText,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  errorText: {
    color: tokens.danger,
    fontSize: 13,
  },
  card: {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: 160,
    backgroundColor: tokens.border,
  },
  cardImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImageInitial: {
    fontSize: 48,
    fontWeight: '700',
    color: tokens.mutedText,
  },
  cardBody: {
    padding: 14,
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: tokens.text,
  },
  cardPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: tokens.accent,
  },
  cardUnit: {
    fontSize: 12,
    fontWeight: '500',
    color: tokens.mutedText,
  },
  cardMeta: {
    fontSize: 13,
    color: tokens.mutedText,
  },
  cardStock: {
    fontSize: 12,
    color: tokens.mutedText,
  },
  cardCta: {
    marginTop: 8,
    backgroundColor: tokens.accent,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cardCtaDisabled: {
    backgroundColor: tokens.border,
  },
  cardCtaText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  centerState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 32,
  },
  stateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.text,
  },
  muted: {
    fontSize: 13,
    color: tokens.mutedText,
    textAlign: 'center',
  },
});
