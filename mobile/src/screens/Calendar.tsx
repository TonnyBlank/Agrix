import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiFetch } from '../lib/api';

type RecordRow = Record<string, unknown>;

const cropEventTypeOptions = [
  { label: 'Planting', value: 'planting' },
  { label: 'Spraying', value: 'spraying' },
  { label: 'Harvest', value: 'harvest' },
  { label: 'Reminder', value: 'reminder' },
];

export function CalendarScreen() {
  const [events, setEvents] = useState<RecordRow[]>([]);
  const [form, setForm] = useState({ title: '', crop: '', type: '', event_date: '', notes: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEvents(extractRows(await apiFetch<unknown>('/crop-events')) as RecordRow[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load crop calendar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!form.title.trim() || !form.crop.trim() || !form.type.trim() || !form.event_date.trim()) {
      Alert.alert('Missing event details', 'Title, crop, activity type, and date are required.');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/crop-events', { method: 'POST', body: form });
      setForm({ title: '', crop: '', type: '', event_date: '', notes: '' });
      await load();
    } catch (requestError) {
      Alert.alert('Could not save event', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const setRelativeDate = (days: number) => {
    const next = new Date();
    next.setDate(next.getDate() + days);
    setForm((current) => ({ ...current, event_date: toDateInput(next) }));
  };

  const toggleDone = async (event: RecordRow) => {
    const id = firstText(event, ['id']);
    if (!id) return;
    try {
      await apiFetch(`/crop-events/${id}`, { method: 'PATCH', body: { done: !Boolean(event.done) } });
      await load();
    } catch (requestError) {
      Alert.alert('Could not update event', requestError instanceof Error ? requestError.message : 'Try again.');
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.actionCard}>
        <Text style={styles.cardTitle}>Add crop activity</Text>
        <TextInput placeholder="Title" placeholderTextColor="#7a8276" value={form.title} onChangeText={(value) => setForm((current) => ({ ...current, title: value }))} style={styles.input} />
        <TextInput placeholder="Crop" placeholderTextColor="#7a8276" value={form.crop} onChangeText={(value) => setForm((current) => ({ ...current, crop: value }))} style={styles.input} />
        <Text style={styles.inputLabel}>Activity type</Text>
        <SegmentedOptions value={form.type} options={cropEventTypeOptions} onChange={(value) => setForm((current) => ({ ...current, type: value }))} />
        <TextInput placeholder="Date YYYY-MM-DD" placeholderTextColor="#7a8276" value={form.event_date} onChangeText={(value) => setForm((current) => ({ ...current, event_date: value }))} style={styles.input} />
        <View style={styles.buttonRow}>
          <Pressable onPress={() => setRelativeDate(0)} style={styles.secondaryButtonCompact}>
            <Text style={styles.secondaryButtonText}>Today</Text>
          </Pressable>
          <Pressable onPress={() => setRelativeDate(1)} style={styles.secondaryButtonCompact}>
            <Text style={styles.secondaryButtonText}>Tomorrow</Text>
          </Pressable>
          <Pressable onPress={() => setRelativeDate(7)} style={styles.secondaryButtonCompact}>
            <Text style={styles.secondaryButtonText}>Next week</Text>
          </Pressable>
        </View>
        <TextInput placeholder="Notes" placeholderTextColor="#7a8276" value={form.notes} onChangeText={(value) => setForm((current) => ({ ...current, notes: value }))} style={[styles.input, styles.textArea]} multiline />
        <Pressable onPress={save} disabled={saving} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save activity'}</Text>
        </Pressable>
      </View>
      {loading ? <StateMessage title="Loading" detail="Loading crop activities..." /> : null}
      {error ? <StateMessage title="Could not load calendar" detail={error} /> : null}
      {!loading && events.length === 0 ? (
        <StateMessage title="No activities yet" detail="Add planting, spraying, harvest, and follow-up reminders here." />
      ) : (
        events.map((event, index) => (
          <Pressable key={`event-${index}`} onPress={() => toggleDone(event)} style={styles.actionCard}>
            <Text style={styles.cardTitle}>{recordTitle(event)}</Text>
            <Text style={styles.cardDetail}>
              {firstText(event, ['crop'])} - {firstText(event, ['type'])} - {firstText(event, ['event_date'])}
            </Text>
            <Text style={styles.rowMeta}>{Boolean(event.done) ? 'Done' : 'Tap to mark done'}</Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

function SegmentedOptions({ value, options, onChange }: { value: string; options: { label: string; value: string }[]; onChange: (value: string) => void }) {
  return (
    <View style={styles.segmentedWrap}>
      {options.map((option) => (
        <Pressable key={option.value} onPress={() => onChange(option.value)} style={[styles.optionChip, value === option.value && styles.optionChipActive]}>
          <Text style={[styles.optionChipText, value === option.value && styles.optionChipTextActive]}>{option.label}</Text>
        </Pressable>
      ))}
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
  const keys = ['events', 'crop_events', 'data'];
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
  return firstText(record, ['title', 'name', 'crop_name']) || 'Crop activity';
}

function toDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  screen: { gap: 14 },
  actionCard: { backgroundColor: '#ffffff', borderColor: '#dfe5d8', borderRadius: 8, borderWidth: 1, gap: 12, padding: 14 },
  cardTitle: { color: '#173421', fontSize: 16, fontWeight: '900' },
  cardDetail: { color: '#52604e', fontSize: 13, lineHeight: 19 },
  inputLabel: { color: '#52604e', fontSize: 12, fontWeight: '900' },
  input: { backgroundColor: '#ffffff', borderColor: '#d9e2d2', borderRadius: 8, borderWidth: 1, color: '#173421', fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryButton: { alignItems: 'center', backgroundColor: '#14532d', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12 },
  primaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  secondaryButtonCompact: { alignItems: 'center', backgroundColor: '#eef4ea', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  secondaryButtonText: { color: '#14532d', fontSize: 13, fontWeight: '900' },
  segmentedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: { backgroundColor: '#eef4ea', borderColor: '#dfe8d8', borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  optionChipActive: { backgroundColor: '#14532d', borderColor: '#14532d' },
  optionChipText: { color: '#31523b', fontSize: 12, fontWeight: '900' },
  optionChipTextActive: { color: '#ffffff' },
  rowMeta: { color: '#7a8276', fontSize: 12, fontWeight: '800' },
  statePanel: { backgroundColor: '#eef4ea', borderRadius: 8, gap: 6, padding: 14 },
  stateTitle: { color: '#173421', fontSize: 16, fontWeight: '900' },
  stateDetail: { color: '#52604e', fontSize: 13, lineHeight: 19 },
});
