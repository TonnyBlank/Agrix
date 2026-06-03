import { supabase } from './supabase';

const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  'http://127.0.0.1:3001/api';

export const API_BASE_URL = apiBaseUrl;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const ROLE_STORAGE_PREFIX = 'agrilink:active-role:';

async function readStoredRole(userId: string): Promise<string | null> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    return await AsyncStorage.getItem(`${ROLE_STORAGE_PREFIX}${userId}`);
  } catch {
    return null;
  }
}

export async function setStoredRole(userId: string, role: string | null) {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const key = `${ROLE_STORAGE_PREFIX}${userId}`;
    if (role) await AsyncStorage.setItem(key, role);
    else await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new ApiError('Sign in again to continue.', 401);
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);

  const storedRole = await readStoredRole(session.user.id);
  if (storedRole) headers.set('X-AgriLink-Role', storedRole);

  let body = init.body;
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers,
      body,
    });
  } catch {
    throw new ApiError(`Could not reach the backend at ${apiBaseUrl}.`, 0);
  }

  if (!response.ok) {
    const rawText = await response.text();
    let message = `Request failed with status ${response.status}`;

    if (rawText) {
      try {
        const payload = JSON.parse(rawText);
        message = payload.error || payload.message || message;
      } catch {
        message = rawText;
      }
    }

    if (response.status === 401) {
      await supabase.auth.signOut();
    }

    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
