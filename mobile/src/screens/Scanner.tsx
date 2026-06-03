import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { type AppRole, type MobileRouteKey, isAdminRole } from '../config/navigation';
import { apiFetch } from '../lib/api';

type RecordRow = Record<string, unknown>;

export function ScannerScreen({
  role,
  setActiveKey,
}: {
  role: AppRole | null;
  setActiveKey: (key: MobileRouteKey) => void;
}) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<RecordRow | null>(null);
  const [scanning, setScanning] = useState(false);
  const canScan = role === 'farmer_pro' || role === 'company' || isAdminRole(role);

  const chooseImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to choose a crop image.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!picked.canceled && picked.assets[0]?.uri) {
      setImageUri(picked.assets[0].uri);
      setResult(null);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission needed', 'Allow camera access to scan crops from the field.');
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!picked.canceled && picked.assets[0]?.uri) {
      setImageUri(picked.assets[0].uri);
      setResult(null);
    }
  };

  const scan = async () => {
    if (!imageUri) {
      Alert.alert('Choose an image', 'Select a clear crop photo first.');
      return;
    }
    setScanning(true);
    try {
      const formData = new FormData();
      formData.append('image', {
        uri: imageUri,
        name: `crop-scan-${Date.now()}.jpg`,
        type: 'image/jpeg',
      } as unknown as Blob);
      const response = await apiFetch<RecordRow>('/scanner/crops', { method: 'POST', body: formData });
      setResult((response.result as RecordRow) || response);
    } catch (requestError) {
      Alert.alert('Scan failed', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setScanning(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.heroPanel}>
        <Text style={styles.panelLabel}>FIELD TOOL</Text>
        <Text style={styles.bigName}>AI Scanner</Text>
        <Text style={styles.panelNote}>Upload a clear crop image for diagnosis guidance.</Text>
      </View>

      {!canScan ? (
        <View style={styles.actionCard}>
          <Text style={styles.cardTitle}>Scanner requires Pro</Text>
          <Text style={styles.cardDetail}>Upgrade to Farmer Pro to use AI crop scanning.</Text>
          <Pressable onPress={() => setActiveKey('upgrade')} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Open upgrade</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actionCard}>
          {imageUri ? <Image source={{ uri: imageUri }} style={styles.scanPreview} /> : null}
          <View style={styles.buttonRow}>
            <Pressable onPress={takePhoto} style={styles.secondaryButtonCompact}>
              <Text style={styles.secondaryButtonText}>Open camera</Text>
            </Pressable>
            <Pressable onPress={chooseImage} style={styles.secondaryButtonCompact}>
              <Text style={styles.secondaryButtonText}>{imageUri ? 'Choose another' : 'Choose photo'}</Text>
            </Pressable>
          </View>
          <Pressable onPress={scan} disabled={scanning} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{scanning ? 'Scanning...' : 'Run scan'}</Text>
          </Pressable>
        </View>
      )}

      {result ? (
        <View style={styles.actionCard}>
          <Text style={styles.cardTitle}>{firstText(result, ['disease', 'condition', 'diagnosis']) || 'Scan result'}</Text>
          <Text style={styles.cardDetail}>{firstText(result, ['summary', 'description', 'confidence']) || summarizeRecord(result)}</Text>
          <View style={styles.metricLine}>
            <Text style={styles.metricChip}>{firstText(result, ['severity']) || 'Severity pending'}</Text>
            <Text style={styles.metricChip}>{firstText(result, ['confidence']) || firstText(result, ['confidence_score']) || 'Confidence pending'}</Text>
          </View>
          <ScannerResultSection title="Treatment" items={firstList(result, ['treatment', 'treatments', 'treatmentItems', 'recommendations'])} />
          <ScannerResultSection title="Organic options" items={firstList(result, ['organicAlternatives', 'organic_alternatives', 'organic'])} />
          <ScannerResultSection title="Fertilizer" items={firstList(result, ['fertilizerRecommendations', 'fertilizer_recommendations', 'fertilizer'])} />
          <ScannerResultSection title="Prevention" items={firstList(result, ['prevention', 'preventionItems', 'preventive_measures'])} />
        </View>
      ) : null}
    </View>
  );
}

function ScannerResultSection({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.subPanel}>
      <Text style={styles.inputLabel}>{title}</Text>
      {items.slice(0, 6).map((item, index) => (
        <Text key={`${title}-${index}`} style={styles.resultBullet}>{index + 1}. {item}</Text>
      ))}
    </View>
  );
}

function firstText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function firstList(record: RecordRow, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
    if (typeof value === 'string' && value.trim()) return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function summarizeRecord(record: RecordRow) {
  return Object.entries(record)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('\n');
}

const styles = StyleSheet.create({
  screen: { gap: 14 },
  heroPanel: { backgroundColor: '#203d2b', borderRadius: 8, gap: 8, padding: 18 },
  panelLabel: { color: '#cfe4d0', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  bigName: { color: '#ffffff', fontSize: 26, fontWeight: '900' },
  panelNote: { color: '#e8f1e7', fontSize: 14, lineHeight: 20 },
  actionCard: { backgroundColor: '#ffffff', borderColor: '#dfe5d8', borderRadius: 8, borderWidth: 1, gap: 12, padding: 14 },
  cardTitle: { color: '#173421', fontSize: 16, fontWeight: '900' },
  cardDetail: { color: '#52604e', fontSize: 13, lineHeight: 19 },
  scanPreview: { backgroundColor: '#dfe5d8', borderRadius: 8, height: 210, width: '100%' },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryButton: { alignItems: 'center', backgroundColor: '#14532d', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12 },
  primaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  secondaryButtonCompact: { alignItems: 'center', backgroundColor: '#eef4ea', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  secondaryButtonText: { color: '#14532d', fontSize: 13, fontWeight: '900' },
  metricLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricChip: { backgroundColor: '#edf4e9', borderRadius: 999, color: '#31523b', fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 6 },
  subPanel: { backgroundColor: '#f7faf4', borderColor: '#e2eadb', borderRadius: 8, borderWidth: 1, gap: 8, padding: 12 },
  inputLabel: { color: '#52604e', fontSize: 12, fontWeight: '900' },
  resultBullet: { color: '#31523b', fontSize: 13, lineHeight: 19 },
});
