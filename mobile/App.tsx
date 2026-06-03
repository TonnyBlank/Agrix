import type { Session } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';

import {
  type AppRole,
  type MobileRoute,
  type MobileRouteKey,
  getVisibleRoutes,
  isAdminRole,
} from './src/config/navigation';
import { apiFetch } from './src/lib/api';
import { supabase } from './src/lib/supabase';
import { ActivityScreen } from './src/screens/Activity';
import { CartScreen } from './src/screens/Cart';
import { CalendarScreen } from './src/screens/Calendar';
import { DashboardScreen } from './src/screens/Dashboard';
import { DiscoverScreen } from './src/screens/Discover';
import { FarmScreen } from './src/screens/Farm';
import { MarketplaceScreen } from './src/screens/Marketplace';
import { MessagesScreen } from './src/screens/Messages';
import { NotificationsScreen } from './src/screens/Notifications';
import { OrdersScreen } from './src/screens/Orders';
import { ProductsScreen } from './src/screens/Products';
import { ScannerScreen } from './src/screens/Scanner';

type RecordRow = Record<string, unknown>;

type Profile = {
  full_name?: string | null;
  county?: string | null;
  phone?: string | null;
  photo_url?: string | null;
  plan_expires_at?: string | null;
  farm_size?: string | null;
  main_crops?: string[] | null;
  bio?: string | null;
  farm_type?: string | null;
  irrigation_type?: string | null;
  soil_type?: string | null;
  years_farming?: number | null;
  has_storage?: boolean | null;
  has_transport?: boolean | null;
  cooperative_name?: string | null;
  payout_method?: string | null;
  payout_mpesa_number?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  farm_gps_lat?: number | string | null;
  farm_gps_lng?: number | string | null;
};

type ProfileResponse = {
  profile: Profile;
  role: AppRole | null;
};

type AppearanceMode = 'System' | 'Light' | 'Dark';

type NotificationPrefs = {
  orderAlerts: boolean;
  loanAlerts: boolean;
  messageAlerts: boolean;
};

const ThemeContext = createContext(false);

function useIsDark() {
  return useContext(ThemeContext);
}

const farmerBottomKeys: MobileRouteKey[] = ['dashboard', 'marketplace', 'cart', 'orders', 'profile'];
const companyBottomKeys: MobileRouteKey[] = ['dashboard', 'marketplace', 'cart', 'companyOrders', 'profile'];
const adminBottomKeys: MobileRouteKey[] = ['dashboard', 'adminOverview', 'adminLoanDecisions', 'adminUsers', 'profile'];

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
  scanner: 'Upload a crop photo and get field diagnosis guidance.',
  calendar: 'Crop events, reminders, and planting windows.',
  dealMatches: 'Buyer opportunities matched to your listings.',
  community: 'Farmer and buyer network activity.',
  microLoans: 'Loan applications, status, and repayments.',
  upgrade: 'Unlock Pro tools, scanner, and finance workflows.',
  idVerification: 'Upload and review national ID verification.',
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
  profile: 'Personal profile, settings, plan, and sign out.',
};

const productTypeOptions = [
  ['input_financing', 'Inputs'],
  ['working_capital', 'Capital'],
  ['equipment_financing', 'Equipment'],
];

const cropOptions = ['Maize', 'Beans', 'Tomatoes', 'Potatoes', 'Onions', 'Cabbage', 'Spinach', 'Kale', 'Avocado', 'Bananas', 'Coffee', 'Tea', 'Rice', 'Wheat'];
const farmSizeOptions = ['Under 1 Acre', '1-3 Acres', '4-10 Acres', '11-25 Acres', '26-50 Acres', '50+ Acres'];
const farmTypeOptions = [
  ['subsistence', 'Subsistence'],
  ['commercial', 'Commercial'],
  ['mixed', 'Mixed'],
  ['livestock', 'Livestock'],
  ['horticulture', 'Horticulture'],
  ['agroforestry', 'Agroforestry'],
];
const irrigationOptions = [
  ['rainfed', 'Rainfed'],
  ['drip', 'Drip'],
  ['sprinkler', 'Sprinkler'],
  ['canal', 'Canal'],
  ['none', 'None'],
];
const payoutOptions = [
  ['mpesa', 'M-Pesa'],
  ['bank', 'Bank'],
];
const productCategoryOptions = ['Vegetables', 'Fruits', 'Grains', 'Dairy', 'Herbs', 'Poultry'];
const unitOptions = ['kg', 'crate', 'bag', 'bunch', 'tray', 'litre', 'piece'];
const countyOptions = [
  'Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo-Marakwet', 'Embu', 'Garissa', 'Homa Bay',
  'Isiolo', 'Kajiado', 'Kakamega', 'Kericho', 'Kiambu', 'Kilifi', 'Kirinyaga', 'Kisii',
  'Kisumu', 'Kitui', 'Kwale', 'Laikipia', 'Lamu', 'Machakos', 'Makueni', 'Mandera',
  'Marsabit', 'Meru', 'Migori', 'Mombasa', "Murang'a", 'Nairobi', 'Nakuru', 'Nandi',
  'Narok', 'Nyamira', 'Nyandarua', 'Nyeri', 'Samburu', 'Siaya', 'Taita-Taveta',
  'Tana River', 'Tharaka-Nithi', 'Trans-Nzoia', 'Turkana', 'Uasin Gishu', 'Vihiga',
  'Wajir', 'West Pokot',
];
const cropEventTypeOptions = [
  ['planting', 'Planting'],
  ['fertilizing', 'Fertilizing'],
  ['spraying', 'Spraying'],
  ['harvesting', 'Harvesting'],
  ['irrigation', 'Irrigation'],
  ['pruning', 'Pruning'],
];
const disbursementOptions = [
  ['mpesa', 'M-Pesa'],
  ['voucher', 'Input voucher'],
];
const repaymentOptions = [
  ['mpesa', 'M-Pesa'],
  ['pay_with_produce', 'Pay with produce'],
];
const defaultNotificationPrefs: NotificationPrefs = {
  orderAlerts: true,
  loanAlerts: true,
  messageAlerts: true,
};
const appSettingsStorageKey = 'agrilink-x-mobile-settings';
const collateralTypeOptions = [
  ['title_deed', 'Title deed'],
  ['logbook', 'Vehicle logbook'],
  ['business_assets', 'Business assets'],
  ['livestock', 'Livestock'],
  ['inventory', 'Stock or inventory'],
  ['cash_cover', 'Cash cover'],
  ['shares', 'Shares or deposits'],
  ['other', 'Other'],
];

