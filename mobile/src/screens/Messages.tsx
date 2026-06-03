import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiFetch } from '../lib/api';

type RecordRow = Record<string, unknown>;

export function MessagesScreen() {
  const [conversations, setConversations] = useState<RecordRow[]>([]);
  const [active, setActive] = useState<RecordRow | null>(null);
  const [messages, setMessages] = useState<RecordRow[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setConversations(extractRows(await apiFetch<unknown>('/messages/conversations')) as RecordRow[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load messages.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const openConversation = async (conversation: RecordRow) => {
    const id = firstText(conversation, ['id']);
    if (!id) return;
    setActive(conversation);
    setLoading(true);
    try {
      setMessages(extractRows(await apiFetch<unknown>(`/messages/conversations/${id}`)) as RecordRow[]);
    } catch (requestError) {
      Alert.alert('Could not open conversation', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    const id = active ? firstText(active, ['id']) : '';
    if (!id || !body.trim()) return;
    setSending(true);
    try {
      await apiFetch(`/messages/conversations/${id}/send`, { method: 'POST', body: { body: body.trim() } });
      setBody('');
      if (active) await openConversation(active);
    } catch (requestError) {
      Alert.alert('Message not sent', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setSending(false);
    }
  };

  if (active) {
    return (
      <View style={styles.screen}>
        <Pressable onPress={() => setActive(null)} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Back to conversations</Text>
        </Pressable>
        <Text style={styles.sectionTitle}>{firstText(active, ['other_name']) || 'Conversation'}</Text>
        {messages.length === 0 ? <StateMessage title="No messages yet" detail="Send the first message below." /> : null}
        {messages.map((message, index) => (
          <DataRow key={`message-${index}`} item={{ title: firstText(message, ['sender_name', 'sender_id']) || 'Message', detail: firstText(message, ['body', 'message']), meta: firstText(message, ['created_at']) }} />
        ))}
        <View style={styles.actionCard}>
          <TextInput placeholder="Write a message" placeholderTextColor="#7a8276" value={body} onChangeText={setBody} style={[styles.input, styles.textArea]} multiline />
          <Pressable onPress={send} disabled={sending || !body.trim()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{sending ? 'Sending...' : 'Send message'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {loading ? <StateMessage title="Loading" detail="Loading conversations..." /> : null}
      {error ? <StateMessage title="Could not load messages" detail={error} /> : null}
      {!loading && conversations.length === 0 ? (
        <StateMessage title="No conversations yet" detail="Messages from buyers, sellers, companies, and support will appear here." />
      ) : (
        conversations.map((conversation, index) => (
          <Pressable key={`conversation-${index}`} onPress={() => openConversation(conversation)} style={styles.actionCard}>
            <Text style={styles.cardTitle}>{firstText(conversation, ['other_name']) || 'Conversation'}</Text>
            <Text style={styles.cardDetail}>{firstText(conversation, ['last_message']) || 'Open conversation'}</Text>
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

function DataRow({ item }: { item: { title: string; detail?: string; meta?: string } }) {
  return (
    <View style={styles.dataRow}>
      <View style={styles.dataRowMain}>
        <Text style={styles.dataTitle}>{item.title}</Text>
        {item.detail ? <Text style={styles.dataDetail}>{item.detail}</Text> : null}
      </View>
      {item.meta ? <Text style={styles.dataMeta}>{item.meta}</Text> : null}
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
  const keys = ['conversations', 'messages', 'data'];
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

const styles = StyleSheet.create({
  screen: { gap: 14 },
  sectionTitle: { color: '#173421', fontSize: 20, fontWeight: '900' },
  actionCard: { backgroundColor: '#ffffff', borderColor: '#dfe5d8', borderRadius: 8, borderWidth: 1, gap: 10, padding: 14 },
  cardTitle: { color: '#173421', fontSize: 16, fontWeight: '900' },
  cardDetail: { color: '#52604e', fontSize: 13, lineHeight: 19 },
  input: { backgroundColor: '#ffffff', borderColor: '#d9e2d2', borderRadius: 8, borderWidth: 1, color: '#173421', fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  primaryButton: { alignItems: 'center', backgroundColor: '#14532d', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12 },
  primaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', backgroundColor: '#eef4ea', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11 },
  secondaryButtonText: { color: '#14532d', fontSize: 13, fontWeight: '900' },
  dataRow: { alignItems: 'flex-start', backgroundColor: '#ffffff', borderColor: '#e2eadb', borderRadius: 8, borderWidth: 1, gap: 6, padding: 12 },
  dataRowMain: { gap: 4 },
  dataTitle: { color: '#173421', fontSize: 14, fontWeight: '900' },
  dataDetail: { color: '#52604e', fontSize: 13, lineHeight: 18 },
  dataMeta: { color: '#7a8276', fontSize: 11, fontWeight: '800' },
  statePanel: { backgroundColor: '#eef4ea', borderRadius: 8, gap: 6, padding: 14 },
  stateTitle: { color: '#173421', fontSize: 16, fontWeight: '900' },
  stateDetail: { color: '#52604e', fontSize: 13, lineHeight: 19 },
});
