import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

type LocalSubscription = {
  role: AppRole;
  expiresAt: string | null;
};

type StoredRoleOptions =
  | number
  | {
      durationMs?: number | null;
      expiresAt?: string | null;
    };

const STORAGE_PREFIX = "mock_role_";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function getStorageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function isPaidRole(role: AppRole) {
  return role === "farmer_pro" || role === "company";
}

export function getStoredRole(userId: string): AppRole | null {
  const raw = localStorage.getItem(getStorageKey(userId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as LocalSubscription | AppRole;

    if (typeof parsed === "string") {
      if (isPaidRole(parsed)) {
        localStorage.removeItem(getStorageKey(userId));
        return null;
      }
      return parsed;
    }

    if (!parsed.expiresAt) {
      if (isPaidRole(parsed.role)) {
        localStorage.removeItem(getStorageKey(userId));
        return null;
      }
      return parsed.role;
    }

    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(getStorageKey(userId));
      return null;
    }

    return parsed.role;
  } catch {
    localStorage.removeItem(getStorageKey(userId));
    return null;
  }
}

function resolveExpiry(role: AppRole, options: StoredRoleOptions): string | null {
  if (typeof options === "number") {
    return options > 0 ? new Date(Date.now() + options).toISOString() : null;
  }

  if (options.expiresAt !== undefined) {
    return options.expiresAt;
  }

  if (options.durationMs !== undefined) {
    return options.durationMs && options.durationMs > 0 ? new Date(Date.now() + options.durationMs).toISOString() : null;
  }

  if (!isPaidRole(role)) {
    return null;
  }

  return new Date(Date.now() + THIRTY_DAYS_MS).toISOString();
}

export function setStoredRole(userId: string, role: AppRole, options: StoredRoleOptions = {}) {
  const payload: LocalSubscription = {
    role,
    expiresAt: resolveExpiry(role, options),
  };

  localStorage.setItem(getStorageKey(userId), JSON.stringify(payload));
}

export function clearStoredRole(userId: string) {
  localStorage.removeItem(getStorageKey(userId));
}