export default function App() {
  const systemScheme = useColorScheme();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [activeKey, setActiveKey] = useState<MobileRouteKey>('dashboard');
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [appearance, setAppearance] = useState<AppearanceMode>('System');
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(defaultNotificationPrefs);
  const isDark = appearance === 'Dark' || (appearance === 'System' && systemScheme === 'dark');

  const loadProfile = useCallback(async () => {
    const data = await apiFetch<ProfileResponse>('/profiles/me');
    setProfile(data.profile);
    setRole(data.role ?? 'farmer_free');
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(appSettingsStorageKey)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as { appearance?: AppearanceMode; notificationPrefs?: Partial<NotificationPrefs> };
        if (saved.appearance === 'System' || saved.appearance === 'Light' || saved.appearance === 'Dark') {
          setAppearance(saved.appearance);
        }
        if (saved.notificationPrefs) {
          setNotificationPrefs((current) => ({ ...current, ...saved.notificationPrefs }));
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(appSettingsStorageKey, JSON.stringify({ appearance, notificationPrefs })).catch(() => undefined);
  }, [appearance, notificationPrefs]);

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
          setRole('farmer_free');
        }
      }
      setLoadingAuth(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        try {
          await loadProfile();
        } catch (error) {
          console.warn(error);
          setProfile(null);
          setRole('farmer_free');
        }
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
      appearance={appearance}
      isDark={isDark}
      notificationPrefs={notificationPrefs}
      profile={profile}
      role={role}
      setAppearance={setAppearance}
      setActiveKey={setActiveKey}
      setNotificationPrefs={setNotificationPrefs}
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
              ? 'Sign in to manage your farm, marketplace, orders, loans, and messages.'
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
              ? 'Use your AgriLink X email and password.'
              : 'Your account is ready for AgriLink X web and mobile.'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function MobileShell({
  activeKey,
  appearance,
  isDark,
  notificationPrefs,
  profile,
  role,
  setAppearance,
  setActiveKey,
  setNotificationPrefs,
  refreshProfile,
}: {
  activeKey: MobileRouteKey;
  appearance: AppearanceMode;
  isDark: boolean;
  notificationPrefs: NotificationPrefs;
  profile: Profile | null;
  role: AppRole | null;
  setAppearance: (mode: AppearanceMode) => void;
  setActiveKey: (key: MobileRouteKey) => void;
  setNotificationPrefs: (prefs: NotificationPrefs) => void;
  refreshProfile: () => Promise<void>;
}) {
  const routes = useMemo(() => getVisibleRoutes(role), [role]);
  const activeRoute = routes.find((route) => route.key === activeKey) ?? routes[0];
  const bottomRoutes = getBottomKeys(role)
    .map((key) => routes.find((route) => route.key === key))
    .filter(Boolean) as MobileRoute[];

  useEffect(() => {
    if (!routes.some((route) => route.key === activeKey)) {
      setActiveKey('dashboard');
    }
  }, [activeKey, routes, setActiveKey]);

  return (
    <ThemeContext.Provider value={isDark}>
      <SafeAreaView style={[styles.safeArea, isDark && styles.safeAreaDark]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={[styles.app, isDark && styles.appDark]}>
        <View style={[styles.header, isDark && styles.headerDark]}>
          <View>
            <Text style={styles.brand}>AgriLink X</Text>
            <Text style={[styles.headerTitle, isDark && styles.headerTitleDark]}>{activeRoute.title}</Text>
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
            <ProfileScreen
              appearance={appearance}
              notificationPrefs={notificationPrefs}
              profile={profile}
              role={role}
              setActiveKey={setActiveKey}
              setAppearance={setAppearance}
              setNotificationPrefs={setNotificationPrefs}
            />
          ) : activeRoute.key === 'farm' ? (
            <FarmScreen profile={profile} />
          ) : activeRoute.key === 'marketplace' ? (
            <MarketplaceScreen isDark={isDark} />
          ) : activeRoute.key === 'cart' ? (
            <CartScreen />
          ) : activeRoute.key === 'orders' ? (
            <OrdersScreen />
          ) : activeRoute.key === 'messages' ? (
            <MessagesScreen />
          ) : activeRoute.key === 'notifications' ? (
            <NotificationsScreen prefs={notificationPrefs} />
          ) : activeRoute.key === 'activity' ? (
            <ActivityScreen role={role} />
          ) : activeRoute.key === 'calendar' ? (
            <CalendarScreen />
          ) : activeRoute.key === 'microLoans' ? (
            <LoanScreen role={role} setActiveKey={setActiveKey} />
          ) : activeRoute.key === 'scanner' ? (
            <ScannerScreen role={role} setActiveKey={setActiveKey} />
          ) : activeRoute.key === 'discover' ? (
            <DiscoverScreen role={role} />
          ) : activeRoute.key === 'products' ? (
            <ProductsScreen profile={profile} />
          ) : activeRoute.key === 'companyProducts' ? (
            <CompanyProductsScreen />
          ) : activeRoute.key === 'companyProcurement' ? (
            <CompanyProcurementScreen />
          ) : activeRoute.key === 'companySettings' || activeRoute.key === 'companyHub' ? (
            <CompanyProfileScreen />
          ) : activeRoute.key === 'idVerification' ? (
            <IdVerificationScreen />
          ) : activeRoute.key === 'adminLoanDecisions' ? (
            <AdminLoansScreen />
          ) : activeRoute.key === 'adminTransactions' || activeRoute.key === 'adminDisputes' ? (
            <AdminOrdersScreen />
          ) : activeRoute.key === 'adminCompanies' ? (
            <AdminCompaniesScreen />
          ) : activeRoute.key === 'adminVerifications' ? (
            <AdminVerificationsScreen />
          ) : activeRoute.key === 'adminFeatureFlags' ? (
            <AdminFeatureFlagsScreen />
          ) : activeRoute.key === 'upgrade' ? (
            <UpgradeScreen profile={profile} />
          ) : activeRoute.endpoint ? (
            <ConnectedScreen route={activeRoute} />
          ) : (
            <ComingSoonScreen route={activeRoute} />
          )}
        </ScrollView>

        <View style={[styles.tabBar, isDark && styles.tabBarDark]}>
          {bottomRoutes.map((route) => {
            const active = route.key === activeRoute.key;
            return (
              <Pressable
                key={route.key}
                onPress={() => setActiveKey(route.key)}
                style={[styles.tabButton, active && styles.tabButtonActive]}
              >
                <Ionicons
                  name={tabIconName(route.key, active)}
                  size={23}
                  color={active ? '#14532d' : isDark ? '#9ead9a' : '#687466'}
                />
                <Text style={[styles.tabText, active && styles.tabActiveText]} numberOfLines={1}>
                  {shortLabel(route.title)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        </View>
      </SafeAreaView>
    </ThemeContext.Provider>
  );
}

function LoanScreen({
  role,
  setActiveKey,
}: {
  role: AppRole | null;
  setActiveKey: (key: MobileRouteKey) => void;
}) {
  const [applications, setApplications] = useState<RecordRow[]>([]);
  const [offers, setOffers] = useState<RecordRow[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<RecordRow | null>(null);
  const [amount, setAmount] = useState('');
  const [disbursementMethod, setDisbursementMethod] = useState('mpesa');
  const [repaymentMethod, setRepaymentMethod] = useState('mpesa');
  const [branchVisitAcknowledged, setBranchVisitAcknowledged] = useState(false);
  const [guarantor, setGuarantor] = useState({ name: '', phone: '', relationship: '' });
  const [collateral, setCollateral] = useState({
    asset_type: 'title_deed',
    description: '',
    owner_name: '',
    document_reference: '',
    estimated_value: '',
    location: '',
    notes: '',
  });
  const [repaymentLoan, setRepaymentLoan] = useState<RecordRow | null>(null);
  const [repaymentAmount, setRepaymentAmount] = useState('');
  const [repaymentPhone, setRepaymentPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [apps, availableOffers] = await Promise.all([
        apiFetch<unknown>('/micro-loans/applications'),
        apiFetch<unknown>('/micro-loans/offers').catch(() => []),
      ]);
      setApplications(extractRows(apps) as RecordRow[]);
      setOffers(extractRows(availableOffers) as RecordRow[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load loans.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = async () => {
    if (!selectedOffer) {
      Alert.alert('Choose an offer', 'Select a published loan offer first.');
      return;
    }
    if (!amount.trim()) {
      Alert.alert('Amount needed', 'Enter the amount you want to request.');
      return;
    }
    const securityType = firstText(selectedOffer, ['securityType', 'security_type']) || 'unsecured';
    const requiresBranch = Boolean(selectedOffer.requiresBranchVisit ?? selectedOffer.requires_branch_visit);
    if (requiresBranch && !branchVisitAcknowledged) {
      Alert.alert('Branch visit required', 'Confirm that you understand the branch document requirement.');
      return;
    }
    if (securityType === 'guarantor' && !guarantor.name.trim()) {
      Alert.alert('Guarantor needed', 'Add at least one guarantor for this offer.');
      return;
    }
    if (securityType === 'collateral' && !collateral.document_reference.trim() && !collateral.description.trim()) {
      Alert.alert('Collateral needed', 'Add collateral details such as title deed or logbook reference.');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/micro-loans/applications', {
        method: 'POST',
        body: {
          offerId: firstText(selectedOffer, ['key', 'id']),
          requestedAmount: Number(amount),
          disbursementMethod,
          repaymentMethod,
          guarantors: guarantor.name.trim() ? [guarantor] : [],
          collateralItems: securityType === 'collateral' ? [{
            ...collateral,
            estimated_value: collateral.estimated_value ? Number(collateral.estimated_value) : null,
          }] : [],
          branchVisitAcknowledged,
        },
      });
      setSelectedOffer(null);
      setAmount('');
      setGuarantor({ name: '', phone: '', relationship: '' });
      setCollateral({ asset_type: 'title_deed', description: '', owner_name: '', document_reference: '', estimated_value: '', location: '', notes: '' });
      setBranchVisitAcknowledged(false);
      await load();
      Alert.alert('Loan submitted', requiresBranch || securityType !== 'unsecured' ? 'Your secured loan request was sent for review.' : 'Your loan request was submitted.');
    } catch (requestError) {
      Alert.alert('Loan not submitted', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const openOffer = (offer: RecordRow) => {
    setSelectedOffer(offer);
    setAmount(String(getNumber(offer, ['available_amount', 'rawAmount', 'max_amount']) || ''));
    setDisbursementMethod('mpesa');
    setRepaymentMethod('mpesa');
    setBranchVisitAcknowledged(false);
  };

  const repayLoan = async () => {
    if (!repaymentLoan) return;
    const id = firstText(repaymentLoan, ['id']);
    if (!id || !repaymentAmount.trim()) {
      Alert.alert('Repayment amount needed', 'Enter the amount you want to repay.');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/micro-loans/applications/${id}/repay`, {
        method: 'POST',
        body: {
          amount: Number(repaymentAmount),
          phoneNumber: repaymentPhone.trim() || null,
          paymentMethod: firstText(repaymentLoan, ['repayment_method']) || 'mpesa',
        },
      });
      setRepaymentLoan(null);
      setRepaymentAmount('');
      setRepaymentPhone('');
      await load();
      Alert.alert('Repayment posted', 'Your loan repayment has been recorded.');
    } catch (requestError) {
      Alert.alert('Repayment failed', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const canApply = role === 'farmer_pro' || role === 'company' || isAdminRole(role);
  const highestOfferAmount = offers.reduce((max, offer) => Math.max(max, getNumber(offer, ['available_amount', 'rawAmount', 'max_amount'])), 0);

  return (
    <View style={styles.screen}>
      <View style={styles.heroPanel}>
        <Text style={styles.panelLabel}>FINANCE</Text>
        <Text style={styles.bigName}>Micro-Loans</Text>
        <Text style={styles.panelNote}>Apply, track status, and review available finance offers.</Text>
      </View>

      <LoanQualificationPanel canApply={canApply} highestOfferAmount={highestOfferAmount} offersCount={offers.length} loading={loading} />

      {!canApply ? (
        <View style={styles.actionCard}>
          <Text style={styles.cardTitle}>Upgrade needed before borrowing</Text>
          <Text style={styles.cardDetail}>
            Upgrade to Farmer Pro to apply for finance and use advanced farm tools.
          </Text>
          <Pressable onPress={() => setActiveKey('upgrade')} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Open upgrade</Text>
          </Pressable>
        </View>
      ) : selectedOffer ? (
        <View style={styles.actionCard}>
          <Pressable onPress={() => setSelectedOffer(null)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back to offers</Text>
          </Pressable>
          <Text style={styles.cardTitle}>{recordTitle(selectedOffer)}</Text>
          <Text style={styles.cardDetail}>{firstText(selectedOffer, ['detail', 'note']) || 'Review loan terms before applying.'}</Text>
          <View style={styles.metricLine}>
            <Text style={styles.metricChip}>{firstText(selectedOffer, ['securityType', 'security_type']) || 'unsecured'}</Text>
            <Text style={styles.metricChip}>{getNumber(selectedOffer, ['interestRate', 'interest_rate'])}% p.a.</Text>
            <Text style={styles.metricChip}>{getNumber(selectedOffer, ['repaymentDays', 'repayment_days'])} days</Text>
          </View>
          <TextInput
            keyboardType="numeric"
            placeholder="Amount in KES"
            placeholderTextColor="#7a8276"
            value={amount}
            onChangeText={setAmount}
            style={styles.input}
          />
          <Text style={styles.inputLabel}>Disbursement method</Text>
          <SegmentedOptions value={disbursementMethod} options={disbursementOptions} onChange={setDisbursementMethod} />
          <Text style={styles.inputLabel}>Repayment method</Text>
          <SegmentedOptions value={repaymentMethod} options={repaymentOptions} onChange={setRepaymentMethod} />
          {Boolean(selectedOffer.requiresBranchVisit ?? selectedOffer.requires_branch_visit) ? (
            <Pressable onPress={() => setBranchVisitAcknowledged((current) => !current)} style={[styles.checkRow, branchVisitAcknowledged && styles.checkRowActive]}>
              <Text style={[styles.choiceText, branchVisitAcknowledged && styles.choiceTextActive]}>
                I will visit {firstText(selectedOffer, ['branchName', 'branch_name']) || 'the branch'} with required documents.
              </Text>
            </Pressable>
          ) : null}
          {(firstText(selectedOffer, ['securityType', 'security_type']) === 'guarantor') ? (
            <View style={styles.subPanel}>
              <Text style={styles.cardTitle}>Guarantor</Text>
              <TextInput placeholder="Name" placeholderTextColor="#7a8276" value={guarantor.name} onChangeText={(value) => setGuarantor((current) => ({ ...current, name: value }))} style={styles.input} />
              <TextInput keyboardType="phone-pad" placeholder="Phone" placeholderTextColor="#7a8276" value={guarantor.phone} onChangeText={(value) => setGuarantor((current) => ({ ...current, phone: value }))} style={styles.input} />
              <TextInput placeholder="Relationship" placeholderTextColor="#7a8276" value={guarantor.relationship} onChangeText={(value) => setGuarantor((current) => ({ ...current, relationship: value }))} style={styles.input} />
            </View>
          ) : null}
          {(firstText(selectedOffer, ['securityType', 'security_type']) === 'collateral') ? (
            <View style={styles.subPanel}>
              <Text style={styles.cardTitle}>Collateral</Text>
              <SegmentedOptions value={collateral.asset_type} options={collateralTypeOptions} onChange={(value) => setCollateral((current) => ({ ...current, asset_type: value }))} />
              <TextInput placeholder="Description" placeholderTextColor="#7a8276" value={collateral.description} onChangeText={(value) => setCollateral((current) => ({ ...current, description: value }))} style={styles.input} />
              <TextInput placeholder="Owner name" placeholderTextColor="#7a8276" value={collateral.owner_name} onChangeText={(value) => setCollateral((current) => ({ ...current, owner_name: value }))} style={styles.input} />
              <TextInput placeholder="Document reference" placeholderTextColor="#7a8276" value={collateral.document_reference} onChangeText={(value) => setCollateral((current) => ({ ...current, document_reference: value }))} style={styles.input} />
              <TextInput keyboardType="numeric" placeholder="Estimated value" placeholderTextColor="#7a8276" value={collateral.estimated_value} onChangeText={(value) => setCollateral((current) => ({ ...current, estimated_value: value }))} style={styles.input} />
              <TextInput placeholder="Location" placeholderTextColor="#7a8276" value={collateral.location} onChangeText={(value) => setCollateral((current) => ({ ...current, location: value }))} style={styles.input} />
            </View>
          ) : null}
          <Pressable onPress={apply} disabled={submitting} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{submitting ? 'Submitting...' : 'Confirm and request loan'}</Text>
          </Pressable>
        </View>
      ) : null}

      {repaymentLoan ? (
        <View style={styles.actionCard}>
          <Pressable onPress={() => setRepaymentLoan(null)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Close repayment</Text>
          </Pressable>
          <Text style={styles.cardTitle}>Repay {recordTitle(repaymentLoan)}</Text>
          <TextInput keyboardType="numeric" placeholder="Amount to repay" placeholderTextColor="#7a8276" value={repaymentAmount} onChangeText={setRepaymentAmount} style={styles.input} />
          {firstText(repaymentLoan, ['repayment_method']) === 'pay_with_produce' ? null : (
            <TextInput keyboardType="phone-pad" placeholder="M-Pesa number" placeholderTextColor="#7a8276" value={repaymentPhone} onChangeText={setRepaymentPhone} style={styles.input} />
          )}
          <Pressable onPress={repayLoan} disabled={submitting} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{submitting ? 'Posting...' : 'Post repayment'}</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? <StateMessage title="Loading" detail="Loading loan history..." /> : null}
      {error ? <StateMessage title="Could not load loans" detail={error} /> : null}
      {canApply && !selectedOffer ? <Text style={styles.sectionTitle}>Available offers</Text> : null}
      {canApply && !selectedOffer && offers.length === 0 && !loading ? (
        <StateMessage title="No offers available" detail="Published loan offers for your county and plan will appear here." />
      ) : null}
      {canApply && !selectedOffer && offers.map((offer, index) => (
        <Pressable key={`offer-${index}`} onPress={() => openOffer(offer)} style={styles.actionCard}>
          <Text style={styles.cardTitle}>{recordTitle(offer)}</Text>
          <Text style={styles.cardDetail}>{firstText(offer, ['detail', 'note']) || 'Open to review requirements and apply.'}</Text>
          <View style={styles.metricLine}>
            <Text style={styles.metricChip}>{formatMoney(getNumber(offer, ['available_amount', 'rawAmount', 'max_amount']))}</Text>
            <Text style={styles.metricChip}>{firstText(offer, ['securityType', 'security_type']) || 'unsecured'}</Text>
            <Text style={styles.metricChip}>{getNumber(offer, ['repaymentDays', 'repayment_days'])} days</Text>
          </View>
        </Pressable>
      ))}
      <Text style={styles.sectionTitle}>Applications</Text>
      {applications.length === 0 ? (
        <StateMessage title="No applications yet" detail="Submitted loan requests will appear here." />
      ) : (
        applications.map((loan, index) => (
          <View key={`loan-${index}`} style={styles.actionCard}>
            <Text style={styles.cardTitle}>{recordTitle(loan)}</Text>
            <Text style={styles.cardDetail}>
              Requested {formatMoney(getNumber(loan, ['requested_amount']))} - {statusLabel(firstText(loan, ['status']) || 'pending')}
            </Text>
            <View style={styles.metricLine}>
              <Text style={styles.metricChip}>{firstText(loan, ['security_type']) || 'unsecured'}</Text>
              <Text style={styles.metricChip}>{firstText(loan, ['repayment_method']) || 'mpesa'}</Text>
              <Text style={styles.metricChip}>{getNumber(loan, ['repayment_days'])} days</Text>
            </View>
            {firstText(loan, ['status']) === 'disbursed' ? (
              <Pressable onPress={() => setRepaymentLoan(loan)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Repay loan</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

function LoanQualificationPanel({
  canApply,
  highestOfferAmount,
  offersCount,
  loading,
}: {
  canApply: boolean;
  highestOfferAmount: number;
  offersCount: number;
  loading: boolean;
}) {
  const title = canApply
    ? highestOfferAmount > 0
      ? `You can request up to ${formatMoney(highestOfferAmount)}`
      : 'Qualification pending'
    : 'Upgrade to qualify';
  const detail = canApply
    ? highestOfferAmount > 0
      ? `${offersCount} finance offer${offersCount === 1 ? '' : 's'} match your account.`
      : loading
        ? 'Checking available finance offers for your profile.'
        : 'Complete your profile, farm details, payout, and verification to improve eligibility.'
    : 'Farmer Pro unlocks loan offers, scanner, and finance workflows.';

  return (
    <View style={styles.financePanel}>
      <Text style={styles.panelLabel}>QUALIFICATION</Text>
      <Text style={styles.financeAmount}>{loading ? 'Checking...' : title}</Text>
      <Text style={styles.panelNote}>{detail}</Text>
    </View>
  );
}

function CompanyProductsScreen() {
  const [products, setProducts] = useState<RecordRow[]>([]);
  const [form, setForm] = useState({
    name: '',
    category: '',
    unit: 'kg',
    price_per_unit: '',
    stock: '',
    minimum_order_quantity: '1',
    image_url: '',
    description: '',
  });
  const [imageAsset, setImageAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<unknown>('/companies/me/products');
      setProducts(extractRows(data) as RecordRow[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load company products.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to choose a product image.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!picked.canceled && picked.assets[0]) {
      setImageAsset(picked.assets[0]);
      setForm((current) => ({ ...current, image_url: '' }));
    }
  };

  const save = async () => {
    if (!form.name.trim()) {
      Alert.alert('Product name needed', 'Enter the company product name.');
      return;
    }
    setSaving(true);
    try {
      let imageUrl = form.image_url.trim();
      if (imageAsset) {
        const formData = new FormData();
        formData.append('image', {
          uri: imageAsset.uri,
          name: imageAsset.fileName || 'company-product.jpg',
          type: imageAsset.mimeType || 'image/jpeg',
        } as unknown as Blob);
        const uploaded = await apiFetch<{ url?: string }>('/companies/me/products/upload-image', { method: 'POST', body: formData });
        imageUrl = uploaded.url || imageUrl;
      }
      await apiFetch('/companies/me/products', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          category: form.category.trim() || 'other',
          unit: form.unit.trim() || 'kg',
          price_per_unit: Number(form.price_per_unit || 0),
          stock: Number(form.stock || 0),
          minimum_order_quantity: Number(form.minimum_order_quantity || 1),
          description: form.description.trim(),
          image_url: imageUrl || undefined,
          is_available: true,
        },
      });
      setForm({
        name: '',
        category: '',
        unit: 'kg',
        price_per_unit: '',
        stock: '',
        minimum_order_quantity: '1',
        image_url: '',
        description: '',
      });
      setImageAsset(null);
      await load();
      Alert.alert('Product saved', 'Company product was saved to the shared platform.');
    } catch (requestError) {
      Alert.alert('Could not save product', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.actionCard}>
        <Text style={styles.cardTitle}>Add company product</Text>
        <TextInput
          placeholder="Product name"
          placeholderTextColor="#7a8276"
          value={form.name}
          onChangeText={(value) => setForm((current) => ({ ...current, name: value }))}
          style={styles.input}
        />
        <TextInput
          placeholder="Category"
          placeholderTextColor="#7a8276"
          value={form.category}
          onChangeText={(value) => setForm((current) => ({ ...current, category: value }))}
          style={styles.input}
        />
        <View style={styles.formRow}>
          <TextInput
            placeholder="Unit"
            placeholderTextColor="#7a8276"
            value={form.unit}
            onChangeText={(value) => setForm((current) => ({ ...current, unit: value }))}
            style={[styles.input, styles.formHalf]}
          />
          <TextInput
            keyboardType="numeric"
            placeholder="Price"
            placeholderTextColor="#7a8276"
            value={form.price_per_unit}
            onChangeText={(value) => setForm((current) => ({ ...current, price_per_unit: value }))}
            style={[styles.input, styles.formHalf]}
          />
        </View>
        <View style={styles.formRow}>
          <TextInput
            keyboardType="numeric"
            placeholder="Stock"
            placeholderTextColor="#7a8276"
            value={form.stock}
            onChangeText={(value) => setForm((current) => ({ ...current, stock: value }))}
            style={[styles.input, styles.formHalf]}
          />
          <TextInput
            keyboardType="numeric"
            placeholder="Min order"
            placeholderTextColor="#7a8276"
            value={form.minimum_order_quantity}
            onChangeText={(value) => setForm((current) => ({ ...current, minimum_order_quantity: value }))}
            style={[styles.input, styles.formHalf]}
          />
        </View>
        <TextInput
          placeholder="Description"
          placeholderTextColor="#7a8276"
          value={form.description}
          onChangeText={(value) => setForm((current) => ({ ...current, description: value }))}
          style={[styles.input, styles.textArea]}
          multiline
        />
        <TextInput placeholder="Image URL" placeholderTextColor="#7a8276" value={form.image_url} onChangeText={(value) => { setImageAsset(null); setForm((current) => ({ ...current, image_url: value })); }} style={styles.input} />
        <Pressable onPress={pickImage} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{imageAsset ? 'Image selected' : 'Choose product image'}</Text>
        </Pressable>
        {imageAsset?.uri || form.image_url ? (
          <Image source={{ uri: imageAsset?.uri || form.image_url }} style={styles.mediaPreview} />
        ) : null}
        <Pressable onPress={save} disabled={saving} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save product'}</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Company products</Text>
      {loading ? <StateMessage title="Loading" detail="Loading company products..." /> : null}
      {error ? <StateMessage title="Could not load products" detail={error} /> : null}
      {!loading && products.length === 0 ? (
        <StateMessage title="No company products yet" detail="Add products your company sells or supplies." />
      ) : (
        products.map((product, index) => (
          <View key={`company-product-${index}`} style={styles.actionCard}>
            {firstText(product, ['image_url']) ? <Image source={{ uri: firstText(product, ['image_url']) }} style={styles.mediaPreview} /> : null}
            <Text style={styles.cardTitle}>{recordTitle(product)}</Text>
            <Text style={styles.cardDetail}>{firstText(product, ['description']) || firstText(product, ['category']) || 'Company product'}</Text>
            <View style={styles.metricLine}>
              <Text style={styles.metricChip}>{formatMoney(getNumber(product, ['price_per_unit']))}/{firstText(product, ['unit']) || 'unit'}</Text>
              <Text style={styles.metricChip}>Stock {firstText(product, ['stock']) || '0'}</Text>
              <Text style={styles.metricChip}>Min {firstText(product, ['minimum_order_quantity']) || '1'}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function CompanyProfileScreen() {
  const [company, setCompany] = useState<RecordRow | null>(null);
  const [stats, setStats] = useState<RecordRow | null>(null);
  const [form, setForm] = useState({
    company_name: '',
    company_type: 'buyer',
    email: '',
    phone: '',
    website: '',
    headquarters_location: '',
    service_areas: '',
    certifications: '',
    bio: '',
    payout_method: 'mpesa',
    payout_mpesa_number: '',
    bank_name: '',
    bank_account_name: '',
    bank_account_number: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<RecordRow>('/companies/me');
      const nextCompany = nestedRecord(response, 'company') || response;
      setCompany(nextCompany);
      setStats(nestedRecord(response, 'stats'));
      setForm({
        company_name: firstText(nextCompany, ['company_name']),
        company_type: firstText(nextCompany, ['company_type']) || 'buyer',
        email: firstText(nextCompany, ['email']),
        phone: firstText(nextCompany, ['phone']),
        website: firstText(nextCompany, ['website']),
        headquarters_location: firstText(nextCompany, ['headquarters_location']),
        service_areas: arrayText(nextCompany.service_areas),
        certifications: arrayText(nextCompany.certifications),
        bio: firstText(nextCompany, ['bio']),
        payout_method: firstText(nextCompany, ['payout_method']) || 'mpesa',
        payout_mpesa_number: firstText(nextCompany, ['payout_mpesa_number']),
        bank_name: firstText(nextCompany, ['bank_name']),
        bank_account_name: firstText(nextCompany, ['bank_account_name']),
        bank_account_number: firstText(nextCompany, ['bank_account_number']),
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load company profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!form.company_name.trim()) {
      Alert.alert('Company name needed', 'Enter the company name.');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/companies/me', {
        method: 'PATCH',
        body: {
          ...form,
          service_areas: splitList(form.service_areas),
          certifications: splitList(form.certifications),
        },
      });
      await load();
      Alert.alert('Company saved', 'Company profile and payout settings were updated.');
    } catch (requestError) {
      Alert.alert('Could not save company', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <StateMessage title="Loading" detail="Loading company profile..." />;

  return (
    <View style={styles.screen}>
      {error ? <StateMessage title="Could not load company" detail={error} /> : null}
      <View style={styles.heroPanel}>
        <Text style={styles.panelLabel}>COMPANY</Text>
        <Text style={styles.bigName}>{company ? recordTitle(company) : 'Company profile'}</Text>
        <Text style={styles.panelNote}>
          Verification: {company ? statusLabel(firstText(company, ['verification_status']) || 'pending') : 'Not ready'}
        </Text>
      </View>
      {stats ? (
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{firstText(stats, ['products_count']) || '0'}</Text>
            <Text style={styles.summaryLabel}>Products</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{firstText(stats, ['orders_count']) || '0'}</Text>
            <Text style={styles.summaryLabel}>Orders</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{firstText(stats, ['farmer_partners']) || '0'}</Text>
            <Text style={styles.summaryLabel}>Partners</Text>
          </View>
        </View>
      ) : null}
      <View style={styles.actionCard}>
        <Text style={styles.cardTitle}>Company settings</Text>
        <TextInput placeholder="Company name" placeholderTextColor="#7a8276" value={form.company_name} onChangeText={(value) => setForm((current) => ({ ...current, company_name: value }))} style={styles.input} />
        <SegmentedOptions value={form.company_type} options={['buyer', 'processor', 'input_supplier', 'logistics', 'other']} onChange={(value) => setForm((current) => ({ ...current, company_type: value }))} />
        <TextInput placeholder="Email" placeholderTextColor="#7a8276" value={form.email} onChangeText={(value) => setForm((current) => ({ ...current, email: value }))} style={styles.input} />
        <TextInput keyboardType="phone-pad" placeholder="Phone" placeholderTextColor="#7a8276" value={form.phone} onChangeText={(value) => setForm((current) => ({ ...current, phone: value }))} style={styles.input} />
        <TextInput placeholder="Website" placeholderTextColor="#7a8276" value={form.website} onChangeText={(value) => setForm((current) => ({ ...current, website: value }))} style={styles.input} />
        <CountyPicker
          label="Headquarters county"
          value={form.headquarters_location}
          onChange={(value) => setForm((current) => ({ ...current, headquarters_location: value }))}
        />
        <TextInput placeholder="Service areas, separated by commas" placeholderTextColor="#7a8276" value={form.service_areas} onChangeText={(value) => setForm((current) => ({ ...current, service_areas: value }))} style={styles.input} />
        <TextInput placeholder="Certifications, separated by commas" placeholderTextColor="#7a8276" value={form.certifications} onChangeText={(value) => setForm((current) => ({ ...current, certifications: value }))} style={styles.input} />
        <TextInput placeholder="Company bio" placeholderTextColor="#7a8276" value={form.bio} onChangeText={(value) => setForm((current) => ({ ...current, bio: value }))} style={[styles.input, styles.textArea]} multiline />
        <Text style={styles.inputLabel}>Payout method</Text>
        <SegmentedOptions value={form.payout_method} options={payoutOptions} onChange={(value) => setForm((current) => ({ ...current, payout_method: value }))} />
        {form.payout_method === 'mpesa' ? (
          <TextInput keyboardType="phone-pad" placeholder="Payout M-Pesa number" placeholderTextColor="#7a8276" value={form.payout_mpesa_number} onChangeText={(value) => setForm((current) => ({ ...current, payout_mpesa_number: value }))} style={styles.input} />
        ) : null}
        {form.payout_method === 'bank' ? (
          <>
            <TextInput placeholder="Bank name" placeholderTextColor="#7a8276" value={form.bank_name} onChangeText={(value) => setForm((current) => ({ ...current, bank_name: value }))} style={styles.input} />
            <TextInput placeholder="Account name" placeholderTextColor="#7a8276" value={form.bank_account_name} onChangeText={(value) => setForm((current) => ({ ...current, bank_account_name: value }))} style={styles.input} />
            <TextInput keyboardType="numeric" placeholder="Account number" placeholderTextColor="#7a8276" value={form.bank_account_number} onChangeText={(value) => setForm((current) => ({ ...current, bank_account_number: value }))} style={styles.input} />
          </>
        ) : null}
        <Pressable onPress={save} disabled={saving} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save company profile'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CompanyProcurementScreen() {
  const [requests, setRequests] = useState<RecordRow[]>([]);
  const [responses, setResponses] = useState<RecordRow[]>([]);
  const [selected, setSelected] = useState<RecordRow | null>(null);
  const [form, setForm] = useState({
    title: '',
    category: '',
    target_county: '',
    quantity_needed: '',
    unit: 'kg',
    budget_min: '',
    budget_max: '',
    needed_by: '',
    notes: '',
  });
  const [decisionNote, setDecisionNote] = useState('');
  const [acceptedQuantity, setAcceptedQuantity] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(extractRows(await apiFetch<unknown>('/companies/me/procurement')) as RecordRow[]);
    } catch (requestError) {
      Alert.alert('Could not load procurement', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveRequest = async () => {
    if (!form.title.trim()) {
      Alert.alert('Title needed', 'Enter what your company wants to buy.');
      return;
    }
    setBusyId('new');
    try {
      await apiFetch('/companies/me/procurement', {
        method: 'POST',
        body: {
          ...form,
          quantity_needed: Number(form.quantity_needed || 0),
          budget_min: form.budget_min ? Number(form.budget_min) : null,
          budget_max: form.budget_max ? Number(form.budget_max) : null,
          status: 'open',
        },
      });
      setForm({ title: '', category: '', target_county: '', quantity_needed: '', unit: 'kg', budget_min: '', budget_max: '', needed_by: '', notes: '' });
      await load();
      Alert.alert('Request posted', 'Farmers can now respond to this procurement request.');
    } catch (requestError) {
      Alert.alert('Request not posted', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const openResponses = async (requestRow: RecordRow) => {
    const id = firstText(requestRow, ['id']);
    if (!id) return;
    setSelected(requestRow);
    setBusyId(id);
    try {
      const response = await apiFetch<unknown>(`/companies/me/procurement/${id}/responses`);
      setResponses(extractRows(response) as RecordRow[]);
    } catch (requestError) {
      Alert.alert('Could not load responses', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const decideResponse = async (responseRow: RecordRow, decision: 'accept' | 'reject') => {
    const requestId = selected ? firstText(selected, ['id']) : '';
    const responseId = firstText(responseRow, ['id']);
    if (!requestId || !responseId) return;
    setBusyId(responseId);
    try {
      await apiFetch(`/companies/me/procurement/${requestId}/responses/${responseId}/decision`, {
        method: 'PATCH',
        body: {
          decision,
          company_note: decisionNote.trim() || null,
          accepted_quantity: acceptedQuantity ? Number(acceptedQuantity) : null,
        },
      });
      await openResponses(selected as RecordRow);
      await load();
      Alert.alert('Decision saved', decision === 'accept' ? 'Response accepted and converted to an order.' : 'Response rejected.');
    } catch (requestError) {
      Alert.alert('Decision failed', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.actionCard}>
        <Text style={styles.cardTitle}>Post procurement request</Text>
        <TextInput placeholder="Request title" placeholderTextColor="#7a8276" value={form.title} onChangeText={(value) => setForm((current) => ({ ...current, title: value }))} style={styles.input} />
        <TextInput placeholder="Category" placeholderTextColor="#7a8276" value={form.category} onChangeText={(value) => setForm((current) => ({ ...current, category: value }))} style={styles.input} />
        <CountyPicker
          label="Target county"
          value={form.target_county}
          onChange={(value) => setForm((current) => ({ ...current, target_county: value }))}
        />
        <View style={styles.formRow}>
          <TextInput keyboardType="numeric" placeholder="Quantity" placeholderTextColor="#7a8276" value={form.quantity_needed} onChangeText={(value) => setForm((current) => ({ ...current, quantity_needed: value }))} style={[styles.input, styles.formHalf]} />
          <TextInput placeholder="Unit" placeholderTextColor="#7a8276" value={form.unit} onChangeText={(value) => setForm((current) => ({ ...current, unit: value }))} style={[styles.input, styles.formHalf]} />
        </View>
        <View style={styles.formRow}>
          <TextInput keyboardType="numeric" placeholder="Budget min" placeholderTextColor="#7a8276" value={form.budget_min} onChangeText={(value) => setForm((current) => ({ ...current, budget_min: value }))} style={[styles.input, styles.formHalf]} />
          <TextInput keyboardType="numeric" placeholder="Budget max" placeholderTextColor="#7a8276" value={form.budget_max} onChangeText={(value) => setForm((current) => ({ ...current, budget_max: value }))} style={[styles.input, styles.formHalf]} />
        </View>
        <TextInput placeholder="Needed by YYYY-MM-DD" placeholderTextColor="#7a8276" value={form.needed_by} onChangeText={(value) => setForm((current) => ({ ...current, needed_by: value }))} style={styles.input} />
        <TextInput placeholder="Notes" placeholderTextColor="#7a8276" value={form.notes} onChangeText={(value) => setForm((current) => ({ ...current, notes: value }))} style={[styles.input, styles.textArea]} multiline />
        <Pressable onPress={saveRequest} disabled={busyId === 'new'} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{busyId === 'new' ? 'Posting...' : 'Post request'}</Text>
        </Pressable>
      </View>

      {selected ? (
        <View style={styles.actionCard}>
          <Pressable onPress={() => setSelected(null)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back to requests</Text>
          </Pressable>
          <Text style={styles.cardTitle}>{recordTitle(selected)}</Text>
          <TextInput placeholder="Decision note" placeholderTextColor="#7a8276" value={decisionNote} onChangeText={setDecisionNote} style={styles.input} />
          <TextInput keyboardType="numeric" placeholder="Accepted quantity" placeholderTextColor="#7a8276" value={acceptedQuantity} onChangeText={setAcceptedQuantity} style={styles.input} />
          {responses.length === 0 ? <StateMessage title="No farmer responses" detail="Farmer responses will appear here." /> : null}
          {responses.map((response, index) => {
            const id = firstText(response, ['id']) || `${index}`;
            const farmer = nestedRecord(response, 'farmer_profile');
            return (
              <View key={id} style={styles.subPanel}>
                <Text style={styles.cardTitle}>{farmer ? recordTitle(farmer) : recordTitle(response)}</Text>
                <Text style={styles.cardDetail}>
                  {firstText(response, ['quantity_offered']) || '-'} {firstText(response, ['unit']) || 'kg'} at {formatMoney(getNumber(response, ['price_per_unit']))}
                </Text>
                <View style={styles.metricLine}>
                  <Text style={styles.metricChip}>{statusLabel(firstText(response, ['status']) || 'submitted')}</Text>
                  <Text style={styles.metricChip}>{firstText(response, ['market_signal']) || 'market_rate'}</Text>
                </View>
                <View style={styles.buttonRow}>
                  <Pressable onPress={() => decideResponse(response, 'accept')} disabled={busyId === id} style={styles.secondaryButtonCompact}>
                    <Text style={styles.secondaryButtonText}>Accept</Text>
                  </Pressable>
                  <Pressable onPress={() => decideResponse(response, 'reject')} disabled={busyId === id} style={styles.dangerButtonSmall}>
                    <Text style={styles.dangerButtonText}>Reject</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Requests</Text>
      {loading ? <StateMessage title="Loading" detail="Loading procurement requests..." /> : null}
      {!loading && requests.length === 0 ? <StateMessage title="No requests yet" detail="Create a procurement request above." /> : null}
      {requests.map((requestRow, index) => (
        <Pressable key={`procurement-${index}`} onPress={() => openResponses(requestRow)} style={styles.actionCard}>
          <Text style={styles.cardTitle}>{recordTitle(requestRow)}</Text>
          <Text style={styles.cardDetail}>
            {firstText(requestRow, ['target_county']) || 'Any county'} - {firstText(requestRow, ['quantity_needed']) || '-'} {firstText(requestRow, ['unit']) || 'kg'}
          </Text>
          <View style={styles.metricLine}>
            <Text style={styles.metricChip}>{statusLabel(firstText(requestRow, ['status']) || 'open')}</Text>
            <Text style={styles.metricChip}>{firstText(requestRow, ['responses_count']) || '0'} responses</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function IdVerificationScreen() {
  const [status, setStatus] = useState<RecordRow | null>(null);
  const [front, setFront] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [back, setBack] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await apiFetch<RecordRow>('/id-verification'));
    } catch (requestError) {
      Alert.alert('Could not load verification', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pick = async (side: 'front' | 'back') => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to upload your ID.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled && result.assets[0]) {
      if (side === 'front') setFront(result.assets[0]);
      else setBack(result.assets[0]);
    }
  };

  const upload = async () => {
    if (!front || !back) {
      Alert.alert('Both sides needed', 'Choose the front and back side of the ID.');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('front_side', {
        uri: front.uri,
        name: front.fileName || 'front-id.jpg',
        type: front.mimeType || 'image/jpeg',
      } as unknown as Blob);
      formData.append('back_side', {
        uri: back.uri,
        name: back.fileName || 'back-id.jpg',
        type: back.mimeType || 'image/jpeg',
      } as unknown as Blob);
      setStatus(await apiFetch<RecordRow>('/id-verification/upload', { method: 'POST', body: formData }));
      setFront(null);
      setBack(null);
      Alert.alert('ID uploaded', 'Verification documents were submitted.');
    } catch (requestError) {
      Alert.alert('Upload failed', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.heroPanel}>
        <Text style={styles.panelLabel}>ACCOUNT</Text>
        <Text style={styles.bigName}>ID Verification</Text>
        <Text style={styles.panelNote}>
          Status: {loading ? 'Loading' : statusLabel(firstText(status || {}, ['status']) || 'unverified')}
        </Text>
      </View>
      <View style={styles.actionCard}>
        <Text style={styles.cardTitle}>Upload ID</Text>
        <View style={styles.buttonRow}>
          <Pressable onPress={() => pick('front')} style={styles.secondaryButtonCompact}>
            <Text style={styles.secondaryButtonText}>{front ? 'Front selected' : 'Choose front'}</Text>
          </Pressable>
          <Pressable onPress={() => pick('back')} style={styles.secondaryButtonCompact}>
            <Text style={styles.secondaryButtonText}>{back ? 'Back selected' : 'Choose back'}</Text>
          </Pressable>
        </View>
        <Pressable onPress={upload} disabled={uploading} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{uploading ? 'Uploading...' : 'Submit verification'}</Text>
        </Pressable>
      </View>
      {status ? <DataRow item={{ title: 'Review note', detail: firstText(status, ['reviewer_note']) || 'No reviewer note yet', meta: firstText(status, ['submitted_at', 'reviewed_at']) }} /> : null}
    </View>
  );
}

function FarmerProcurementScreen() {
  const [requests, setRequests] = useState<RecordRow[]>([]);
  const [products, setProducts] = useState<RecordRow[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [procurement, mine] = await Promise.all([
        apiFetch<unknown>('/farmer/procurement'),
        apiFetch<unknown>('/products/mine').catch(() => []),
      ]);
      const productRows = extractRows(mine) as RecordRow[];
      setRequests(extractRows(procurement) as RecordRow[]);
      setProducts(productRows);
      if (!selectedProductId && productRows[0]) {
        setSelectedProductId(firstText(productRows[0], ['id']));
      }
    } catch (requestError) {
      Alert.alert('Could not load opportunities', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedProductId]);

  useEffect(() => {
    void load();
  }, [load]);

  const respond = async (requestRow: RecordRow) => {
    const requestId = firstText(requestRow, ['id']);
    if (!requestId || !selectedProductId || !quantity.trim()) {
      Alert.alert('Response details needed', 'Choose a product and enter the quantity you can supply.');
      return;
    }
    const product = products.find((item) => firstText(item, ['id']) === selectedProductId);
    setBusyId(requestId);
    try {
      await apiFetch(`/farmer/procurement/${requestId}/responses`, {
        method: 'POST',
        body: {
          product_id: selectedProductId,
          quantity_offered: Number(quantity),
          unit: firstText(product || {}, ['unit']) || firstText(requestRow, ['unit']) || 'kg',
          price_per_unit: price ? Number(price) : getNumber(product || {}, ['price_per_unit']),
          notes: notes.trim() || null,
        },
      });
      setQuantity('');
      setPrice('');
      setNotes('');
      await load();
      Alert.alert('Offer submitted', 'Your supply offer was sent to the company.');
    } catch (requestError) {
      Alert.alert('Offer not submitted', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.heroPanel}>
        <Text style={styles.panelLabel}>DISCOVER</Text>
        <Text style={styles.bigName}>Company Requests</Text>
        <Text style={styles.panelNote}>Respond to open procurement requests using your existing listings.</Text>
      </View>
      <View style={styles.actionCard}>
        <Text style={styles.cardTitle}>Your offer details</Text>
        {products.length === 0 ? (
          <Text style={styles.cardDetail}>Create a product listing before responding to company requests.</Text>
        ) : (
          <SegmentedOptions value={selectedProductId} options={products.map((product) => [firstText(product, ['id']), recordTitle(product)])} onChange={setSelectedProductId} />
        )}
        <View style={styles.formRow}>
          <TextInput keyboardType="numeric" placeholder="Quantity" placeholderTextColor="#7a8276" value={quantity} onChangeText={setQuantity} style={[styles.input, styles.formHalf]} />
          <TextInput keyboardType="numeric" placeholder="Price per unit" placeholderTextColor="#7a8276" value={price} onChangeText={setPrice} style={[styles.input, styles.formHalf]} />
        </View>
        <TextInput placeholder="Notes to company" placeholderTextColor="#7a8276" value={notes} onChangeText={setNotes} style={styles.input} />
      </View>
      {loading ? <StateMessage title="Loading" detail="Loading company opportunities..." /> : null}
      {!loading && requests.length === 0 ? <StateMessage title="No open requests" detail="Open company procurement requests will appear here." /> : null}
      {requests.map((requestRow, index) => {
        const id = firstText(requestRow, ['id']) || `${index}`;
        const company = nestedRecord(requestRow, 'company');
        return (
          <View key={id} style={styles.actionCard}>
            <Text style={styles.cardTitle}>{recordTitle(requestRow)}</Text>
            <Text style={styles.cardDetail}>
              {company ? recordTitle(company) : 'Company'} needs {firstText(requestRow, ['quantity_needed']) || '-'} {firstText(requestRow, ['unit']) || 'kg'} in {firstText(requestRow, ['target_county']) || 'Kenya'}.
            </Text>
            <View style={styles.metricLine}>
              <Text style={styles.metricChip}>{statusLabel(firstText(requestRow, ['status']) || 'open')}</Text>
              <Text style={styles.metricChip}>{formatMoney(getNumber(requestRow, ['budget_max']))}</Text>
            </View>
            <Pressable onPress={() => respond(requestRow)} disabled={busyId === id || products.length === 0} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{busyId === id ? 'Sending...' : 'Send offer'}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

function AdminOrdersScreen() {
  const [orders, setOrders] = useState<RecordRow[]>([]);
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState<'confirm' | 'waive'>('confirm');
  const [releaseNow, setReleaseNow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOrders(extractRows(await apiFetch<unknown>('/admin/orders')) as RecordRow[]);
    } catch (requestError) {
      Alert.alert('Could not load orders', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchOrder = async (order: RecordRow, path: string, body: RecordRow, success: string) => {
    const id = firstText(order, ['id']);
    if (!id) return;
    setBusyId(id);
    try {
      await apiFetch(`/admin/orders/${id}/${path}`, { method: 'PATCH', body });
      await load();
      Alert.alert('Order updated', success);
    } catch (requestError) {
      Alert.alert('Order not updated', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.actionCard}>
        <Text style={styles.cardTitle}>Admin order action</Text>
        <TextInput placeholder="Official note or dispute resolution note" placeholderTextColor="#7a8276" value={note} onChangeText={setNote} style={styles.input} />
        <Text style={styles.inputLabel}>Dispute resolution</Text>
        <SegmentedOptions value={resolution} options={[['confirm', 'Confirm delivery'], ['waive', 'Waive dispute']]} onChange={(value) => setResolution(value as 'confirm' | 'waive')} />
        <Pressable onPress={() => setReleaseNow((current) => !current)} style={[styles.checkRow, releaseNow && styles.checkRowActive]}>
          <Text style={[styles.choiceText, releaseNow && styles.choiceTextActive]}>Release payout during dispute resolution</Text>
        </Pressable>
      </View>
      {loading ? <StateMessage title="Loading" detail="Loading platform orders..." /> : null}
      {orders.map((order, index) => {
        const id = firstText(order, ['id']) || `${index}`;
        const product = nestedRecord(order, 'product') || order;
        return (
          <View key={id} style={styles.actionCard}>
            <Text style={styles.cardTitle}>{recordTitle(product)}</Text>
            <Text style={styles.cardDetail}>
              {formatMoney(getNumber(order, ['total_price', 'total_amount']))} - {statusLabel(firstText(order, ['status']) || 'pending')}
            </Text>
            <View style={styles.metricLine}>
              <Text style={styles.metricChip}>Payment {firstText(order, ['payment_status']) || 'unpaid'}</Text>
              <Text style={styles.metricChip}>Payout {firstText(order, ['payout_status']) || 'pending'}</Text>
              <Text style={styles.metricChip}>{firstText(order, ['delivery_signoff_status']) || 'no signoff'}</Text>
            </View>
            <View style={styles.buttonRow}>
              <Pressable onPress={() => patchOrder(order, 'confirm-delivery', { official_note: note.trim() }, 'Delivery officially confirmed.')} disabled={busyId === id} style={styles.secondaryButtonCompact}>
                <Text style={styles.secondaryButtonText}>Confirm delivery</Text>
              </Pressable>
              <Pressable onPress={() => patchOrder(order, 'release', { official_note: note.trim(), override_reason: note.trim() }, 'Payout released.')} disabled={busyId === id} style={styles.secondaryButtonCompact}>
                <Text style={styles.secondaryButtonText}>Release payout</Text>
              </Pressable>
              <Pressable onPress={() => patchOrder(order, 'resolve-dispute', { resolution, resolution_note: note.trim(), release_now: releaseNow }, 'Dispute resolved.')} disabled={busyId === id} style={styles.dangerButtonSmall}>
                <Text style={styles.dangerButtonText}>Resolve dispute</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function AdminLoansScreen() {
  const [loans, setLoans] = useState<RecordRow[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLoans(extractRows(await apiFetch<unknown>('/admin/loans')) as RecordRow[]);
    } catch (requestError) {
      Alert.alert('Could not load loans', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = async (loan: RecordRow, status: string) => {
    const id = firstText(loan, ['id']);
    if (!id) return;
    setBusyId(id);
    try {
      await apiFetch(`/admin/loans/${id}`, { method: 'PATCH', body: { status, note: note.trim() || undefined } });
      await load();
      Alert.alert('Loan updated', `Loan marked ${statusLabel(status)}.`);
    } catch (requestError) {
      Alert.alert('Loan not updated', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <TextInput placeholder="Admin note" placeholderTextColor="#7a8276" value={note} onChangeText={setNote} style={styles.input} />
      {loading ? <StateMessage title="Loading" detail="Loading loan applications..." /> : null}
      {loans.map((loan, index) => {
        const id = firstText(loan, ['id']) || `${index}`;
        const profile = nestedRecord(loan, 'profile');
        return (
          <View key={id} style={styles.actionCard}>
            <Text style={styles.cardTitle}>{firstText(loan, ['product_title']) || recordTitle(loan)}</Text>
            <Text style={styles.cardDetail}>
              {profile ? recordTitle(profile) : firstText(loan, ['user_id'])} - {formatMoney(getNumber(loan, ['requested_amount']))}
            </Text>
            <View style={styles.metricLine}>
              <Text style={styles.metricChip}>{statusLabel(firstText(loan, ['status']) || 'pending_review')}</Text>
              <Text style={styles.metricChip}>{firstText(loan, ['security_type']) || 'unsecured'}</Text>
            </View>
            <View style={styles.buttonRow}>
              {['approved', 'rejected', 'disbursed', 'repaid'].map((status) => (
                <Pressable key={status} onPress={() => update(loan, status)} disabled={busyId === id} style={styles.secondaryButtonCompact}>
                  <Text style={styles.secondaryButtonText}>{statusLabel(status)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function AdminCompaniesScreen() {
  const [companies, setCompanies] = useState<RecordRow[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCompanies(extractRows(await apiFetch<unknown>('/admin/companies?status=all')) as RecordRow[]);
    } catch (requestError) {
      Alert.alert('Could not load companies', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (company: RecordRow, action: 'approve' | 'reject') => {
    const id = firstText(company, ['id']);
    if (!id) return;
    setBusyId(id);
    try {
      await apiFetch(`/admin/companies/${id}/verify`, { method: 'POST', body: { action, notes: note.trim() } });
      await load();
      Alert.alert('Company updated', action === 'approve' ? 'Company approved.' : 'Company rejected.');
    } catch (requestError) {
      Alert.alert('Company not updated', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <TextInput placeholder="Review note" placeholderTextColor="#7a8276" value={note} onChangeText={setNote} style={styles.input} />
      {loading ? <StateMessage title="Loading" detail="Loading company reviews..." /> : null}
      {companies.map((company, index) => {
        const id = firstText(company, ['id']) || `${index}`;
        return (
          <View key={id} style={styles.actionCard}>
            <Text style={styles.cardTitle}>{recordTitle(company)}</Text>
            <Text style={styles.cardDetail}>{firstText(company, ['email']) || firstText(company, ['phone']) || 'No contact saved'}</Text>
            <View style={styles.metricLine}>
              <Text style={styles.metricChip}>{statusLabel(firstText(company, ['verification_status']) || 'pending')}</Text>
              <Text style={styles.metricChip}>{firstText(company, ['company_type']) || 'company'}</Text>
            </View>
            <View style={styles.buttonRow}>
              <Pressable onPress={() => decide(company, 'approve')} disabled={busyId === id} style={styles.secondaryButtonCompact}>
                <Text style={styles.secondaryButtonText}>Approve</Text>
              </Pressable>
              <Pressable onPress={() => decide(company, 'reject')} disabled={busyId === id} style={styles.dangerButtonSmall}>
                <Text style={styles.dangerButtonText}>Reject</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function AdminVerificationsScreen() {
  const [verifications, setVerifications] = useState<RecordRow[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVerifications(extractRows(await apiFetch<unknown>('/admin/verifications')) as RecordRow[]);
    } catch (requestError) {
      Alert.alert('Could not load verifications', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (verification: RecordRow, status: 'verified' | 'rejected') => {
    const id = firstText(verification, ['id']);
    if (!id) return;
    setBusyId(id);
    try {
      await apiFetch(`/admin/verifications/${id}`, { method: 'PATCH', body: { status, reviewer_note: note.trim() } });
      await load();
      Alert.alert('Verification updated', `Status changed to ${statusLabel(status)}.`);
    } catch (requestError) {
      Alert.alert('Verification not updated', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <TextInput placeholder="Reviewer note" placeholderTextColor="#7a8276" value={note} onChangeText={setNote} style={styles.input} />
      {loading ? <StateMessage title="Loading" detail="Loading verification submissions..." /> : null}
      {verifications.map((verification, index) => {
        const id = firstText(verification, ['id']) || `${index}`;
        const profile = nestedRecord(verification, 'profile');
        return (
          <View key={id} style={styles.actionCard}>
            <Text style={styles.cardTitle}>{profile ? recordTitle(profile) : firstText(verification, ['user_id'])}</Text>
            <Text style={styles.cardDetail}>{firstText(verification, ['reviewer_note']) || 'No reviewer note'}</Text>
            <View style={styles.metricLine}>
              <Text style={styles.metricChip}>{statusLabel(firstText(verification, ['status']) || 'pending')}</Text>
              <Text style={styles.metricChip}>{firstText(verification, ['submitted_at']) || 'not submitted'}</Text>
            </View>
            <View style={styles.buttonRow}>
              <Pressable onPress={() => decide(verification, 'verified')} disabled={busyId === id} style={styles.secondaryButtonCompact}>
                <Text style={styles.secondaryButtonText}>Verify</Text>
              </Pressable>
              <Pressable onPress={() => decide(verification, 'rejected')} disabled={busyId === id} style={styles.dangerButtonSmall}>
                <Text style={styles.dangerButtonText}>Reject</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function AdminFeatureFlagsScreen() {
  const [flags, setFlags] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const roles: AppRole[] = ['farmer_free', 'farmer_pro', 'company', 'admin'];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFlags(extractRows(await apiFetch<unknown>('/admin/feature-flags')) as RecordRow[]);
    } catch (requestError) {
      Alert.alert('Could not load feature flags', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (flag: RecordRow, role: AppRole) => {
    const key = firstText(flag, ['feature_key', 'key']);
    if (!key) return;
    const enabled = arrayValues(flag.enabled_for);
    const next = enabled.includes(role) ? enabled.filter((item) => item !== role) : [...enabled, role];
    setBusyKey(key);
    try {
      await apiFetch(`/admin/feature-flags/${key}`, { method: 'PATCH', body: { enabled_for: next } });
      await load();
    } catch (requestError) {
      Alert.alert('Feature flag not updated', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <View style={styles.screen}>
      {loading ? <StateMessage title="Loading" detail="Loading feature flags..." /> : null}
      {flags.map((flag, index) => {
        const key = firstText(flag, ['feature_key', 'key']) || `${index}`;
        const enabled = arrayValues(flag.enabled_for);
        return (
          <View key={key} style={styles.actionCard}>
            <Text style={styles.cardTitle}>{key}</Text>
            <Text style={styles.cardDetail}>{firstText(flag, ['description']) || 'Choose which roles can use this feature.'}</Text>
            <View style={styles.choiceWrap}>
              {roles.map((role) => {
                const active = enabled.includes(role);
                return (
                  <Pressable key={role} onPress={() => toggle(flag, role)} disabled={busyKey === key} style={[styles.choiceChip, active && styles.choiceChipActive]}>
                    <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{formatRole(role)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function UpgradeScreen({ profile }: { profile: Profile | null }) {
  const [phoneNumber, setPhoneNumber] = useState(profile?.phone || '');
  const [paymentId, setPaymentId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPhoneNumber(profile?.phone || '');
  }, [profile?.phone]);

  const startPayment = async () => {
    if (!phoneNumber.trim()) {
      Alert.alert('Phone needed', 'Enter your M-Pesa phone number.');
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch<{ message?: string; payment?: RecordRow }>('/payments/subscriptions/mpesa', {
        method: 'POST',
        body: {
          planRole: 'farmer_pro',
          phoneNumber: phoneNumber.trim(),
        },
      });
      const id = firstText((response.payment || {}) as RecordRow, ['id']);
      setPaymentId(id);
      Alert.alert('Payment started', response.message || 'Check your phone for the M-Pesa prompt.');
    } catch (requestError) {
      Alert.alert('Could not start payment', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const checkPayment = async () => {
    if (!paymentId) {
      Alert.alert('Start payment first', 'Start the M-Pesa payment before checking status.');
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch<RecordRow>(`/payments/subscriptions/${paymentId}/mpesa-status`);
      Alert.alert('Payment status', firstText(response, ['message', 'ResponseDescription', 'status']) || summarizeRecord(response));
    } catch (requestError) {
      Alert.alert('Could not check payment', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.heroPanel}>
        <Text style={styles.panelLabel}>PLAN</Text>
        <Text style={styles.bigName}>Farmer Pro</Text>
        <Text style={styles.panelNote}>Unlock AI scanner, deal matches, crop calendar, and micro-loans.</Text>
      </View>
      <View style={styles.actionCard}>
        <Text style={styles.cardTitle}>Pay with M-Pesa</Text>
        <Text style={styles.cardDetail}>Start the Farmer Pro payment and confirm once M-Pesa completes.</Text>
        <TextInput
          keyboardType="phone-pad"
          placeholder="M-Pesa phone number"
          placeholderTextColor="#7a8276"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          style={styles.input}
        />
        <Pressable onPress={startPayment} disabled={busy} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{busy ? 'Please wait...' : 'Start payment'}</Text>
        </Pressable>
        <Pressable onPress={checkPayment} disabled={busy || !paymentId} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Check payment</Text>
        </Pressable>
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
        <StateMessage title="Nothing here yet" detail="New records will appear here when this workspace has activity." />
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
      detail="This tool is available for your account. Open the related dashboard area to continue."
    />
  );
}

function ProfileScreen({
  appearance,
  notificationPrefs,
  profile,
  role,
  setAppearance,
  setActiveKey,
  setNotificationPrefs,
}: {
  appearance: AppearanceMode;
  notificationPrefs: NotificationPrefs;
  profile: Profile | null;
  role: AppRole | null;
  setAppearance: (mode: AppearanceMode) => void;
  setActiveKey: (key: MobileRouteKey) => void;
  setNotificationPrefs: (prefs: NotificationPrefs) => void;
}) {
  const isDark = useIsDark();
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    county: profile?.county || '',
    phone: profile?.phone || '',
    payout_method: profile?.payout_method || '',
    payout_mpesa_number: profile?.payout_mpesa_number || '',
    bank_name: profile?.bank_name || '',
    bank_account_name: profile?.bank_account_name || '',
    bank_account_number: profile?.bank_account_number || '',
  });
  const [activeSection, setActiveSection] = useState('personal');
  const [passwordForm, setPasswordForm] = useState({ password: '', confirmPassword: '' });
  const [photoAsset, setPhotoAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [front, setFront] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [back, setBack] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [verification, setVerification] = useState<RecordRow | null>(null);

  useEffect(() => {
    setForm({
      full_name: profile?.full_name || '',
      county: profile?.county || '',
      phone: profile?.phone || '',
      payout_method: profile?.payout_method || '',
      payout_mpesa_number: profile?.payout_mpesa_number || '',
      bank_name: profile?.bank_name || '',
      bank_account_name: profile?.bank_account_name || '',
      bank_account_number: profile?.bank_account_number || '',
    });
  }, [profile]);

  useEffect(() => {
    if (!isAdminRole(role)) {
      apiFetch<RecordRow>('/id-verification')
        .then(setVerification)
        .catch(() => setVerification(null));
    }
  }, [role]);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch('/profiles/me', {
        method: 'PATCH',
        body: {
          full_name: form.full_name,
          county: form.county,
          phone: form.phone,
          payout_method: form.payout_method || null,
          payout_mpesa_number: form.payout_method === 'mpesa' ? form.payout_mpesa_number : null,
          bank_name: form.payout_method === 'bank' ? form.bank_name : null,
          bank_account_name: form.payout_method === 'bank' ? form.bank_account_name : null,
          bank_account_number: form.payout_method === 'bank' ? form.bank_account_number : null,
        },
      });
      Alert.alert('Settings saved', 'Your profile has been updated.');
    } catch (requestError) {
      Alert.alert('Could not save', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const pickProfilePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to update your profile photo.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!picked.canceled && picked.assets[0]) setPhotoAsset(picked.assets[0]);
  };

  const uploadProfilePhoto = async () => {
    if (!photoAsset) {
      Alert.alert('Choose photo', 'Choose a profile photo first.');
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('photo', {
        uri: photoAsset.uri,
        name: photoAsset.fileName || 'profile-photo.jpg',
        type: photoAsset.mimeType || 'image/jpeg',
      } as unknown as Blob);
      await apiFetch('/profiles/me/photo', { method: 'POST', body: formData });
      setPhotoAsset(null);
      Alert.alert('Photo updated', 'Your profile photo was uploaded.');
    } catch (requestError) {
      Alert.alert('Photo not uploaded', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (passwordForm.password.length < 6 || passwordForm.password !== passwordForm.confirmPassword) {
      Alert.alert('Check password', 'Use at least 6 characters and make sure both passwords match.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordForm.password });
      if (error) throw error;
      setPasswordForm({ password: '', confirmPassword: '' });
      Alert.alert('Password updated', 'Use the new password next time you sign in.');
    } catch (requestError) {
      Alert.alert('Password not updated', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const pickIdSide = async (side: 'front' | 'back') => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to upload your ID.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!picked.canceled && picked.assets[0]) {
      if (side === 'front') setFront(picked.assets[0]);
      else setBack(picked.assets[0]);
    }
  };

  const uploadId = async () => {
    if (!front || !back) {
      Alert.alert('Both sides needed', 'Choose the front and back side of the ID.');
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('front_side', { uri: front.uri, name: front.fileName || 'front-id.jpg', type: front.mimeType || 'image/jpeg' } as unknown as Blob);
      formData.append('back_side', { uri: back.uri, name: back.fileName || 'back-id.jpg', type: back.mimeType || 'image/jpeg' } as unknown as Blob);
      setVerification(await apiFetch<RecordRow>('/id-verification/upload', { method: 'POST', body: formData }));
      setFront(null);
      setBack(null);
      Alert.alert('ID submitted', 'Your identity verification was uploaded.');
    } catch (requestError) {
      Alert.alert('ID not uploaded', requestError instanceof Error ? requestError.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const sections = isAdminRole(role)
    ? [['personal', 'Personal'], ['contact', 'Contact'], ['security', 'Security'], ['settings', 'Settings']]
    : [['personal', 'Personal'], ['contact', 'Contact'], ['payout', 'Payout'], ['security', 'Security'], ['verification', 'Verify'], ['settings', 'Settings']];

  return (
    <View style={styles.screen}>
      <View style={[styles.profilePanel, isDark && styles.profilePanelDark]}>
        {photoAsset?.uri || profile?.photo_url ? (
          <Image source={{ uri: photoAsset?.uri || profile?.photo_url || '' }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(profile?.full_name || 'A').slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.profileText}>
          <Text style={[styles.profileName, isDark && styles.profileNameDark]}>{profile?.full_name || 'AgriLink User'}</Text>
          <Text style={[styles.mutedText, isDark && styles.mutedTextDark]}>{formatRole(role)}</Text>
        </View>
      </View>
      <ProfileReadinessPanel profile={profile} role={role} setActiveKey={setActiveKey} />
      <SegmentedOptions value={activeSection} options={sections} onChange={setActiveSection} />
      <View style={[styles.actionCard, isDark && styles.actionCardDark]}>
        {activeSection === 'personal' ? (
          <>
            <Text style={[styles.cardTitle, isDark && styles.cardTitleDark]}>Personal details</Text>
            <TextInput placeholder="Full name" placeholderTextColor={isDark ? '#8fa08e' : '#7a8276'} value={form.full_name} onChangeText={(value) => setForm((current) => ({ ...current, full_name: value }))} style={[styles.input, isDark && styles.inputDark]} />
            <Pressable onPress={pickProfilePhoto} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{photoAsset ? 'Photo selected' : 'Choose profile photo'}</Text>
            </Pressable>
            <Pressable onPress={uploadProfilePhoto} disabled={saving || !photoAsset} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Upload photo</Text>
            </Pressable>
            <Pressable onPress={save} disabled={saving} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save personal details'}</Text>
            </Pressable>
          </>
        ) : null}
        {activeSection === 'contact' ? (
          <>
            <Text style={[styles.cardTitle, isDark && styles.cardTitleDark]}>Contact details</Text>
            <CountyPicker value={form.county} onChange={(value) => setForm((current) => ({ ...current, county: value }))} />
            <TextInput keyboardType="phone-pad" placeholder="Phone" placeholderTextColor={isDark ? '#8fa08e' : '#7a8276'} value={form.phone} onChangeText={(value) => setForm((current) => ({ ...current, phone: value }))} style={[styles.input, isDark && styles.inputDark]} />
            <Pressable onPress={save} disabled={saving} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save contact details'}</Text>
            </Pressable>
          </>
        ) : null}
        {activeSection === 'payout' ? (
          <>
            <Text style={[styles.cardTitle, isDark && styles.cardTitleDark]}>Payout details</Text>
            <SegmentedOptions value={form.payout_method} options={payoutOptions} onChange={(value) => setForm((current) => ({ ...current, payout_method: value }))} />
            {form.payout_method === 'mpesa' ? (
              <TextInput keyboardType="phone-pad" placeholder="M-Pesa payout number" placeholderTextColor={isDark ? '#8fa08e' : '#7a8276'} value={form.payout_mpesa_number} onChangeText={(value) => setForm((current) => ({ ...current, payout_mpesa_number: value }))} style={[styles.input, isDark && styles.inputDark]} />
            ) : null}
            {form.payout_method === 'bank' ? (
              <>
                <TextInput placeholder="Bank name" placeholderTextColor={isDark ? '#8fa08e' : '#7a8276'} value={form.bank_name} onChangeText={(value) => setForm((current) => ({ ...current, bank_name: value }))} style={[styles.input, isDark && styles.inputDark]} />
                <TextInput placeholder="Account name" placeholderTextColor={isDark ? '#8fa08e' : '#7a8276'} value={form.bank_account_name} onChangeText={(value) => setForm((current) => ({ ...current, bank_account_name: value }))} style={[styles.input, isDark && styles.inputDark]} />
                <TextInput keyboardType="numeric" placeholder="Account number" placeholderTextColor={isDark ? '#8fa08e' : '#7a8276'} value={form.bank_account_number} onChangeText={(value) => setForm((current) => ({ ...current, bank_account_number: value }))} style={[styles.input, isDark && styles.inputDark]} />
              </>
            ) : null}
            <Pressable onPress={save} disabled={saving} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save payout details'}</Text>
            </Pressable>
          </>
        ) : null}
        {activeSection === 'security' ? (
          <>
            <Text style={[styles.cardTitle, isDark && styles.cardTitleDark]}>Change password</Text>
            <TextInput secureTextEntry placeholder="New password" placeholderTextColor={isDark ? '#8fa08e' : '#7a8276'} value={passwordForm.password} onChangeText={(value) => setPasswordForm((current) => ({ ...current, password: value }))} style={[styles.input, isDark && styles.inputDark]} />
            <TextInput secureTextEntry placeholder="Confirm password" placeholderTextColor={isDark ? '#8fa08e' : '#7a8276'} value={passwordForm.confirmPassword} onChangeText={(value) => setPasswordForm((current) => ({ ...current, confirmPassword: value }))} style={[styles.input, isDark && styles.inputDark]} />
            <Pressable onPress={changePassword} disabled={saving} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Update password'}</Text>
            </Pressable>
          </>
        ) : null}
        {activeSection === 'verification' ? (
          <>
            <Text style={[styles.cardTitle, isDark && styles.cardTitleDark]}>Identity verification</Text>
            <Text style={[styles.cardDetail, isDark && styles.cardDetailDark]}>Status: {statusLabel(firstText(verification || {}, ['status']) || 'unverified')}</Text>
            <View style={styles.buttonRow}>
              <Pressable onPress={() => pickIdSide('front')} style={styles.secondaryButtonCompact}>
                <Text style={styles.secondaryButtonText}>{front ? 'Front selected' : 'Choose front'}</Text>
              </Pressable>
              <Pressable onPress={() => pickIdSide('back')} style={styles.secondaryButtonCompact}>
                <Text style={styles.secondaryButtonText}>{back ? 'Back selected' : 'Choose back'}</Text>
              </Pressable>
            </View>
            <Pressable onPress={uploadId} disabled={saving} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{saving ? 'Uploading...' : 'Submit ID'}</Text>
            </Pressable>
          </>
        ) : null}
        {activeSection === 'settings' ? (
          <>
            <Text style={[styles.cardTitle, isDark && styles.cardTitleDark]}>App settings</Text>
            <Text style={[styles.cardDetail, isDark && styles.cardDetailDark]}>Manage the tools, alerts, and display preferences for this mobile workspace.</Text>
            <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>Appearance</Text>
            <SegmentedOptions value={appearance} options={['System', 'Light', 'Dark']} onChange={(value) => setAppearance(value as AppearanceMode)} />
            <View style={[styles.subPanel, isDark && styles.subPanelDark]}>
              <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>Notifications</Text>
              <SettingsToggle label="Orders and delivery" value={notificationPrefs.orderAlerts} onChange={(value) => setNotificationPrefs({ ...notificationPrefs, orderAlerts: value })} />
              <SettingsToggle label="Loans and repayments" value={notificationPrefs.loanAlerts} onChange={(value) => setNotificationPrefs({ ...notificationPrefs, loanAlerts: value })} />
              <SettingsToggle label="Messages" value={notificationPrefs.messageAlerts} onChange={(value) => setNotificationPrefs({ ...notificationPrefs, messageAlerts: value })} />
            </View>
            <View style={styles.buttonRow}>
              {getProfileActions(role).map((action) => (
                <Pressable key={action.key} onPress={() => setActiveKey(action.key)} style={styles.secondaryButtonCompact}>
                  <Text style={styles.secondaryButtonText}>{action.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </View>
      <DataRow item={{ title: 'Plan expires', detail: profile?.plan_expires_at || 'Not set' }} />
      <Pressable onPress={signOut} style={styles.dangerButton}>
        <Text style={styles.dangerButtonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

function SettingsToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  const isDark = useIsDark();
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.settingsToggle}>
      <Text style={[styles.settingsToggleLabel, isDark && styles.settingsToggleLabelDark]}>{label}</Text>
      <View style={[styles.toggleTrack, value && styles.toggleTrackActive]}>
        <View style={[styles.toggleKnob, value && styles.toggleKnobActive]} />
      </View>
    </Pressable>
  );
}

function ProfileReadinessPanel({
  profile,
  role,
  setActiveKey,
}: {
  profile: Profile | null;
  role: AppRole | null;
  setActiveKey: (key: MobileRouteKey) => void;
}) {
  const isDark = useIsDark();
  const profileReady = Boolean(profile?.full_name && profile?.county && profile?.phone);
  const payoutReady = Boolean(
    profile?.payout_method === 'mpesa'
      ? profile?.payout_mpesa_number
      : profile?.payout_method === 'bank'
        ? profile?.bank_name && profile?.bank_account_name && profile?.bank_account_number
        : false,
  );
  const farmReady = Boolean(profile?.farm_size && profile?.main_crops?.length && profile?.farm_type);
  const gpsReady = Boolean(profile?.farm_gps_lat && profile?.farm_gps_lng);

  const cards = isAdminRole(role)
    ? [
        ['Admin workspace', 'Platform reviews, user roles, orders, and loans'],
        ['Access level', 'Platform admin'],
        ['Account', profileReady ? 'Contact details complete' : 'Add name, phone, and county'],
      ]
    : role === 'company'
      ? [
          ['Company account', profileReady ? 'Contact details complete' : 'Add contact details'],
          ['Payout readiness', payoutReady ? 'Ready for payouts' : 'Add payout method'],
          ['Trade tools', 'Products, procurement, orders, and messages'],
        ]
      : [
          ['Profile readiness', profileReady ? 'Contact details complete' : 'Add name, phone, and county'],
          ['Farm readiness', farmReady ? 'Farm profile complete' : 'Add farm size, crops, and type'],
          ['Payout readiness', payoutReady ? 'Ready for payouts' : 'Add M-Pesa or bank details'],
          ['GPS verification', gpsReady ? 'Farm GPS saved' : 'Capture farm GPS'],
        ];

  return (
    <View style={[styles.actionCard, isDark && styles.actionCardDark]}>
      <Text style={[styles.cardTitle, isDark && styles.cardTitleDark]}>{isAdminRole(role) ? 'Admin account' : 'Account readiness'}</Text>
      <View style={styles.readinessGrid}>
        {cards.map(([title, detail]) => (
          <View key={title} style={[styles.readinessCard, isDark && styles.readinessCardDark]}>
            <Text style={[styles.readinessTitle, isDark && styles.readinessTitleDark]}>{title}</Text>
            <Text style={[styles.readinessDetail, isDark && styles.readinessDetailDark]}>{detail}</Text>
          </View>
        ))}
      </View>
      <View style={styles.buttonRow}>
        {getProfileActions(role).map((action) => (
          <Pressable key={action.key} onPress={() => setActiveKey(action.key)} style={styles.secondaryButtonCompact}>
            <Text style={styles.secondaryButtonText}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function getProfileActions(role: AppRole | null): Array<{ key: MobileRouteKey; label: string }> {
  if (isAdminRole(role)) {
    return [
      { key: 'adminOverview', label: 'Overview' },
      { key: 'adminUsers', label: 'Users' },
      { key: 'adminLoanDecisions', label: 'Loans' },
      { key: 'adminTransactions', label: 'Payouts' },
    ];
  }

  if (role === 'company') {
    return [
      { key: 'companySettings', label: 'Company Profile' },
      { key: 'companyProcurement', label: 'Procurement' },
      { key: 'companyProducts', label: 'Products' },
      { key: 'companyOrders', label: 'Orders' },
    ];
  }

  return [
    { key: 'farm', label: 'Farm' },
    { key: 'products', label: 'Listings' },
    { key: 'idVerification', label: 'Verify ID' },
    { key: 'microLoans', label: 'Loans' },
  ];
}

function CountyPicker({
  value,
  onChange,
  label = 'County',
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const isDark = useIsDark();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const normalized = search.trim().toLowerCase();
  const filtered = normalized
    ? countyOptions.filter((county) => county.toLowerCase().includes(normalized))
    : countyOptions;

  return (
    <>
      <View style={styles.dropdownFieldWrap}>
        <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>{label}</Text>
        <Pressable onPress={() => setOpen(true)} style={[styles.dropdownField, isDark && styles.dropdownFieldDark]}>
          <Text style={[styles.dropdownValue, isDark && styles.dropdownValueDark, !value && styles.dropdownPlaceholder]}>{value || 'Choose county'}</Text>
          <Text style={styles.dropdownCaret}>v</Text>
        </Pressable>
      </View>
      <Modal animationType="fade" transparent visible={open} onRequestClose={() => setOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.dropdownSheet, isDark && styles.dropdownSheetDark]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.cardTitle, isDark && styles.cardTitleDark]}>{label}</Text>
              <Pressable onPress={() => setOpen(false)} style={styles.closeButton}>
                <Text style={styles.secondaryButtonText}>Close</Text>
              </Pressable>
            </View>
            <TextInput
              placeholder="Search county"
              placeholderTextColor={isDark ? '#8fa08e' : '#7a8276'}
              value={search}
              onChangeText={setSearch}
              style={[styles.input, isDark && styles.inputDark]}
            />
            <ScrollView style={styles.dropdownList} showsVerticalScrollIndicator>
              {filtered.map((county) => {
                const active = value === county;
                return (
                  <Pressable
                    key={county}
                    onPress={() => {
                      onChange(county);
                      setOpen(false);
                      setSearch('');
                    }}
                    style={[styles.dropdownOption, isDark && styles.dropdownOptionDark, active && styles.dropdownOptionActive]}
                  >
                    <Text style={[styles.dropdownOptionText, isDark && styles.dropdownOptionTextDark, active && styles.dropdownOptionTextActive]}>{county}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function StateMessage({ title, detail }: { title: string; detail: string }) {
  const isDark = useIsDark();
  return (
    <View style={[styles.statePanel, isDark && styles.statePanelDark]}>
      <Text style={[styles.stateTitle, isDark && styles.stateTitleDark]}>{title}</Text>
      <Text style={[styles.stateDetail, isDark && styles.stateDetailDark]}>{detail}</Text>
    </View>
  );
}

function DataRow({ item }: { item: { title: string; detail: string; meta?: string } }) {
  const isDark = useIsDark();
  return (
    <View style={[styles.dataRow, isDark && styles.dataRowDark]}>
      <View style={styles.rowMarker} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, isDark && styles.rowTitleDark]}>{item.title}</Text>
        <Text style={[styles.rowDetail, isDark && styles.rowDetailDark]}>{item.detail}</Text>
        {item.meta ? <Text style={styles.rowMeta}>{item.meta}</Text> : null}
      </View>
    </View>
  );
}

function SegmentedOptions({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[] | string[][];
  onChange: (value: string) => void;
}) {
  const isDark = useIsDark();
  return (
    <View style={styles.choiceWrap}>
      {options.map((option) => {
        const optionValue = Array.isArray(option) ? option[0] : option;
        const label = Array.isArray(option) ? option[1] : option;
        const active = value === optionValue;
        return (
          <Pressable key={optionValue} onPress={() => onChange(optionValue)} style={[styles.choiceChip, isDark && styles.choiceChipDark, active && styles.choiceChipActive]}>
            <Text style={[styles.choiceText, isDark && styles.choiceTextDark, active && styles.choiceTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
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
  const keys = ['products', 'orders', 'requests', 'responses', 'partners', 'companies', 'notifications', 'conversations', 'applications', 'profile', 'company'];
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return data;
}

function filterNotificationsByPrefs(rows: RecordRow[], prefs: NotificationPrefs) {
  return rows.filter((notification) => {
    const text = [
      firstText(notification, ['title']),
      firstText(notification, ['message']),
      firstText(notification, ['type', 'category']),
    ].join(' ').toLowerCase();
    if (!prefs.orderAlerts && /(order|delivery|payout|payment)/.test(text)) return false;
    if (!prefs.loanAlerts && /(loan|repay|finance|credit)/.test(text)) return false;
    if (!prefs.messageAlerts && /(message|chat|conversation)/.test(text)) return false;
    return true;
  });
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

function recordTitle(record: RecordRow) {
  return (
    firstText(record, ['title', 'name', 'full_name', 'company_name', 'product_name', 'product_title', 'crop_name']) ||
    firstText(record, ['status']) ||
    'Record'
  );
}

function nestedRecord(record: RecordRow, key: string) {
  const value = record[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordRow) : null;
}

function getNumber(record: RecordRow, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return 0;
}

function splitList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayValues(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function firstList(record: RecordRow, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    if (typeof value === 'string' && value.trim()) {
      return value
        .split(/\n|,|;/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function arrayText(value: unknown) {
  return arrayValues(value).join(', ');
}

function formatMoney(value: number) {
  return `KES ${Math.round(value).toLocaleString('en-KE')}`;
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function statusLabel(status: string) {
  return status
    .split('_')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatRole(role: AppRole | null) {
  if (role === 'farmer_pro') return 'Farmer Pro';
  if (role === 'farmer_free') return 'Free';
  if (role === 'company') return 'Company';
  if (isAdminRole(role)) return 'Admin';
  return 'Free';
}

function getBottomKeys(role: AppRole | null) {
  if (isAdminRole(role)) return adminBottomKeys;
  if (role === 'company') return companyBottomKeys;
  return farmerBottomKeys;
}

function tabIconName(key: MobileRouteKey, active: boolean): keyof typeof Ionicons.glyphMap {
  const suffix = active ? '' : '-outline';
  if (key === 'dashboard') return active ? 'home' : 'home-outline';
  if (key === 'marketplace') return active ? 'storefront' : 'storefront-outline';
  if (key === 'cart') return active ? 'cart' : 'cart-outline';
  if (key === 'orders' || key === 'companyOrders') return active ? 'receipt' : 'receipt-outline';
  if (key === 'microLoans' || key === 'adminLoans' || key === 'adminLoanDecisions') return active ? 'wallet' : 'wallet-outline';
  if (key === 'companyProducts') return active ? 'cube' : 'cube-outline';
  if (key === 'companyProcurement') return active ? 'clipboard' : 'clipboard-outline';
  if (key === 'adminOverview') return active ? 'shield-checkmark' : 'shield-checkmark-outline';
  if (key === 'adminUsers') return active ? 'people' : 'people-outline';
  if (key === 'profile') return active ? 'person' : 'person-outline';
  return `ellipse${suffix}` as keyof typeof Ionicons.glyphMap;
}

function shortLabel(title: string) {
  if (title === 'Marketplace') return 'Market';
  if (title === 'Micro-Loans') return 'Loans';
  if (title === 'Profile & Settings') return 'Profile';
  if (title === 'Company Products') return 'Products';
  if (title === 'Loan Offers') return 'Loans';
  if (title === 'User Roles') return 'Users';
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
  inputDark: {
    backgroundColor: '#18231b',
    borderColor: '#304231',
    color: '#f6f7f2',
  },
  textArea: {
    minHeight: 92,
    paddingTop: 14,
    textAlignVertical: 'top',
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  formHalf: {
    flex: 1,
  },
  inputLabel: {
    color: '#203d2b',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  inputLabelDark: {
    color: '#b9d0b8',
  },
  choiceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    backgroundColor: '#f6f7f2',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  choiceChipDark: {
    backgroundColor: '#18231b',
    borderColor: '#304231',
  },
  choiceChipActive: {
    backgroundColor: '#2f6b3f',
    borderColor: '#2f6b3f',
  },
  choiceText: {
    color: '#687365',
    fontSize: 13,
    fontWeight: '800',
  },
  choiceTextDark: {
    color: '#b9c8b7',
  },
  choiceTextActive: {
    color: '#ffffff',
  },
  checkRow: {
    backgroundColor: '#f6f7f2',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  checkRowActive: {
    backgroundColor: '#e8f3df',
    borderColor: '#79ae5f',
  },
  subPanel: {
    backgroundColor: '#f6f7f2',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  subPanelDark: {
    backgroundColor: '#18231b',
    borderColor: '#304231',
  },
  pickerPanel: {
    backgroundColor: '#f6f7f2',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  pickerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pickerSelected: {
    color: '#2f6b3f',
    flex: 1,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
  },
  dropdownFieldWrap: {
    gap: 6,
  },
  dropdownField: {
    alignItems: 'center',
    backgroundColor: '#f6f7f2',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    height: 52,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  dropdownFieldDark: {
    backgroundColor: '#18231b',
    borderColor: '#304231',
  },
  dropdownValue: {
    color: '#162016',
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  dropdownValueDark: {
    color: '#f6f7f2',
  },
  dropdownPlaceholder: {
    color: '#7a8276',
    fontWeight: '500',
  },
  dropdownCaret: {
    color: '#2f6b3f',
    fontSize: 15,
    fontWeight: '900',
    marginLeft: 10,
  },
  modalBackdrop: {
    backgroundColor: 'rgba(10, 18, 12, 0.55)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: 18,
  },
  dropdownSheet: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    gap: 12,
    maxHeight: '82%',
    padding: 14,
  },
  dropdownSheetDark: {
    backgroundColor: '#111812',
  },
  modalSheet: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    gap: 12,
    maxHeight: '88%',
    padding: 14,
  },
  modalSheetDark: {
    backgroundColor: '#111812',
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  closeButton: {
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dropdownList: {
    maxHeight: 420,
  },
  dropdownOption: {
    borderBottomColor: '#eef2ea',
    borderBottomWidth: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  dropdownOptionDark: {
    borderBottomColor: '#263628',
  },
  dropdownOptionActive: {
    backgroundColor: '#e8f3df',
  },
  dropdownOptionText: {
    color: '#162016',
    fontSize: 15,
    fontWeight: '800',
  },
  dropdownOptionTextDark: {
    color: '#f6f7f2',
  },
  dropdownOptionTextActive: {
    color: '#2f6b3f',
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
  safeAreaDark: {
    backgroundColor: '#111812',
  },
  app: {
    backgroundColor: '#f6f7f2',
    flex: 1,
  },
  appDark: {
    backgroundColor: '#111812',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  headerDark: {
    backgroundColor: '#111812',
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
  headerTitleDark: {
    color: '#f6f7f2',
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
  sectionTitleDark: {
    color: '#f6f7f2',
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
  chartPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  chartTitle: {
    color: '#162016',
    fontSize: 14,
    fontWeight: '900',
  },
  chartRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  chartLabel: {
    color: '#687365',
    fontSize: 11,
    fontWeight: '800',
    width: 88,
  },
  chartTrack: {
    backgroundColor: '#eef2ea',
    borderRadius: 8,
    flex: 1,
    height: 12,
    overflow: 'hidden',
  },
  chartFill: {
    backgroundColor: '#2f6b3f',
    borderRadius: 8,
    height: '100%',
  },
  chartValue: {
    color: '#203d2b',
    fontSize: 12,
    fontWeight: '900',
    minWidth: 24,
    textAlign: 'right',
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
    flexWrap: 'wrap',
    gap: 10,
  },
  quickButton: {
    alignItems: 'center',
    backgroundColor: '#2f6b3f',
    borderRadius: 8,
    height: 52,
    justifyContent: 'center',
    minWidth: '48%',
    paddingHorizontal: 10,
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
    height: 52,
    justifyContent: 'center',
    minWidth: '48%',
    paddingHorizontal: 10,
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
  actionCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  actionCardDark: {
    backgroundColor: '#18231b',
    borderColor: '#304231',
  },
  mapPanel: {
    backgroundColor: '#eef7ea',
    borderColor: '#c9dfbd',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  financePanel: {
    backgroundColor: '#203d2b',
    borderRadius: 8,
    padding: 18,
  },
  financeAmount: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 8,
  },
  marketHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  marketCount: {
    color: '#687365',
    fontSize: 12,
    fontWeight: '800',
    marginTop: -6,
  },
  marketCategoryRow: {
    gap: 8,
    paddingRight: 20,
  },
  marketCategoryChip: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  marketCategoryChipDark: {
    backgroundColor: '#18231b',
    borderColor: '#304231',
  },
  marketCategoryChipActive: {
    backgroundColor: '#2f6b3f',
    borderColor: '#2f6b3f',
  },
  marketCategoryText: {
    color: '#687365',
    fontSize: 12,
    fontWeight: '900',
  },
  marketCategoryTextDark: {
    color: '#b9c8b7',
  },
  marketCategoryTextActive: {
    color: '#ffffff',
  },
  marketGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  marketProductCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 7,
    padding: 8,
    width: '48%',
  },
  marketProductCardDark: {
    backgroundColor: '#18231b',
    borderColor: '#304231',
  },
  marketCover: {
    aspectRatio: 1.45,
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    width: '100%',
  },
  marketCoverFallback: {
    alignItems: 'center',
    aspectRatio: 1.45,
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    justifyContent: 'center',
    width: '100%',
  },
  marketThumb: {
    aspectRatio: 1,
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    width: '100%',
  },
  marketThumbFallback: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    justifyContent: 'center',
    width: '100%',
  },
  videoBadge: {
    backgroundColor: '#203d2b',
    borderRadius: 8,
    bottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
    right: 6,
  },
  videoBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  marketProductTitle: {
    color: '#162016',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 16,
    minHeight: 32,
  },
  marketProductTitleDark: {
    color: '#f6f7f2',
  },
  marketProductMeta: {
    color: '#687365',
    fontSize: 11,
    fontWeight: '700',
  },
  marketProductMetaDark: {
    color: '#9fb09d',
  },
  marketPrice: {
    color: '#2f6b3f',
    fontSize: 14,
    fontWeight: '900',
  },
  marketSignalRow: {
    flexDirection: 'row',
    gap: 5,
  },
  marketSignal: {
    backgroundColor: '#f6f7f2',
    borderRadius: 6,
    color: '#687365',
    flex: 1,
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 5,
    textAlign: 'center',
  },
  marketSignalDark: {
    backgroundColor: '#111812',
    color: '#b9c8b7',
  },
  marketActions: {
    flexDirection: 'row',
    gap: 6,
  },
  marketMiniButton: {
    alignItems: 'center',
    backgroundColor: '#f6f7f2',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  marketMiniButtonActive: {
    backgroundColor: '#fff1ef',
    borderColor: '#f1c1ba',
  },
  marketMiniButtonText: {
    color: '#687365',
    fontSize: 11,
    fontWeight: '900',
  },
  marketMiniButtonTextActive: {
    color: '#a13b2f',
  },
  marketCartButton: {
    alignItems: 'center',
    backgroundColor: '#2f6b3f',
    borderRadius: 8,
    flex: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  marketCartButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  marketModalImage: {
    aspectRatio: 1.45,
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    width: '100%',
  },
  videoPlayerPanel: {
    backgroundColor: '#111812',
    borderRadius: 8,
    gap: 8,
    padding: 10,
  },
  videoPlayer: {
    aspectRatio: 1.65,
    backgroundColor: '#000000',
    borderRadius: 8,
    width: '100%',
  },
  videoEmpty: {
    backgroundColor: '#f6f7f2',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  quantityPanel: {
    backgroundColor: '#f6f7f2',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  quantityControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  quantityButton: {
    alignItems: 'center',
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    width: 48,
  },
  quantityButtonText: {
    color: '#2f6b3f',
    fontSize: 20,
    fontWeight: '900',
  },
  quantityValue: {
    color: '#162016',
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  quantityValueDark: {
    color: '#f6f7f2',
  },
  warningPanel: {
    backgroundColor: '#fff7df',
    borderColor: '#f0cd6b',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  warningTitle: {
    color: '#6f4e08',
    fontSize: 13,
    fontWeight: '900',
  },
  warningText: {
    color: '#85620f',
    fontSize: 12,
    lineHeight: 17,
  },
  resultBullet: {
    color: '#203d2b',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  cardTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  productThumb: {
    alignItems: 'center',
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  productThumbText: {
    color: '#2f6b3f',
    fontSize: 20,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    color: '#162016',
    fontSize: 16,
    fontWeight: '900',
  },
  cardTitleDark: {
    color: '#f6f7f2',
  },
  cardDetail: {
    color: '#687365',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  cardDetailDark: {
    color: '#b9c8b7',
  },
  metricLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricChip: {
    backgroundColor: '#f6f7f2',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#203d2b',
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  readinessGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  readinessCard: {
    backgroundColor: '#f6f7f2',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 76,
    padding: 12,
    width: '48%',
  },
  readinessCardDark: {
    backgroundColor: '#111812',
    borderColor: '#304231',
  },
  readinessTitle: {
    color: '#162016',
    fontSize: 12,
    fontWeight: '900',
  },
  readinessTitleDark: {
    color: '#f6f7f2',
  },
  readinessDetail: {
    color: '#687365',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 5,
  },
  readinessDetailDark: {
    color: '#b9c8b7',
  },
  settingsToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 42,
  },
  settingsToggleLabel: {
    color: '#162016',
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  settingsToggleLabelDark: {
    color: '#f6f7f2',
  },
  toggleTrack: {
    backgroundColor: '#dfe5d8',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    paddingHorizontal: 3,
    width: 44,
  },
  toggleTrackActive: {
    backgroundColor: '#2f6b3f',
  },
  toggleKnob: {
    backgroundColor: '#ffffff',
    borderRadius: 9,
    height: 18,
    width: 18,
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: '#2f6b3f',
    fontSize: 14,
    fontWeight: '900',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  secondaryButtonCompact: {
    alignItems: 'center',
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  totalPanel: {
    backgroundColor: '#203d2b',
    borderRadius: 8,
    padding: 18,
  },
  totalText: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '900',
    marginTop: 8,
  },
  dangerButtonSmall: {
    alignItems: 'center',
    backgroundColor: '#fff1ef',
    borderRadius: 8,
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  scanPreview: {
    aspectRatio: 1.45,
    backgroundColor: '#f6f7f2',
    borderRadius: 8,
    width: '100%',
  },
  mediaPreview: {
    aspectRatio: 1.6,
    backgroundColor: '#f6f7f2',
    borderRadius: 8,
    width: '100%',
  },
  statePanel: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
  },
  statePanelDark: {
    backgroundColor: '#18231b',
    borderColor: '#304231',
  },
  stateTitle: {
    color: '#162016',
    fontSize: 18,
    fontWeight: '900',
  },
  stateTitleDark: {
    color: '#f6f7f2',
  },
  stateDetail: {
    color: '#687365',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  stateDetailDark: {
    color: '#b9c8b7',
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
  dataRowDark: {
    backgroundColor: '#18231b',
    borderColor: '#304231',
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
  rowTitleDark: {
    color: '#f6f7f2',
  },
  rowDetail: {
    color: '#687365',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  rowDetailDark: {
    color: '#b9c8b7',
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
  profilePanelDark: {
    backgroundColor: '#18231b',
    borderColor: '#304231',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  avatarImage: {
    backgroundColor: '#e8f3df',
    borderRadius: 8,
    height: 60,
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
  profileNameDark: {
    color: '#f6f7f2',
  },
  mutedText: {
    color: '#687365',
    fontSize: 14,
    marginTop: 3,
  },
  mutedTextDark: {
    color: '#b9c8b7',
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
  tabBarDark: {
    backgroundColor: '#111812',
    borderColor: '#304231',
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
