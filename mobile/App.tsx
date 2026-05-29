import type { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  type AppRole,
  type MobileRoute,
  type MobileRouteKey,
  getVisibleRoutes,
} from './src/config/navigation';
import { apiFetch } from './src/lib/api';
import { supabase } from './src/lib/supabase';

type Profile = {
  full_name?: string | null;
  county?: string | null;
  phone?: string | null;
  plan_expires_at?: string | null;
};

type ProfileResponse = {
  profile: Profile;
  role: AppRole | null;
};

const bottomKeys: MobileRouteKey[] = ['dashboard', 'marketplace', 'microLoans', 'messages', 'profile'];

const routeDescriptions: Partial<Record<MobileRouteKey, string>> = {
  performance: 'Revenue, orders, listings, and operational performance.',
  farm: 'Farm profile, county, crops, and field information.',
  products: 'Create and manage produce listings shown to buyers.',
  marketplace: 'Browse available produce and company products.',
  cart: 'Review selected items before checkout.',
  messages: 'Buyer, company, admin, and support conversations.',
  orders: 'Track buying and selling order workflows.',
  notifications: 'Important account, order, loan, and admin updates.',
  activity: 'Recent movement across your AgriLink account.',
  discover: 'Companies, procurement requests, and farmer opportunities.',
  scanner: 'AI crop health checks and field diagnosis.',
  calendar: 'Crop events, reminders, and planting windows.',
  dealMatches: 'Buyer opportunities matched to your listings.',
  community: 'Farmer and buyer network activity.',
  microLoans: 'Loan applications, status, and repayments.',
  upgrade: 'Unlock Pro tools, scanner, and finance workflows.',
  companyHub: 'Company profile, verification, and operating summary.',
  companyProducts: 'Company product catalogue management.',
  companyPartners: 'Farmer partners and sourcing relationships.',
  companyOrders: 'Company-side marketplace order management.',
  companyProcurement: 'Procurement requests and farmer responses.',
  companySettings: 'Company profile and verification settings.',
  adminOverview: 'Platform summary for users, orders, loans, and reviews.',
  adminLoans: 'Loan offers available to farmers and companies.',
  adminLoanDecisions: 'Review and decide submitted loan applications.',
  adminTransactions: 'Order payments, delivery signoff, and payouts.',
  adminDisputes: 'Resolve delivery and marketplace disputes.',
  adminCompanies: 'Review and verify company accounts.',
  adminVerifications: 'Review ID verification submissions.',
  adminFeatureFlags: 'Control feature availability by user role.',
  adminAuditLogs: 'Admin action history and platform audit trail.',
  adminUsers: 'User roles and account summaries.',
  profile: 'Personal profile, county, phone, plan, and sign out.',
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [activeKey, setActiveKey] = useState<MobileRouteKey>('dashboard');
  const [loadingAuth, setLoadingAuth] = useState(true);

  const loadProfile = useCallback(async () => {
    const data = await apiFetch<ProfileResponse>('/profiles/me');
    setProfile(data.profile);
    setRole(data.role ?? 'farmer_free');
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) {
        try {
          await loadProfile();
        } catch (error) {
          console.warn(error);
        }
      }
      setLoadingAuth(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        await loadProfile();
      } else {
        setProfile(null);
        setRole(null);
        setActiveKey('dashboard');
      }
      setLoadingAuth(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  if (loadingAuth) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator color="#2f6b3f" size="large" />
        <Text style={styles.loadingText}>Opening AgriLink X</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <MobileShell
      activeKey={activeKey}
      profile={profile}
      role={role}
      setActiveKey={setActiveKey}
      refreshProfile={loadProfile}
    />
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing details', 'Enter your email and password.');
      return;
    }

    if (mode === 'signup') {
      if (!fullName.trim()) {
        Alert.alert('Missing name', 'Enter your full name to create an account.');
        return;
      }

      if (password.length < 6) {
        Alert.alert('Password too short', 'Use at least 6 characters.');
        return;
      }

      if (password !== confirmPassword) {
        Alert.alert('Passwords do not match', 'Make sure both password fields are the same.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (error) throw error;
        Alert.alert('Account created', 'Sign in with your email and password to continue.');
        setMode('signin');
      }
    } catch (error) {
      Alert.alert('Authentication failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.authSafeArea}>
      <StatusBar style="light" />
      <View style={styles.authScreen}>
        <View style={styles.authTop}>
          <View style={styles.brandRow}>
            <View style={styles.logoMark}>
              <Text style={styles.logoText}>A</Text>
            </View>
            <View>
              <Text style={styles.authBrand}>AgriLink X</Text>
              <Text style={styles.authKicker}>Kenya agriculture platform</Text>
            </View>
          </View>
          <Text style={styles.authTitle}>
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </Text>
          <Text style={styles.authSubtitle}>
            {mode === 'signin'
              ? 'Sign in to access the same dashboard, marketplace, loans, and messages from the web platform.'
              : 'Start with a free farmer account. Upgrade later when you need Pro tools and finance workflows.'}
          </Text>
        </View>

        <View style={styles.authPanel}>
          <View style={styles.segmented}>
            <Pressable
              onPress={() => setMode('signin')}
              style={[styles.segmentButton, mode === 'signin' && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, mode === 'signin' && styles.segmentTextActive]}>
                Sign in
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('signup')}
              style={[styles.segmentButton, mode === 'signup' && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, mode === 'signup' && styles.segmentTextActive]}>
                Create
              </Text>
            </Pressable>
          </View>

          {mode === 'signup' && (
            <TextInput
              placeholder="Full name"
              placeholderTextColor="#7a8276"
              value={fullName}
              onChangeText={setFullName}
              style={styles.input}
            />
          )}
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email address"
            placeholderTextColor="#7a8276"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />
          <TextInput
            placeholder="Password"
            placeholderTextColor="#7a8276"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={styles.input}
          />
          {mode === 'signup' && (
            <TextInput
              placeholder="Confirm password"
              placeholderTextColor="#7a8276"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              style={styles.input}
            />
          )}

          <Pressable onPress={submit} disabled={submitting} style={styles.primaryButton}>
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </Text>
            )}
          </Pressable>

          <Text style={styles.authFootnote}>
            {mode === 'signin'
              ? 'Use the same email and password you use on the web app.'
              : 'By creating an account, your profile is shared across web and mobile.'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function MobileShell({
  activeKey,
  profile,
  role,
  setActiveKey,
  refreshProfile,
}: {
  activeKey: MobileRouteKey;
  profile: Profile | null;
  role: AppRole | null;
  setActiveKey: (key: MobileRouteKey) => void;
  refreshProfile: () => Promise<void>;
}) {
  const routes = useMemo(() => getVisibleRoutes(role), [role]);
  const activeRoute = routes.find((route) => route.key === activeKey) ?? routes[0];
  const bottomRoutes = bottomKeys
    .map((key) => routes.find((route) => route.key === key))
    .filter(Boolean) as MobileRoute[];

  useEffect(() => {
    if (!routes.some((route) => route.key === activeKey)) {
      setActiveKey('dashboard');
    }
  }, [activeKey, routes, setActiveKey]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.app}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>AgriLink X</Text>
            <Text style={styles.headerTitle}>{activeRoute.title}</Text>
          </View>
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>{formatRole(role)}</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refreshProfile} />}
          showsVerticalScrollIndicator={false}
        >
          {activeRoute.key === 'dashboard' ? (
            <DashboardScreen profile={profile} role={role} routes={routes} setActiveKey={setActiveKey} />
          ) : activeRoute.key === 'profile' ? (
            <ProfileScreen profile={profile} role={role} />
          ) : activeRoute.endpoint ? (
            <ConnectedScreen route={activeRoute} />
          ) : (
            <ComingSoonScreen route={activeRoute} />
          )}
        </ScrollView>

        <View style={styles.tabBar}>
          {bottomRoutes.map((route) => {
            const active = route.key === activeRoute.key;
            return (
              <Pressable
                key={route.key}
                onPress={() => setActiveKey(route.key)}
                style={[styles.tabButton, active && styles.tabButtonActive]}
              >
                <Text style={[styles.tabInitial, active && styles.tabActiveText]}>
                  {route.title.slice(0, 1)}
                </Text>
                <Text style={[styles.tabText, active && styles.tabActiveText]} numberOfLines={1}>
                  {shortLabel(route.title)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

function DashboardScreen({
  profile,
  role,
  routes,
  setActiveKey,
}: {
  profile: Profile | null;
  role: AppRole | null;
  routes: MobileRoute[];
  setActiveKey: (key: MobileRouteKey) => void;
}) {
  const grouped = routes.reduce<Record<string, MobileRoute[]>>((acc, route) => {
    if (route.key === 'dashboard') return acc;
    acc[route.section] = [...(acc[route.section] ?? []), route];
    return acc;
  }, {});

  return (
    <View style={styles.screen}>
      <View style={styles.heroPanel}>
        <Text style={styles.panelLabel}>{formatRole(role).toUpperCase()}</Text>
        <Text style={styles.bigName}>{profile?.full_name || 'AgriLink User'}</Text>
        <Text style={styles.panelNote}>
          {profile?.county || 'Set your county'} - Web and mobile use the same account data.
        </Text>
      </View>

      <DashboardSummary role={role} />

      <View style={styles.quickActions}>
        <Pressable
          onPress={() => setActiveKey(role === 'company' ? 'companyProducts' : 'products')}
          style={styles.quickButton}
        >
          <Text style={styles.quickButtonText}>{role === 'company' ? 'Add product' : 'Add listing'}</Text>
        </Pressable>
        <Pressable onPress={() => setActiveKey('messages')} style={styles.quickButtonLight}>
          <Text style={styles.quickButtonLightText}>Reply to buyers</Text>
        </Pressable>
      </View>

      {Object.entries(grouped).map(([section, items]) => (
        <View key={section}>
          <Text style={styles.sectionTitle}>{section}</Text>
          <View style={styles.grid}>
            {items.map((route) => (
              <Pressable key={route.key} onPress={() => setActiveKey(route.key)} style={styles.gridButton}>
                <View style={styles.gridIcon}>
                  <Text style={styles.gridInitial}>{route.title.slice(0, 1)}</Text>
                </View>
                <Text style={styles.gridText}>{route.title}</Text>
                <Text style={styles.gridDescription}>
                  {routeDescriptions[route.key] || 'Open the matching web platform feature in mobile layout.'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function DashboardSummary({ role }: { role: AppRole | null }) {
  const [summary, setSummary] = useState({
    products: 0,
    pendingOrders: 0,
    unreadMessages: 0,
    notifications: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [products, sellingOrders, buyingOrders, conversations, notifications] = await Promise.all([
        apiFetch<unknown>('/products/mine').catch(() => []),
        apiFetch<unknown>('/orders/selling').catch(() => []),
        apiFetch<unknown>('/orders/buying').catch(() => []),
        apiFetch<unknown>('/messages/conversations').catch(() => []),
        apiFetch<unknown>('/notifications?limit=80').catch(() => []),
      ]);

      const orderRows = [...extractRows(sellingOrders), ...extractRows(buyingOrders)];
      const pendingOrders = orderRows.filter((row) => {
        if (!row || typeof row !== 'object') return false;
        const status = String((row as Record<string, unknown>).status || '').toLowerCase();
        return !['delivered', 'completed', 'cancelled', 'failed'].includes(status);
      }).length;

      setSummary({
        products: extractRows(products).length,
        pendingOrders,
        unreadMessages: extractRows(conversations).length,
        notifications: extractRows(notifications).length,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load dashboard summary.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const items = [
    {
      label: role === 'company' ? 'Products' : 'Active Listings',
      value: summary.products,
      helper: role === 'company' ? 'Company catalogue' : 'Visible to buyers',
    },
    { label: 'Pending Orders', value: summary.pendingOrders, helper: 'Need follow-up' },
    { label: 'Messages', value: summary.unreadMessages, helper: 'Conversations' },
    { label: 'Notifications', value: summary.notifications, helper: 'Latest updates' },
  ];

  return (
    <View style={styles.summaryWrap}>
      <View style={styles.summaryHeader}>
        <Text style={styles.sectionTitle}>Summary</Text>
        <Pressable onPress={load} style={styles.refreshButton}>
          <Text style={styles.refreshButtonText}>{loading ? 'Loading' : 'Refresh'}</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.inlineError}>{error}</Text> : null}
      <View style={styles.summaryGrid}>
        {items.map((item) => (
          <View key={item.label} style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{loading ? '--' : item.value}</Text>
            <Text style={styles.summaryLabel}>{item.label}</Text>
            <Text style={styles.summaryHelper}>{item.helper}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ConnectedScreen({ route }: { route: MobileRoute }) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!route.endpoint) return;
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<unknown>(route.endpoint));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load data.');
    } finally {
      setLoading(false);
    }
  }, [route.endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <StateMessage title="Loading" detail={`Loading ${route.title.toLowerCase()}...`} />;
  }

  if (error) {
    return (
      <View style={styles.screen}>
        <StateMessage title="Could not load" detail={error} />
        <Pressable onPress={load} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const rows = normalizeRows(data);

  return (
    <View style={styles.screen}>
      <Text style={styles.sectionTitle}>Live data</Text>
      {rows.length === 0 ? (
        <StateMessage title="Nothing here yet" detail="When data is available on the web platform, it will appear here too." />
      ) : (
        rows.slice(0, 30).map((item, index) => (
          <DataRow key={`${route.key}-${index}`} item={item} />
        ))
      )}
    </View>
  );
}

function ComingSoonScreen({ route }: { route: MobileRoute }) {
  return (
    <StateMessage
      title={route.title}
      detail="This web feature is listed in mobile navigation. The next step is adding its full mobile form and action flow."
    />
  );
}

function ProfileScreen({ profile, role }: { profile: Profile | null; role: AppRole | null }) {
  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <View style={styles.screen}>
      <View style={styles.profilePanel}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(profile?.full_name || 'A').slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.profileText}>
          <Text style={styles.profileName}>{profile?.full_name || 'AgriLink User'}</Text>
          <Text style={styles.mutedText}>{formatRole(role)}</Text>
        </View>
      </View>
      <DataRow item={{ title: 'County', detail: profile?.county || 'Not set' }} />
      <DataRow item={{ title: 'Phone', detail: profile?.phone || 'Not set' }} />
      <DataRow item={{ title: 'Plan expires', detail: profile?.plan_expires_at || 'Not set' }} />
      <Pressable onPress={signOut} style={styles.dangerButton}>
        <Text style={styles.dangerButtonText}>Sign out</Text>
      </Pressable>
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

function DataRow({ item }: { item: { title: string; detail: string; meta?: string } }) {
  return (
    <View style={styles.dataRow}>
      <View style={styles.rowMarker} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        <Text style={styles.rowDetail}>{item.detail}</Text>
        {item.meta ? <Text style={styles.rowMeta}>{item.meta}</Text> : null}
      </View>
    </View>
  );
}

function normalizeRows(data: unknown): Array<{ title: string; detail: string; meta?: string }> {
  const rows = extractRows(data);

  return rows.map((row) => {
    if (!row || typeof row !== 'object') {
      return { title: String(row), detail: '' };
    }

    const record = row as Record<string, unknown>;
    const title =
      firstText(record, ['title', 'name', 'full_name', 'company_name', 'product_name', 'crop_name', 'status']) ||
      firstText(record, ['id']) ||
      'Record';
    const detail =
      firstText(record, ['description', 'message', 'email', 'county', 'category', 'role', 'payment_status']) ||
      summarizeRecord(record);
    const meta = firstText(record, ['created_at', 'updated_at', 'amount', 'price', 'total_amount']);

    return { title, detail, meta };
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
  const keys = ['products', 'orders', 'requests', 'partners', 'companies', 'notifications', 'conversations', 'applications', 'profile'];
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

function summarizeRecord(record: Record<string, unknown>) {
  return Object.entries(record)
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' - ');
}

function formatRole(role: AppRole | null) {
  if (role === 'farmer_pro') return 'Farmer Pro';
  if (role === 'farmer_free') return 'Free';
  if (role === 'company') return 'Company';
  if (role === 'admin') return 'Admin';
  return 'Free';
}

function shortLabel(title: string) {
  if (title === 'Marketplace') return 'Market';
  if (title === 'Micro-Loans') return 'Loans';
  if (title === 'Profile & Settings') return 'Profile';
  return title;
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: '#f6f7f2',
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    color: '#2f6b3f',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 12,
  },
  authSafeArea: {
    backgroundColor: '#183623',
    flex: 1,
  },
  authScreen: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 22,
  },
  authTop: {
    gap: 22,
    paddingTop: 20,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  logoMark: {
    alignItems: 'center',
    backgroundColor: '#d9f0c8',
    borderRadius: 8,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  logoText: {
    color: '#24552f',
    fontSize: 26,
    fontWeight: '900',
  },
  authBrand: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  authKicker: {
    color: '#bcd5bd',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  authTitle: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
  },
  authSubtitle: {
    color: '#d9e7d8',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 8,
    maxWidth: 300,
  },
  authPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    gap: 12,
    padding: 18,
  },
  segmented: {
    backgroundColor: '#eef2ea',
    borderRadius: 8,
    flexDirection: 'row',
    padding: 4,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    height: 42,
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: '#ffffff',
  },
  segmentText: {
    color: '#687365',
    fontSize: 14,
    fontWeight: '900',
  },
  segmentTextActive: {
    color: '#2f6b3f',
  },
  input: {
    backgroundColor: '#f6f7f2',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#162016',
    fontSize: 16,
    height: 52,
    paddingHorizontal: 14,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2f6b3f',
    borderRadius: 8,
    height: 52,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  authFootnote: {
    color: '#687365',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  safeArea: {
    backgroundColor: '#f6f7f2',
    flex: 1,
  },
  app: {
    backgroundColor: '#f6f7f2',
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  brand: {
    color: '#2f6b3f',
    fontSize: 13,
    fontWeight: '900',
  },
  headerTitle: {
    color: '#162016',
    fontSize: 29,
    fontWeight: '900',
  },
  rolePill: {
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  roleText: {
    color: '#2f6b3f',
    fontSize: 12,
    fontWeight: '900',
  },
  content: {
    paddingBottom: 104,
    paddingHorizontal: 20,
  },
  screen: {
    gap: 14,
  },
  heroPanel: {
    backgroundColor: '#203d2b',
    borderRadius: 8,
    padding: 18,
  },
  panelLabel: {
    color: '#cfe4d0',
    fontSize: 13,
    fontWeight: '900',
  },
  bigName: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 8,
  },
  panelNote: {
    color: '#e8f1e7',
    fontSize: 14,
    marginTop: 7,
  },
  sectionTitle: {
    color: '#162016',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 10,
    marginTop: 4,
  },
  summaryWrap: {
    gap: 10,
  },
  summaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  refreshButton: {
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshButtonText: {
    color: '#2f6b3f',
    fontSize: 12,
    fontWeight: '900',
  },
  inlineError: {
    color: '#a13b2f',
    fontSize: 13,
    lineHeight: 18,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 106,
    padding: 14,
    width: '48%',
  },
  summaryValue: {
    color: '#203d2b',
    fontSize: 28,
    fontWeight: '900',
  },
  summaryLabel: {
    color: '#162016',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 5,
  },
  summaryHelper: {
    color: '#687365',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
  },
  quickButton: {
    alignItems: 'center',
    backgroundColor: '#2f6b3f',
    borderRadius: 8,
    flex: 1,
    height: 52,
    justifyContent: 'center',
  },
  quickButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  quickButtonLight: {
    alignItems: 'center',
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    flex: 1,
    height: 52,
    justifyContent: 'center',
  },
  quickButtonLightText: {
    color: '#2f6b3f',
    fontSize: 14,
    fontWeight: '900',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    minHeight: 142,
    padding: 12,
    width: '48%',
  },
  gridIcon: {
    alignItems: 'center',
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  gridInitial: {
    color: '#2f6b3f',
    fontSize: 18,
    fontWeight: '900',
  },
  gridText: {
    color: '#162016',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  gridDescription: {
    color: '#687365',
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
  statePanel: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
  },
  stateTitle: {
    color: '#162016',
    fontSize: 18,
    fontWeight: '900',
  },
  stateDetail: {
    color: '#687365',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  dataRow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 74,
    paddingHorizontal: 14,
  },
  rowMarker: {
    backgroundColor: '#79ae5f',
    borderRadius: 6,
    height: 12,
    marginRight: 12,
    width: 12,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    color: '#162016',
    fontSize: 15,
    fontWeight: '900',
  },
  rowDetail: {
    color: '#687365',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  rowMeta: {
    color: '#2f6b3f',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  profilePanel: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 16,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  avatarText: {
    color: '#2f6b3f',
    fontSize: 24,
    fontWeight: '900',
  },
  profileText: {
    flex: 1,
  },
  profileName: {
    color: '#162016',
    fontSize: 18,
    fontWeight: '900',
  },
  mutedText: {
    color: '#687365',
    fontSize: 14,
    marginTop: 3,
  },
  dangerButton: {
    alignItems: 'center',
    backgroundColor: '#fff1ef',
    borderRadius: 8,
    height: 52,
    justifyContent: 'center',
  },
  dangerButtonText: {
    color: '#a13b2f',
    fontSize: 15,
    fontWeight: '900',
  },
  tabBar: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe5d8',
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    gap: 5,
    left: 0,
    paddingBottom: 12,
    paddingHorizontal: 10,
    paddingTop: 8,
    position: 'absolute',
    right: 0,
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    height: 58,
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#edf6e8',
  },
  tabInitial: {
    color: '#687365',
    fontSize: 17,
    fontWeight: '900',
  },
  tabText: {
    color: '#687365',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 2,
  },
  tabActiveText: {
    color: '#2f6b3f',
  },
});
