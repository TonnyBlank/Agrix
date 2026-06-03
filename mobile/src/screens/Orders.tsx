import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';

import { apiFetch } from '../lib/api';

type RecordRow = Record<string, unknown>;

export function OrdersScreen() {
  const [mode, setMode] = useState<'buying' | 'selling'>('buying');
  const [orders, setOrders] = useState<RecordRow[]>([]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const path = mode === 'buying' ? '/orders/buying' : '/orders/selling';
      setOrders(extractRows(await apiFetch<unknown>(path)) as RecordRow[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load orders.');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (order: RecordRow, status: string) => {
    const id = firstText(order, ['id']);
    if (!id) return;
    setBusyId(id);
    try {
      await apiFetch(`/orders/${id}/status`, { method: 'PATCH', body: { status } });
      await load();
    } catch (requestError) {
      Alert.alert('Order not updated', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const payOrder = async (order: RecordRow) => {
    const id = firstText(order, ['id']);
    if (!id || !phoneNumber.trim()) {
      Alert.alert('Phone needed', 'Enter the M-Pesa number before starting payment.');
      return;
    }
    setBusyId(id);
    try {
      const response = await apiFetch<RecordRow>(`/payments/orders/${id}/mpesa`, {
        method: 'POST',
        body: { phoneNumber: phoneNumber.trim() },
      });
      Alert.alert('Payment started', firstText(response, ['message', 'ResponseDescription']) || 'Check your phone for the M-Pesa prompt.');
      await load();
    } catch (requestError) {
      Alert.alert('Payment failed', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const checkOrderPayment = async (order: RecordRow) => {
    const id = firstText(order, ['id']);
    if (!id) return;
    setBusyId(id);
    try {
      const response = await apiFetch<RecordRow>(`/payments/orders/${id}/mpesa-status`);
      Alert.alert('Payment status', firstText(response, ['resultDesc', 'ResponseDescription', 'payment_status']) || summarizeRecord(response));
      await load();
    } catch (requestError) {
      Alert.alert('Could not check payment', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const submitDeliveryProof = async (order: RecordRow) => {
    const id = firstText(order, ['id']);
    if (!id || !proofUrl.trim()) {
      Alert.alert('Proof needed', 'Paste a delivery proof photo URL.');
      return;
    }
    setBusyId(id);
    try {
      let coords: { latitude?: number; longitude?: number } = {};
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.granted) {
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coords = current.coords;
      }
      await apiFetch(`/orders/${id}/delivery-proof`, {
        method: 'PATCH',
        body: { proof_photo_url: proofUrl.trim(), proof_geo_lat: coords.latitude, proof_geo_lng: coords.longitude },
      });
      setProofUrl('');
      await load();
      Alert.alert('Proof submitted', 'Delivery proof was saved for buyer confirmation.');
    } catch (requestError) {
      Alert.alert('Proof not submitted', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const requestDeliveryOtp = async (order: RecordRow) => {
    const id = firstText(order, ['id']);
    if (!id) return;
    setBusyId(id);
    try {
      const response = await apiFetch<RecordRow>(`/orders/${id}/delivery-otp/request`, { method: 'POST' });
      Alert.alert('Buyer OTP', firstText(response, ['otp_code', 'message']) || 'OTP created.');
      await load();
    } catch (requestError) {
      Alert.alert('Could not create OTP', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const verifyDeliveryOtp = async (order: RecordRow) => {
    const id = firstText(order, ['id']);
    if (!id || !otpCode.trim()) {
      Alert.alert('OTP needed', 'Enter the delivery confirmation OTP.');
      return;
    }
    setBusyId(id);
    try {
      const response = await apiFetch<RecordRow>(`/orders/${id}/delivery-otp/verify`, {
        method: 'POST',
        body: { otp_code: otpCode.trim() },
      });
      setOtpCode('');
      await load();
      Alert.alert('Delivery confirmed', firstText(response, ['message']) || 'Delivery confirmation was saved.');
    } catch (requestError) {
      Alert.alert('OTP not verified', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const raiseDispute = async (order: RecordRow) => {
    const id = firstText(order, ['id']);
    if (!id || !disputeReason.trim()) {
      Alert.alert('Reason needed', 'Enter why you are disputing this delivery.');
      return;
    }
    setBusyId(id);
    try {
      await apiFetch(`/orders/${id}/dispute`, { method: 'POST', body: { reason: disputeReason.trim() } });
      setDisputeReason('');
      await load();
      Alert.alert('Dispute opened', 'The order has been sent for admin review.');
    } catch (requestError) {
      Alert.alert('Dispute failed', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.segmented}>
        <Pressable onPress={() => setMode('buying')} style={[styles.segmentButton, mode === 'buying' && styles.segmentActive]}>
          <Text style={[styles.segmentText, mode === 'buying' && styles.segmentTextActive]}>Buying</Text>
        </Pressable>
        <Pressable onPress={() => setMode('selling')} style={[styles.segmentButton, mode === 'selling' && styles.segmentActive]}>
          <Text style={[styles.segmentText, mode === 'selling' && styles.segmentTextActive]}>Selling</Text>
        </Pressable>
      </View>
      {loading ? <StateMessage title="Loading" detail="Loading orders..." /> : null}
      {error ? <StateMessage title="Could not load orders" detail={error} /> : null}
      {!loading && orders.length === 0 ? (
        <StateMessage title="No orders yet" detail={mode === 'buying' ? 'Orders you place from the marketplace will appear here.' : 'Orders from buyers will appear here.'} />
      ) : (
        orders.map((order, index) => {
          const id = firstText(order, ['id']) || `${index}`;
          const product = nestedRecord(order, 'product') || order;
          return (
            <View key={id} style={styles.actionCard}>
              <Text style={styles.cardTitle}>{recordTitle(product)}</Text>
              <Text style={styles.cardDetail}>
                Status: {firstText(order, ['status']) || 'pending'} - Payment: {firstText(order, ['payment_status']) || 'unpaid'}
              </Text>
              <View style={styles.metricLine}>
                <Text style={styles.metricChip}>Qty {firstText(order, ['quantity']) || '-'}</Text>
                <Text style={styles.metricChip}>{formatMoney(getNumber(order, ['total_amount', 'total_price', 'amount']))}</Text>
              </View>
              <View style={styles.buttonRow}>
                {(mode === 'selling' ? ['processing', 'shipped', 'delivered'] : ['cancelled']).map((status) => (
                  <Pressable key={status} onPress={() => updateStatus(order, status)} disabled={busyId === id} style={styles.secondaryButtonCompact}>
                    <Text style={styles.secondaryButtonText}>{statusLabel(status)}</Text>
                  </Pressable>
                ))}
              </View>
              {mode === 'buying' && firstText(order, ['payment_status']) !== 'paid' ? (
                <View style={styles.subPanel}>
                  <Text style={styles.inputLabel}>Order payment</Text>
                  <TextInput keyboardType="phone-pad" placeholder="M-Pesa number" placeholderTextColor="#7a8276" value={phoneNumber} onChangeText={setPhoneNumber} style={styles.input} />
                  <View style={styles.buttonRow}>
                    <Pressable onPress={() => payOrder(order)} disabled={busyId === id} style={styles.secondaryButtonCompact}>
                      <Text style={styles.secondaryButtonText}>Pay</Text>
                    </Pressable>
                    <Pressable onPress={() => checkOrderPayment(order)} disabled={busyId === id} style={styles.secondaryButtonCompact}>
                      <Text style={styles.secondaryButtonText}>Check</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
              {mode === 'selling' ? (
                <View style={styles.subPanel}>
                  <Text style={styles.inputLabel}>Delivery proof</Text>
                  <TextInput placeholder="Proof photo URL" placeholderTextColor="#7a8276" value={proofUrl} onChangeText={setProofUrl} style={styles.input} />
                  <View style={styles.buttonRow}>
                    <Pressable onPress={() => submitDeliveryProof(order)} disabled={busyId === id} style={styles.secondaryButtonCompact}>
                      <Text style={styles.secondaryButtonText}>Save proof</Text>
                    </Pressable>
                    <Pressable onPress={() => requestDeliveryOtp(order)} disabled={busyId === id} style={styles.secondaryButtonCompact}>
                      <Text style={styles.secondaryButtonText}>Get OTP</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
              {mode === 'buying' ? (
                <View style={styles.subPanel}>
                  <Text style={styles.inputLabel}>Delivery confirmation</Text>
                  <TextInput keyboardType="numeric" placeholder="OTP from seller" placeholderTextColor="#7a8276" value={otpCode} onChangeText={setOtpCode} style={styles.input} />
                  <Pressable onPress={() => verifyDeliveryOtp(order)} disabled={busyId === id} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Confirm delivery</Text>
                  </Pressable>
                  <TextInput placeholder="Dispute reason" placeholderTextColor="#7a8276" value={disputeReason} onChangeText={setDisputeReason} style={styles.input} />
                  <Pressable onPress={() => raiseDispute(order)} disabled={busyId === id} style={styles.dangerButtonSmall}>
                    <Text style={styles.dangerButtonText}>Open dispute</Text>
                  </Pressable>
                </View>
              ) : null}
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

function summarizeRecord(record: RecordRow) {
  return Object.entries(record)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('\n');
}

function recordTitle(record: RecordRow) {
  return firstText(record, ['title', 'name', 'full_name', 'company_name', 'product_name', 'product_title', 'crop_name']) || firstText(record, ['status']) || 'Record';
}

function nestedRecord(record: RecordRow, key: string) {
  const value = record[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordRow) : null;
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

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const styles = StyleSheet.create({
  screen: { gap: 14 },
  segmented: { backgroundColor: '#e4ebdf', borderRadius: 8, flexDirection: 'row', padding: 4 },
  segmentButton: { alignItems: 'center', borderRadius: 6, flex: 1, paddingVertical: 10 },
  segmentActive: { backgroundColor: '#ffffff' },
  segmentText: { color: '#52604e', fontSize: 13, fontWeight: '800' },
  segmentTextActive: { color: '#123d24' },
  actionCard: { backgroundColor: '#ffffff', borderColor: '#dfe5d8', borderRadius: 8, borderWidth: 1, gap: 12, padding: 14 },
  cardTitle: { color: '#173421', fontSize: 16, fontWeight: '900' },
  cardDetail: { color: '#52604e', fontSize: 13, lineHeight: 19 },
  metricLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricChip: { backgroundColor: '#edf4e9', borderRadius: 999, color: '#31523b', fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 6 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondaryButton: { alignItems: 'center', backgroundColor: '#eef4ea', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11 },
  secondaryButtonCompact: { alignItems: 'center', backgroundColor: '#eef4ea', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  secondaryButtonText: { color: '#14532d', fontSize: 13, fontWeight: '900' },
  subPanel: { backgroundColor: '#f7faf4', borderColor: '#e2eadb', borderRadius: 8, borderWidth: 1, gap: 9, padding: 12 },
  inputLabel: { color: '#52604e', fontSize: 12, fontWeight: '900' },
  input: { backgroundColor: '#ffffff', borderColor: '#d9e2d2', borderRadius: 8, borderWidth: 1, color: '#173421', fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  dangerButtonSmall: { alignItems: 'center', backgroundColor: '#fee2e2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  dangerButtonText: { color: '#991b1b', fontSize: 13, fontWeight: '900' },
  statePanel: { backgroundColor: '#eef4ea', borderRadius: 8, gap: 6, padding: 14 },
  stateTitle: { color: '#173421', fontSize: 16, fontWeight: '900' },
  stateDetail: { color: '#52604e', fontSize: 13, lineHeight: 19 },
});
