import { supabase } from "@/integrations/supabase/client";
import { getStoredRole } from "@/lib/subscription";
import type { Session } from "@supabase/supabase-js";

function resolveApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL;
  if (configuredUrl) return configuredUrl;

  if (typeof window !== "undefined") {
    if (window.location.port === "8080") {
      const apiUrl = new URL(window.location.origin);
      apiUrl.port = "3001";
      apiUrl.pathname = "/api";
      apiUrl.search = "";
      apiUrl.hash = "";
      return apiUrl.toString().replace(/\/$/, "");
    }

    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:3001/api";
    }
    return `${window.location.origin}/api`;
  }

  return "http://localhost:3001/api";
}

export const API_BASE_URL = resolveApiBaseUrl();

let cachedSession: Session | null = null;
let sessionPromise: Promise<Session | null> | null = null;
let authListenerInitialized = false;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function isJsonBody(value: unknown) {
  return value && typeof value === "object" && !isFormData(value);
}

function ensureAuthCacheInitialized() {
  if (authListenerInitialized) return;
  authListenerInitialized = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedSession = session;
    sessionPromise = null;
  });
}

async function getCachedSession() {
  ensureAuthCacheInitialized();

  if (cachedSession) {
    return cachedSession;
  }

  if (!sessionPromise) {
    sessionPromise = supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        cachedSession = session;
        return session;
      })
      .finally(() => {
        sessionPromise = null;
      });
  }

  return sessionPromise;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  options: { auth?: boolean } = { auth: true },
): Promise<T> {
  const headers = new Headers(init.headers);

  if (options.auth !== false) {
    const session = await getCachedSession();

    if (!session?.access_token) {
      throw new ApiError("You are not signed in. Please log in and try again.", 401);
    }

    headers.set("Authorization", `Bearer ${session.access_token}`);

    const localRole = getStoredRole(session.user.id);
    if (localRole) {
      headers.set("X-AgriLink-Role", localRole);
    }
  }

  let body = init.body;
  if (isJsonBody(init.body)) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      body,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message === "Failed to fetch"
        ? `Could not reach the backend at ${API_BASE_URL}. Make sure the API server is running and accessible.`
        : error instanceof Error
          ? error.message
          : "Network request failed";
    throw new ApiError(message, 0);
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const errorPayload = await response.json();
      message = errorPayload.error || errorPayload.message || message;
    } catch {
      const text = await response.text();
      if (text) message = text;
    }

    if (response.status === 401) {
      await supabase.auth.signOut();
      throw new ApiError("Your session expired. Please log in again.", 401);
    }

    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
