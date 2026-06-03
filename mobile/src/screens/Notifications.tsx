import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { apiFetch } from '../lib/api';

type RecordRow = Record<string, unknown>;

export type NotificationPrefs = {
  orderAlerts: boolean;
  loanAlerts: boolean;
  messageAlerts: boolean;
};

export function NotificationsScreen({ prefs }: { prefs: NotificationPrefs }) {
  const [notifications, setNotifications] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setNotifications(extractRows(await apiFetch<unknown>('/notifications?limit=80')) as RecordRow[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (notification: RecordRow) => {
    const id = firstText(notification, ['id']);
    if (!id) return;
    try {
      await apiFetch(`/notifications/${id}/read`, { method: 'PATCH' });
      await load();
    } catch (requestError) {
      Alert.alert('Could not update notification', requestError instanceof Error ? requestError.message : 'Try again.');
    }
  };

  const markAllRead = async () => {
    try {
      await apiFetch('/notifications/read-all', { method: 'PATCH' });
      await load();
    } catch (requestError) {
      Alert.alert('Could not update notifications', requestError instanceof Error ? requestError.message : 'Try again.');
    }
  };

  const visibleNotifications = filterNotificationsByPrefs(notifications, prefs);

  return (
    <View style={styles.screen}>
      <Pressable onPress={markAllRead} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Mark all read</Text>
      </Pressable>
      {loading ? <StateMessage title="Loading" detail="Loading notifications..." /> : null}
      {error ? <StateMessage title="Could not load notifications" detail={error} /> : null}
      {!loading && visibleNotifications.length === 0 ? (
        <StateMessage title="No notifications" detail="You are all caught up." />
      ) : (
        visibleNotifications.map((notification, index) => (
          <Pressable key={`notification-${index}`} onPress={() => markRead(notification)} style={styles.actionCard}>
            <Text style={styles.cardTitle}>{firstText(notification, ['title']) || 'Notification'}</Text>
            <Text style={styles.cardDetail}>{firstText(notification, ['message']) || summarizeRecord(notification)}</Text>
            <View style={styles.metricLine}>
              <Text style={styles.metricChip}>{firstText(notification, ['priority']) || 'normal'}</Text>
              <Text style={styles.metricChip}>{firstText(notification, ['read_at']) ? 'Read' : 'Unread'}</Text>
            </View>
          </Pressable>
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

function filterNotificationsByPrefs(notifications: RecordRow[], prefs: NotificationPrefs) {
  return notifications.filter((notification) => {
    const type = firstText(notification, ['type', 'category']).toLowerCase();
    if (!prefs.orderAlerts && type.includes('order')) return false;
    if (!prefs.loanAlerts && type.includes('loan')) return false;
    if (!prefs.messageAlerts && (type.includes('message') || type.includes('chat'))) return false;
    return true;
  });
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
  const keys = ['notifications', 'data'];
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

const styles = StyleSheet.create({
  screen: { gap: 14 },
  actionCard: { backgroundColor: '#ffffff', borderColor: '#dfe5d8', borderRadius: 8, borderWidth: 1, gap: 10, padding: 14 },
  cardTitle: { color: '#173421', fontSize: 16, fontWeight: '900' },
  cardDetail: { color: '#52604e', fontSize: 13, lineHeight: 19 },
  metricLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricChip: { backgroundColor: '#edf4e9', borderRadius: 999, color: '#31523b', fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 6 },
  secondaryButton: { alignItems: 'center', backgroundColor: '#eef4ea', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11 },
  secondaryButtonText: { color: '#14532d', fontSize: 13, fontWeight: '900' },
  statePanel: { backgroundColor: '#eef4ea', borderRadius: 8, gap: 6, padding: 14 },
  stateTitle: { color: '#173421', fontSize: 16, fontWeight: '900' },
  stateDetail: { color: '#52604e', fontSize: 13, lineHeight: 19 },
});
