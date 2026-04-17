import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { apiFetch } from "@/lib/api";
import { clearStoredRole, getStoredRole, setStoredRole } from "@/lib/subscription";

type AppRole = Database["public"]["Enums"]["app_role"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setActiveRole: (role: AppRole, options?: { expiresAt?: string | null }) => void;
  applyProfileUpdate: (profile: Profile) => void;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  role: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
  setActiveRole: () => {},
  applyProfileUpdate: () => {},
});

async function loadProfileFromSupabase(userId: string, fallbackFullName?: string | null) {
  let { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) throw profileError;

  if (!profileData) {
    const { data: createdProfile, error: createError } = await supabase
      .from("profiles")
      .insert({ user_id: userId, full_name: fallbackFullName || null })
      .select("*")
      .single();

    if (createError) throw createError;
    profileData = createdProfile;
  }

  return profileData;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const authRequestIdRef = useRef(0);
  const lastHandledAccessTokenRef = useRef<string | null>(null);

  const syncStoredRole = (userId: string, nextRole: AppRole, expiresAt?: string | null) => {
    if (nextRole === "farmer_pro" || nextRole === "company") {
      setStoredRole(userId, nextRole, { expiresAt: expiresAt ?? null });
      return;
    }

    clearStoredRole(userId);
  };

  const fetchUserData = async (userId: string, fallbackFullName?: string | null) => {
    const requestId = ++authRequestIdRef.current;
    try {
      const data = await apiFetch<{ profile: Profile; role: AppRole | null }>("/profiles/me");
      if (requestId !== authRequestIdRef.current) return;
      setProfile(data.profile);
      if (data.role) {
        setRole(data.role);
        syncStoredRole(userId, data.role, data.profile?.plan_expires_at ?? null);
      } else {
        const localRole = getStoredRole(userId);
        setRole(localRole || "farmer_free");
      }
    } catch (error) {
      console.error("Failed to load auth context from API, falling back to Supabase", error);

      try {
        const profileData = await loadProfileFromSupabase(userId, fallbackFullName);
        if (requestId !== authRequestIdRef.current) return;
        setProfile(profileData);

        const localRole = getStoredRole(userId);
        setRole(localRole || "farmer_free");
      } catch (fallbackError) {
        console.error("Failed to load auth context from Supabase", fallbackError);
        if (requestId !== authRequestIdRef.current) return;
        setProfile(null);
        setRole("farmer_free"); // Default to farmer_free to avoid redirect loops
      }
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchUserData(user.id);
  };

  const setActiveRole = (nextRole: AppRole, options?: { expiresAt?: string | null }) => {
    setRole(nextRole);

    if (user) {
      syncStoredRole(user.id, nextRole, options?.expiresAt ?? null);
    }
  };

  const applyProfileUpdate = (nextProfile: Profile) => {
    setProfile(nextProfile);
  };

  useEffect(() => {
    let mounted = true;

    const applySession = async (nextSession: Session | null) => {
      if (!mounted) return;

      if (!nextSession) {
        authRequestIdRef.current += 1;
        lastHandledAccessTokenRef.current = null;
        setSession(null);
        setUser(null);
        setProfile(null);
        setRole(null);
        return;
      }

      if (lastHandledAccessTokenRef.current === nextSession.access_token) {
        setSession(nextSession);
        setUser(nextSession.user);
        return;
      }

      lastHandledAccessTokenRef.current = nextSession.access_token;
      setSession(nextSession);
      setUser(nextSession.user);
      const fallbackFullName =
        typeof nextSession.user.user_metadata?.full_name === "string"
          ? nextSession.user.user_metadata.full_name
          : null;
      await fetchUserData(nextSession.user.id, fallbackFullName);
    };

    const initAuth = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        await applySession(currentSession);
      } catch (e) {
        console.error("Auth initialization failed", e);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setLoading(true);
      try {
        await applySession(nextSession);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    if (user) {
      clearStoredRole(user.id);
    }
    setSession(null);
    setUser(null);
    setProfile(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, role, loading, signOut, refreshProfile, setActiveRole, applyProfileUpdate }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
