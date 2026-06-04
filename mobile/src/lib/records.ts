// Shared row-extractor helpers used by mobile screens.
// Centralised so screens stay short and don't re-implement the same logic.

export type RecordRow = Record<string, unknown>;

const unwrapKeys = [
  'products', 'orders', 'requests', 'responses', 'partners', 'companies',
  'notifications', 'conversations', 'applications', 'profile', 'company',
  'items', 'cart', 'data',
];

export function extractRows(data: unknown): RecordRow[] {
  const value = unwrap(data);
  if (Array.isArray(value)) return value as RecordRow[];
  if (value && typeof value === 'object') return [value as RecordRow];
  return [];
}

function unwrap(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const record = data as Record<string, unknown>;
  for (const key of unwrapKeys) {
    if (key in record) return record[key];
  }
  return data;
}

export function firstText(record: RecordRow | null | undefined, keys: string[]) {
  if (!record) return '';
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return '';
}

export function getNumber(record: RecordRow | null | undefined, keys: string[]) {
  if (!record) return 0;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return 0;
}

export function nestedRecord(record: RecordRow, key: string): RecordRow | null {
  const value = record[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordRow)
    : null;
}

export function recordTitle(record: RecordRow) {
  return (
    firstText(record, ['title', 'name', 'full_name', 'company_name', 'product_name', 'product_title', 'crop_name']) ||
    firstText(record, ['status']) ||
    'Record'
  );
}

export function formatMoney(value: number) {
  return `KES ${Math.round(value).toLocaleString('en-KE')}`;
}
