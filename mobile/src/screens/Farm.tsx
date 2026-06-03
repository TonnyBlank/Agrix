import { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';

import { apiFetch } from '../lib/api';

type Profile = {
  county?: string | null;
  farm_size?: string | null;
  main_crops?: string[] | null;
  farm_type?: string | null;
  irrigation_type?: string | null;
  soil_type?: string | null;
  years_farming?: number | null;
  cooperative_name?: string | null;
  has_storage?: boolean | null;
  has_transport?: boolean | null;
  bio?: string | null;
  payout_method?: string | null;
  payout_mpesa_number?: string | null;
  farm_gps_lat?: number | string | null;
  farm_gps_lng?: number | string | null;
};

const cropOptions = ['Maize', 'Beans', 'Tomatoes', 'Potatoes', 'Onions', 'Cabbage', 'Spinach', 'Kale', 'Avocado', 'Bananas', 'Coffee', 'Tea', 'Rice', 'Wheat'];
const farmSizeOptions = ['Under 1 Acre', '1-3 Acres', '4-10 Acres', '11-25 Acres', '26-50 Acres', '50+ Acres'];
const farmTypeOptions = [
  ['subsistence', 'Subsistence'],
  ['commercial', 'Commercial'],
  ['mixed', 'Mixed'],
  ['livestock', 'Livestock'],
  ['horticulture', 'Horticulture'],
  ['agroforestry', 'Agroforestry'],
];
const irrigationOptions = [
  ['rainfed', 'Rainfed'],
  ['drip', 'Drip'],
  ['sprinkler', 'Sprinkler'],
  ['canal', 'Canal'],
  ['none', 'None'],
];
const payoutOptions = [
  ['mpesa', 'M-Pesa'],
  ['bank', 'Bank'],
];
const countyOptions = [
  'Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo-Marakwet', 'Embu', 'Garissa', 'Homa Bay',
  'Isiolo', 'Kajiado', 'Kakamega', 'Kericho', 'Kiambu', 'Kilifi', 'Kirinyaga', 'Kisii',
  'Kisumu', 'Kitui', 'Kwale', 'Laikipia', 'Lamu', 'Machakos', 'Makueni', 'Mandera',
  'Marsabit', 'Meru', 'Migori', 'Mombasa', "Murang'a", 'Nairobi', 'Nakuru', 'Nandi',
  'Narok', 'Nyamira', 'Nyandarua', 'Nyeri', 'Samburu', 'Siaya', 'Taita-Taveta',
  'Tana River', 'Tharaka-Nithi', 'Trans-Nzoia', 'Turkana', 'Uasin Gishu', 'Vihiga',
  'Wajir', 'West Pokot',
];

export function FarmScreen({ profile }: { profile: Profile | null }) {
  const [form, setForm] = useState(createForm(profile));
  const [saving, setSaving] = useState(false);
  const [capturingGps, setCapturingGps] = useState(false);

  useEffect(() => {
    setForm(createForm(profile));
  }, [profile]);

  const toggleCrop = (crop: string) => {
    const crops = form.main_crops.split(',').map((item) => item.trim()).filter(Boolean);
    const next = crops.includes(crop) ? crops.filter((item) => item !== crop) : [...crops, crop];
    setForm((current) => ({ ...current, main_crops: next.join(', ') }));
  };

  const captureGps = async () => {
    setCapturingGps(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('GPS permission needed', 'Allow location access while standing at your farm.');
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setForm((current) => ({
        ...current,
        farm_gps_lat: location.coords.latitude.toFixed(6),
        farm_gps_lng: location.coords.longitude.toFixed(6),
      }));
    } catch (error) {
      Alert.alert('Could not capture GPS', error instanceof Error ? error.message : 'Try again outside with GPS enabled.');
    } finally {
      setCapturingGps(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch('/profiles/me', {
        method: 'PATCH',
        body: {
          county: form.county.trim(),
          farm_size: form.farm_size.trim(),
          main_crops: form.main_crops.split(',').map((crop) => crop.trim()).filter(Boolean),
          farm_type: form.farm_type.trim(),
          irrigation_type: form.irrigation_type.trim(),
          soil_type: form.soil_type.trim(),
          years_farming: form.years_farming ? Number(form.years_farming) : '',
          cooperative_name: form.cooperative_name.trim() || null,
          has_storage: form.has_storage,
          has_transport: form.has_transport,
          bio: form.bio.trim(),
          payout_method: form.payout_method.trim() || null,
          payout_mpesa_number: form.payout_mpesa_number.trim() || null,
          farm_gps_lat: form.farm_gps_lat ? Number(form.farm_gps_lat) : '',
          farm_gps_lng: form.farm_gps_lng ? Number(form.farm_gps_lng) : '',
        },
      });
      Alert.alert('Farm updated', 'Your farm profile is ready for buyers, orders, and finance checks.');
    } catch (requestError) {
      Alert.alert('Could not save farm', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.actionCard}>
        <Text style={styles.cardTitle}>Farm details</Text>
        <CountyPicker value={form.county} onChange={(value) => setForm((current) => ({ ...current, county: value }))} />
        <Text style={styles.inputLabel}>Farm size</Text>
        <SegmentedOptions value={form.farm_size} options={farmSizeOptions} onChange={(value) => setForm((current) => ({ ...current, farm_size: value }))} />
        <Text style={styles.inputLabel}>Main crops</Text>
        <View style={styles.choiceWrap}>
          {cropOptions.map((crop) => (
            <Pressable key={crop} onPress={() => toggleCrop(crop)} style={[styles.choiceChip, form.main_crops.includes(crop) && styles.choiceChipActive]}>
              <Text style={[styles.choiceText, form.main_crops.includes(crop) && styles.choiceTextActive]}>{crop}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput placeholder="Other crops, separated by commas" placeholderTextColor="#7a8276" value={form.main_crops} onChangeText={(value) => setForm((current) => ({ ...current, main_crops: value }))} style={styles.input} />
        <Text style={styles.inputLabel}>Farm type</Text>
        <SegmentedOptions value={form.farm_type} options={farmTypeOptions} onChange={(value) => setForm((current) => ({ ...current, farm_type: value }))} />
        <Text style={styles.inputLabel}>Irrigation</Text>
        <SegmentedOptions value={form.irrigation_type} options={irrigationOptions} onChange={(value) => setForm((current) => ({ ...current, irrigation_type: value }))} />
        <View style={styles.formRow}>
          <TextInput placeholder="Soil type" placeholderTextColor="#7a8276" value={form.soil_type} onChangeText={(value) => setForm((current) => ({ ...current, soil_type: value }))} style={[styles.input, styles.formHalf]} />
          <TextInput keyboardType="numeric" placeholder="Years" placeholderTextColor="#7a8276" value={form.years_farming} onChangeText={(value) => setForm((current) => ({ ...current, years_farming: value }))} style={[styles.input, styles.formHalf]} />
        </View>
        <TextInput placeholder="Co-operative name" placeholderTextColor="#7a8276" value={form.cooperative_name} onChangeText={(value) => setForm((current) => ({ ...current, cooperative_name: value }))} style={styles.input} />
        <View style={styles.buttonRow}>
          <Pressable onPress={() => setForm((current) => ({ ...current, has_storage: !current.has_storage }))} style={[styles.checkRow, form.has_storage && styles.checkRowActive]}>
            <Text style={[styles.choiceText, form.has_storage && styles.choiceTextActive]}>Storage available</Text>
          </Pressable>
          <Pressable onPress={() => setForm((current) => ({ ...current, has_transport: !current.has_transport }))} style={[styles.checkRow, form.has_transport && styles.checkRowActive]}>
            <Text style={[styles.choiceText, form.has_transport && styles.choiceTextActive]}>Transport available</Text>
          </Pressable>
        </View>
        <TextInput placeholder="Farm story" placeholderTextColor="#7a8276" value={form.bio} onChangeText={(value) => setForm((current) => ({ ...current, bio: value }))} style={[styles.input, styles.textArea]} multiline />
      </View>
      <View style={styles.actionCard}>
        <Text style={styles.cardTitle}>Farm GPS verification</Text>
        <Text style={styles.cardDetail}>Stand at the farm and capture GPS so buyers and loan checks can trust the farm location.</Text>
        <View style={styles.formRow}>
          <TextInput keyboardType="numeric" placeholder="Latitude" placeholderTextColor="#7a8276" value={form.farm_gps_lat} onChangeText={(value) => setForm((current) => ({ ...current, farm_gps_lat: value }))} style={[styles.input, styles.formHalf]} />
          <TextInput keyboardType="numeric" placeholder="Longitude" placeholderTextColor="#7a8276" value={form.farm_gps_lng} onChangeText={(value) => setForm((current) => ({ ...current, farm_gps_lng: value }))} style={[styles.input, styles.formHalf]} />
        </View>
        <FarmMapActions county={form.county} lat={form.farm_gps_lat} lng={form.farm_gps_lng} />
        <Pressable onPress={captureGps} disabled={capturingGps} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{capturingGps ? 'Capturing GPS...' : 'Use current GPS'}</Text>
        </Pressable>
      </View>
      <View style={styles.actionCard}>
        <Text style={styles.cardTitle}>Payout details</Text>
        <SegmentedOptions value={form.payout_method} options={payoutOptions} onChange={(value) => setForm((current) => ({ ...current, payout_method: value }))} />
        <TextInput keyboardType="phone-pad" placeholder="M-Pesa payout number" placeholderTextColor="#7a8276" value={form.payout_mpesa_number} onChangeText={(value) => setForm((current) => ({ ...current, payout_mpesa_number: value }))} style={styles.input} />
        <Pressable onPress={save} disabled={saving} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save farm profile'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createForm(profile: Profile | null) {
  return {
    county: profile?.county || '',
    farm_size: profile?.farm_size || '',
    main_crops: (profile?.main_crops || []).join(', '),
    farm_type: profile?.farm_type || '',
    irrigation_type: profile?.irrigation_type || '',
    soil_type: profile?.soil_type || '',
    years_farming: profile?.years_farming ? String(profile.years_farming) : '',
    cooperative_name: profile?.cooperative_name || '',
    has_storage: Boolean(profile?.has_storage),
    has_transport: Boolean(profile?.has_transport),
    bio: profile?.bio || '',
    payout_method: profile?.payout_method || '',
    payout_mpesa_number: profile?.payout_mpesa_number || '',
    farm_gps_lat: profile?.farm_gps_lat ? String(profile.farm_gps_lat) : '',
    farm_gps_lng: profile?.farm_gps_lng ? String(profile.farm_gps_lng) : '',
  };
}

function FarmMapActions({ county, lat, lng }: { county: string; lat: string; lng: string }) {
  const hasExactPoint = Boolean(lat && lng);
  const query = hasExactPoint ? `${lat},${lng}` : `${county || 'Kenya'}, Kenya`;

  const openMap = async () => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    await Linking.openURL(url);
  };

  return (
    <View style={styles.mapPanel}>
      <Text style={styles.cardTitle}>Map location</Text>
      <Text style={styles.cardDetail}>
        {hasExactPoint ? `Saved farm point: ${lat}, ${lng}` : county ? `Open ${county} on the map.` : 'Choose a county or capture GPS to open the farm map.'}
      </Text>
      <Pressable onPress={openMap} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Open map</Text>
      </Pressable>
    </View>
  );
}

function CountyPicker({ value, onChange, label = 'County' }: { value: string; onChange: (value: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const normalized = search.trim().toLowerCase();
  const filtered = normalized ? countyOptions.filter((county) => county.toLowerCase().includes(normalized)) : countyOptions;

  return (
    <>
      <View style={styles.dropdownFieldWrap}>
        <Text style={styles.inputLabel}>{label}</Text>
        <Pressable onPress={() => setOpen(true)} style={styles.dropdownField}>
          <Text style={[styles.dropdownValue, !value && styles.dropdownPlaceholder]}>{value || 'Choose county'}</Text>
          <Text style={styles.dropdownCaret}>v</Text>
        </Pressable>
      </View>
      <Modal animationType="fade" transparent visible={open} onRequestClose={() => setOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.dropdownSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.cardTitle}>{label}</Text>
              <Pressable onPress={() => setOpen(false)} style={styles.closeButton}>
                <Text style={styles.secondaryButtonText}>Close</Text>
              </Pressable>
            </View>
            <TextInput placeholder="Search county" placeholderTextColor="#7a8276" value={search} onChangeText={setSearch} style={styles.input} />
            <ScrollView style={styles.dropdownList} showsVerticalScrollIndicator>
              {filtered.map((county) => {
                const active = county === value;
                return (
                  <Pressable
                    key={county}
                    onPress={() => {
                      onChange(county);
                      setOpen(false);
                      setSearch('');
                    }}
                    style={[styles.dropdownOption, active && styles.dropdownOptionActive]}
                  >
                    <Text style={[styles.dropdownOptionText, active && styles.dropdownOptionTextActive]}>{county}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function SegmentedOptions({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[] | string[][];
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.choiceWrap}>
      {options.map((option) => {
        const optionValue = Array.isArray(option) ? option[0] : option;
        const label = Array.isArray(option) ? option[1] : option;
        return (
          <Pressable key={optionValue} onPress={() => onChange(optionValue)} style={[styles.choiceChip, value === optionValue && styles.choiceChipActive]}>
            <Text style={[styles.choiceText, value === optionValue && styles.choiceTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 14 },
  actionCard: { backgroundColor: '#ffffff', borderColor: '#dfe5d8', borderRadius: 8, borderWidth: 1, gap: 12, padding: 14 },
  cardTitle: { color: '#173421', fontSize: 16, fontWeight: '900' },
  cardDetail: { color: '#52604e', fontSize: 13, lineHeight: 19 },
  inputLabel: { color: '#52604e', fontSize: 12, fontWeight: '900' },
  input: { backgroundColor: '#ffffff', borderColor: '#d9e2d2', borderRadius: 8, borderWidth: 1, color: '#173421', fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  formRow: { flexDirection: 'row', gap: 10 },
  formHalf: { flex: 1 },
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
  secondaryButtonText: { color: '#14532d', fontSize: 13, fontWeight: '900' },
  mapPanel: { backgroundColor: '#f7faf4', borderColor: '#e2eadb', borderRadius: 8, borderWidth: 1, gap: 8, padding: 12 },
  dropdownFieldWrap: { gap: 7 },
  dropdownField: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#d9e2d2', borderRadius: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 46, paddingHorizontal: 12 },
  dropdownValue: { color: '#173421', fontSize: 14, fontWeight: '800' },
  dropdownPlaceholder: { color: '#7a8276', fontWeight: '600' },
  dropdownCaret: { color: '#14532d', fontSize: 13, fontWeight: '900' },
  modalBackdrop: { backgroundColor: 'rgba(0,0,0,0.35)', flex: 1, justifyContent: 'flex-end' },
  dropdownSheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 8, borderTopRightRadius: 8, gap: 12, maxHeight: '80%', padding: 16 },
  modalHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  closeButton: { backgroundColor: '#eef4ea', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  dropdownList: { maxHeight: 430 },
  dropdownOption: { borderBottomColor: '#eef2ea', borderBottomWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 13 },
  dropdownOptionActive: { backgroundColor: '#e7f3e4' },
  dropdownOptionText: { color: '#173421', fontSize: 14, fontWeight: '800' },
  dropdownOptionTextActive: { color: '#14532d', fontWeight: '900' },
});
