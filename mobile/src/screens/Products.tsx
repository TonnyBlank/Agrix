import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { apiFetch } from '../lib/api';

type RecordRow = Record<string, unknown>;
type Profile = {
  full_name?: string | null;
  phone?: string | null;
  county?: string | null;
  farm_size?: string | null;
  main_crops?: string[] | null;
  bio?: string | null;
  payout_method?: string | null;
  payout_mpesa_number?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
};

const productCategoryOptions = ['Vegetables', 'Fruits', 'Grains', 'Dairy', 'Herbs', 'Poultry'];
const unitOptions = ['kg', 'crate', 'bag', 'bunch', 'tray', 'litre', 'piece'];

export function ProductsScreen({ profile }: { profile: Profile | null }) {
  const [products, setProducts] = useState<RecordRow[]>([]);
  const [form, setForm] = useState({
    name: '',
    category: '',
    unit: 'kg',
    price_per_unit: '',
    stock: '',
    image_emoji: '',
    cover_image_url: '',
    video_url: '',
    description: '',
    is_organic: true,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [coverAsset, setCoverAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [videoAsset, setVideoAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProducts(extractRows(await apiFetch<unknown>('/products/mine')) as RecordRow[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load your listings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const missingProfileFields = [
    !profile?.full_name?.trim() ? 'full name' : null,
    !profile?.phone?.trim() ? 'phone number' : null,
    !profile?.county?.trim() ? 'county' : null,
    !profile?.farm_size?.trim() ? 'farm size' : null,
    !profile?.main_crops?.length ? 'main crops' : null,
    !profile?.bio?.trim() ? 'farm story' : null,
    !profile?.payout_method ? 'payout method' : null,
    profile?.payout_method === 'mpesa' && !profile?.payout_mpesa_number?.trim() ? 'M-Pesa payout number' : null,
    profile?.payout_method === 'bank' && !profile?.bank_name?.trim() ? 'bank name' : null,
    profile?.payout_method === 'bank' && !profile?.bank_account_name?.trim() ? 'bank account name' : null,
    profile?.payout_method === 'bank' && !profile?.bank_account_number?.trim() ? 'bank account number' : null,
  ].filter(Boolean) as string[];
  const profileReadyToSell = missingProfileFields.length === 0;

  const resetForm = () => {
    setForm({
      name: '',
      category: '',
      unit: 'kg',
      price_per_unit: '',
      stock: '',
      image_emoji: '',
      cover_image_url: '',
      video_url: '',
      description: '',
      is_organic: true,
    });
    setEditingId(null);
    setCoverAsset(null);
    setVideoAsset(null);
  };

  const pickCover = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to choose a cover image.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!picked.canceled && picked.assets[0]) {
      setCoverAsset(picked.assets[0]);
      setForm((current) => ({ ...current, cover_image_url: '' }));
    }
  };

  const pickVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow video access to choose a product video.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.85 });
    if (!picked.canceled && picked.assets[0]) {
      setVideoAsset(picked.assets[0]);
      setForm((current) => ({ ...current, video_url: '' }));
    }
  };

  const uploadMedia = async (asset: ImagePicker.ImagePickerAsset, endpoint: string, fieldName: string, fallbackName: string) => {
    const formData = new FormData();
    formData.append(fieldName, {
      uri: asset.uri,
      name: asset.fileName || fallbackName,
      type: asset.mimeType || (fieldName === 'video' ? 'video/mp4' : 'image/jpeg'),
    } as unknown as Blob);
    const uploaded = await apiFetch<{ url?: string }>(endpoint, { method: 'POST', body: formData });
    if (!uploaded.url) throw new Error(`${fieldName} upload did not return a URL.`);
    return uploaded.url;
  };

  const editProduct = (product: RecordRow) => {
    setEditingId(firstText(product, ['id']));
    setForm({
      name: firstText(product, ['name', 'product_name']),
      category: firstText(product, ['category']),
      unit: firstText(product, ['unit']) || 'kg',
      price_per_unit: firstText(product, ['price_per_unit']),
      stock: firstText(product, ['stock']),
      image_emoji: firstText(product, ['image_emoji']),
      cover_image_url: firstText(product, ['cover_image_url']),
      video_url: firstText(product, ['video_url']),
      description: firstText(product, ['description']),
      is_organic: product.is_organic !== false,
    });
    setCoverAsset(null);
    setVideoAsset(null);
  };

  const deleteProduct = async (product: RecordRow) => {
    const id = firstText(product, ['id']);
    if (!id) return;
    setSaving(true);
    try {
      await apiFetch(`/products/${id}`, { method: 'DELETE' });
      if (editingId === id) resetForm();
      await load();
      Alert.alert('Listing removed', 'The product was removed from your marketplace listings.');
    } catch (requestError) {
      Alert.alert('Could not remove listing', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!editingId && !profileReadyToSell) {
      Alert.alert('Complete profile first', `Missing: ${missingProfileFields.join(', ')}.`);
      return;
    }
    if (!form.name.trim() || !form.category.trim() || !form.unit.trim()) {
      Alert.alert('Missing details', 'Product name, category, and unit are required.');
      return;
    }
    if (!form.price_per_unit.trim() || !form.stock.trim()) {
      Alert.alert('Missing numbers', 'Add price and stock.');
      return;
    }
    if (!videoAsset && !form.video_url.trim()) {
      Alert.alert('Video required', 'Choose a product video or enter a video URL before publishing.');
      return;
    }
    if (['kg', 'kgs'].includes(form.unit.trim().toLowerCase()) && Number(form.stock || 0) < 5) {
      Alert.alert('Stock too low', 'Minimum quantity to sell for kg is 5.');
      return;
    }
    setSaving(true);
    try {
      let coverImageUrl = form.cover_image_url.trim();
      let videoUrl = form.video_url.trim();
      if (coverAsset) coverImageUrl = await uploadMedia(coverAsset, '/products/upload-image', 'image', 'product-cover.jpg');
      if (videoAsset) videoUrl = await uploadMedia(videoAsset, '/products/upload-video', 'video', 'product-video.mp4');

      await apiFetch(editingId ? `/products/${editingId}` : '/products', {
        method: editingId ? 'PATCH' : 'POST',
        body: {
          name: form.name.trim(),
          category: form.category.trim(),
          unit: form.unit.trim(),
          price_per_unit: Number(form.price_per_unit),
          stock: Number(form.stock),
          description: form.description.trim(),
          image_emoji: form.image_emoji.trim() || undefined,
          cover_image_url: coverImageUrl || undefined,
          video_url: videoUrl || undefined,
          is_organic: form.is_organic,
          location: profile?.county || null,
        },
      });
      resetForm();
      await load();
      Alert.alert(editingId ? 'Listing updated' : 'Listing created', 'Your product is now available in the marketplace.');
    } catch (requestError) {
      Alert.alert('Could not save listing', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.actionCard}>
        <Text style={styles.cardTitle}>{editingId ? 'Edit product listing' : 'Add product listing'}</Text>
        {!profileReadyToSell && !editingId ? (
          <View style={styles.warningPanel}>
            <Text style={styles.warningTitle}>Complete your seller profile first</Text>
            <Text style={styles.warningText}>Missing: {missingProfileFields.join(', ')}.</Text>
          </View>
        ) : null}
        <TextInput placeholder="Product name" placeholderTextColor="#7a8276" value={form.name} onChangeText={(value) => setForm((current) => ({ ...current, name: value }))} style={styles.input} />
        <Text style={styles.inputLabel}>Category</Text>
        <SegmentedOptions value={form.category} options={productCategoryOptions} onChange={(value) => setForm((current) => ({ ...current, category: value }))} />
        <TextInput keyboardType="numeric" placeholder="Price" placeholderTextColor="#7a8276" value={form.price_per_unit} onChangeText={(value) => setForm((current) => ({ ...current, price_per_unit: value }))} style={styles.input} />
        <Text style={styles.inputLabel}>Unit</Text>
        <SegmentedOptions value={form.unit} options={unitOptions} onChange={(value) => setForm((current) => ({ ...current, unit: value }))} />
        <TextInput keyboardType="numeric" placeholder="Stock available" placeholderTextColor="#7a8276" value={form.stock} onChangeText={(value) => setForm((current) => ({ ...current, stock: value }))} style={styles.input} />
        <TextInput placeholder="Cover image URL" placeholderTextColor="#7a8276" value={form.cover_image_url} onChangeText={(value) => { setCoverAsset(null); setForm((current) => ({ ...current, cover_image_url: value })); }} style={styles.input} />
        <Pressable onPress={pickCover} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{coverAsset ? 'Cover selected' : 'Choose cover image'}</Text>
        </Pressable>
        {coverAsset?.uri || form.cover_image_url ? <Image source={{ uri: coverAsset?.uri || form.cover_image_url }} style={styles.mediaPreview} /> : null}
        <TextInput placeholder="Video URL" placeholderTextColor="#7a8276" value={form.video_url} onChangeText={(value) => { setVideoAsset(null); setForm((current) => ({ ...current, video_url: value })); }} style={styles.input} />
        <Pressable onPress={pickVideo} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{videoAsset ? 'Video selected' : 'Choose product video'}</Text>
        </Pressable>
        <Text style={styles.cardDetail}>{videoAsset ? videoAsset.fileName || 'Video ready to upload' : form.video_url ? 'Video URL ready' : 'A product video is required before publishing.'}</Text>
        <TextInput placeholder="Description" placeholderTextColor="#7a8276" value={form.description} onChangeText={(value) => setForm((current) => ({ ...current, description: value }))} style={[styles.input, styles.textArea]} multiline />
        <Pressable onPress={() => setForm((current) => ({ ...current, is_organic: !current.is_organic }))} style={[styles.checkRow, form.is_organic && styles.checkRowActive]}>
          <Text style={[styles.choiceText, form.is_organic && styles.choiceTextActive]}>Organic produce</Text>
        </Pressable>
        <Pressable onPress={save} disabled={saving} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : editingId ? 'Save changes' : 'Publish listing'}</Text>
        </Pressable>
        {editingId ? (
          <Pressable onPress={resetForm} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Cancel editing</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>My products</Text>
      {loading ? <StateMessage title="Loading" detail="Loading your listings..." /> : null}
      {error ? <StateMessage title="Could not load listings" detail={error} /> : null}
      {!loading && products.length === 0 ? (
        <StateMessage title="No listings yet" detail="Create your first listing above." />
      ) : (
        products.map((product, index) => (
          <View key={`product-${index}`} style={styles.actionCard}>
            {firstText(product, ['cover_image_url']) ? <Image source={{ uri: firstText(product, ['cover_image_url']) }} style={styles.mediaPreview} /> : null}
            <Text style={styles.cardTitle}>{recordTitle(product)}</Text>
            <Text style={styles.cardDetail}>{firstText(product, ['description']) || firstText(product, ['category']) || 'Marketplace listing'}</Text>
            <View style={styles.metricLine}>
              <Text style={styles.metricChip}>{formatMoney(getNumber(product, ['price_per_unit']))}/{firstText(product, ['unit']) || 'unit'}</Text>
              <Text style={styles.metricChip}>Stock {firstText(product, ['stock']) || '0'}</Text>
              <Text style={styles.metricChip}>{firstText(product, ['video_url']) ? 'Video' : 'No video'}</Text>
              <Text style={styles.metricChip}>{product.is_organic === false ? 'Standard' : 'Organic'}</Text>
            </View>
            <View style={styles.buttonRow}>
              <Pressable onPress={() => editProduct(product)} style={styles.secondaryButtonCompact}>
                <Text style={styles.secondaryButtonText}>Edit</Text>
              </Pressable>
              <Pressable onPress={() => deleteProduct(product)} style={styles.dangerButtonSmall}>
                <Text style={styles.dangerButtonText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))
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

function SegmentedOptions({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <View style={styles.choiceWrap}>
      {options.map((option) => (
        <Pressable key={option} onPress={() => onChange(option)} style={[styles.choiceChip, value === option && styles.choiceChipActive]}>
          <Text style={[styles.choiceText, value === option && styles.choiceTextActive]}>{option}</Text>
        </Pressable>
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
  const keys = ['products', 'data'];
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
  return firstText(record, ['title', 'name', 'product_name', 'product_title']) || 'Product';
}

function getNumber(record: RecordRow, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function formatMoney(value: number) {
  return `KES ${Math.round(value).toLocaleString('en-KE')}`;
}

const styles = StyleSheet.create({
  screen: { gap: 14 },
  sectionTitle: { color: '#173421', fontSize: 20, fontWeight: '900' },
  actionCard: { backgroundColor: '#ffffff', borderColor: '#dfe5d8', borderRadius: 8, borderWidth: 1, gap: 12, padding: 14 },
  cardTitle: { color: '#173421', fontSize: 16, fontWeight: '900' },
  cardDetail: { color: '#52604e', fontSize: 13, lineHeight: 19 },
  inputLabel: { color: '#52604e', fontSize: 12, fontWeight: '900' },
  input: { backgroundColor: '#ffffff', borderColor: '#d9e2d2', borderRadius: 8, borderWidth: 1, color: '#173421', fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  mediaPreview: { backgroundColor: '#dfe5d8', borderRadius: 8, height: 180, width: '100%' },
  warningPanel: { backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderRadius: 8, borderWidth: 1, gap: 6, padding: 12 },
  warningTitle: { color: '#9a3412', fontSize: 14, fontWeight: '900' },
  warningText: { color: '#9a3412', fontSize: 12, lineHeight: 18 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceChip: { backgroundColor: '#eef4ea', borderColor: '#dfe8d8', borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  choiceChipActive: { backgroundColor: '#14532d', borderColor: '#14532d' },
  choiceText: { color: '#31523b', fontSize: 12, fontWeight: '900' },
  choiceTextActive: { color: '#ffffff' },
  checkRow: { backgroundColor: '#eef4ea', borderColor: '#dfe8d8', borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  checkRowActive: { backgroundColor: '#14532d', borderColor: '#14532d' },
  primaryButton: { alignItems: 'center', backgroundColor: '#14532d', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12 },
  primaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', backgroundColor: '#eef4ea', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11 },
  secondaryButtonCompact: { alignItems: 'center', backgroundColor: '#eef4ea', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  secondaryButtonText: { color: '#14532d', fontSize: 13, fontWeight: '900' },
  dangerButtonSmall: { alignItems: 'center', backgroundColor: '#fee2e2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  dangerButtonText: { color: '#991b1b', fontSize: 13, fontWeight: '900' },
  metricLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricChip: { backgroundColor: '#edf4e9', borderRadius: 999, color: '#31523b', fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 6 },
  statePanel: { backgroundColor: '#eef4ea', borderRadius: 8, gap: 6, padding: 14 },
  stateTitle: { color: '#173421', fontSize: 16, fontWeight: '900' },
  stateDetail: { color: '#52604e', fontSize: 13, lineHeight: 19 },
});
