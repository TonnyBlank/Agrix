import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type TabKey = 'home' | 'market' | 'loans' | 'messages' | 'profile';

type Tab = {
  key: TabKey;
  icon: string;
  label: string;
  title: string;
};

const tabs: Tab[] = [
  { key: 'home', icon: 'H', label: 'Home', title: 'Home' },
  { key: 'market', icon: 'M', label: 'Market', title: 'Market' },
  { key: 'loans', icon: 'L', label: 'Loans', title: 'Loans' },
  { key: 'messages', icon: 'C', label: 'Chats', title: 'Chats' },
  { key: 'profile', icon: 'P', label: 'Profile', title: 'Profile' },
];

const produce = [
  { crop: 'Tomatoes', meta: 'Kirinyaga - 30 crates', price: 'KES 4,200' },
  { crop: 'Maize', meta: 'Uasin Gishu - 12 bags', price: 'KES 3,150' },
  { crop: 'Avocados', meta: 'Muranga - 80 kg', price: 'KES 6,800' },
];

export default function App() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const currentTab = useMemo(
    () => tabs.find((tab) => tab.key === activeTab) ?? tabs[0],
    [activeTab],
  );

  if (!isSignedIn) {
    return <LoginScreen onSignIn={() => setIsSignedIn(true)} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.app}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>AgriLink X</Text>
            <Text style={styles.headerTitle}>{currentTab.title}</Text>
          </View>
          <Pressable style={styles.iconButton}>
            <Text style={styles.iconButtonText}>S</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'home' && <HomeScreen />}
          {activeTab === 'market' && <MarketScreen />}
          {activeTab === 'loans' && <LoansScreen />}
          {activeTab === 'messages' && <MessagesScreen />}
          {activeTab === 'profile' && <ProfileScreen onSignOut={() => setIsSignedIn(false)} />}
        </ScrollView>

        <View style={styles.tabBar}>
          {tabs.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabButton, isActive && styles.activeTabButton]}
              >
                <Text style={[styles.tabIcon, isActive && styles.activeTabText]}>
                  {tab.icon}
                </Text>
                <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

function LoginScreen({ onSignIn }: { onSignIn: () => void }) {
  return (
    <SafeAreaView style={styles.loginSafeArea}>
      <StatusBar style="light" />
      <View style={styles.loginScreen}>
        <View style={styles.loginTop}>
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>A</Text>
          </View>
          <Text style={styles.loginTitle}>AgriLink X</Text>
          <Text style={styles.loginSubtitle}>Farm trade, loans, and updates in one app.</Text>
        </View>

        <View style={styles.loginPanel}>
          <Text style={styles.formTitle}>Sign in</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email address"
            placeholderTextColor="#7a8276"
            style={styles.input}
          />
          <TextInput
            placeholder="Password"
            placeholderTextColor="#7a8276"
            secureTextEntry
            style={styles.input}
          />

          <Pressable onPress={onSignIn} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </Pressable>

          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Create account</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function HomeScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.heroPanel}>
        <Text style={styles.panelLabel}>Today</Text>
        <Text style={styles.bigNumber}>KES 128,400</Text>
        <Text style={styles.panelNote}>Farm income this month</Text>
      </View>

      <View style={styles.actionGrid}>
        <AppButton label="Sell produce" />
        <AppButton label="Request loan" variant="light" />
      </View>

      <SectionTitle title="Tasks" />
      <ListRow title="Confirm tomato pickup" detail="Today, 3:30 PM" />
      <ListRow title="Upload farm verification" detail="Required for loan review" />
      <ListRow title="Reply to GreenMart" detail="New buyer message" />
    </View>
  );
}

function MarketScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.actionGrid}>
        <AppButton label="Add product" />
        <AppButton label="My listings" variant="light" />
      </View>

      <SectionTitle title="Produce market" />
      {produce.map((item) => (
        <ListRow
          key={item.crop}
          title={item.crop}
          detail={item.meta}
          trailing={item.price}
        />
      ))}
    </View>
  );
}

function LoansScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.heroPanel}>
        <Text style={styles.panelLabel}>Eligible amount</Text>
        <Text style={styles.bigNumber}>KES 75,000</Text>
        <Text style={styles.panelNote}>Based on orders, profile, and verification</Text>
      </View>
      <AppButton label="Start application" />
      <SectionTitle title="Loan steps" />
      <ListRow title="Verify identity" detail="Ready" />
      <ListRow title="Choose offer" detail="Locked until verification is complete" />
      <ListRow title="Track decision" detail="Updates appear here" />
    </View>
  );
}

function MessagesScreen() {
  return (
    <View style={styles.screen}>
      <SectionTitle title="Inbox" />
      <ListRow title="GreenMart Procurement" detail="Can you deliver 20 crates tomorrow?" />
      <ListRow title="County Admin" detail="Verification review is in progress" />
      <ListRow title="AgriLink Support" detail="Loan document received" />
    </View>
  );
}

function ProfileScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <View style={styles.screen}>
      <View style={styles.profilePanel}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>A</Text>
        </View>
        <View>
          <Text style={styles.profileName}>AgriLink User</Text>
          <Text style={styles.mutedText}>Farmer Pro</Text>
        </View>
      </View>

      <SectionTitle title="Settings" />
      <ListRow title="Verification" detail="Pending review" />
      <ListRow title="County" detail="Not set" />
      <ListRow title="Payout method" detail="Add M-Pesa or bank details" />

      <Pressable onPress={onSignOut} style={styles.dangerButton}>
        <Text style={styles.dangerButtonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function AppButton({ label, variant = 'solid' }: { label: string; variant?: 'solid' | 'light' }) {
  const isLight = variant === 'light';

  return (
    <Pressable style={[styles.appButton, isLight && styles.lightButton]}>
      <Text style={[styles.appButtonText, isLight && styles.lightButtonText]}>{label}</Text>
    </Pressable>
  );
}

function ListRow({
  title,
  detail,
  trailing,
}: {
  title: string;
  detail: string;
  trailing?: string;
}) {
  return (
    <Pressable style={styles.listRow}>
      <View style={styles.rowMarker} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <Text style={styles.rowTrailing}>{trailing ?? '>'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f6f7f2',
  },
  app: {
    flex: 1,
    backgroundColor: '#f6f7f2',
  },
  loginSafeArea: {
    flex: 1,
    backgroundColor: '#183623',
  },
  loginScreen: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 22,
  },
  loginTop: {
    paddingTop: 38,
  },
  logoMark: {
    alignItems: 'center',
    backgroundColor: '#d9f0c8',
    borderRadius: 20,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  logoText: {
    color: '#24552f',
    fontSize: 26,
    fontWeight: '900',
  },
  loginTitle: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
    marginTop: 22,
  },
  loginSubtitle: {
    color: '#d9e7d8',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 8,
    maxWidth: 280,
  },
  loginPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    gap: 12,
    padding: 18,
  },
  formTitle: {
    color: '#162016',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 2,
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
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  brand: {
    color: '#2f6b3f',
    fontSize: 13,
    fontWeight: '800',
  },
  headerTitle: {
    color: '#162016',
    fontSize: 30,
    fontWeight: '900',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dfe5d8',
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  iconButtonText: {
    color: '#2f6b3f',
    fontSize: 22,
    fontWeight: '900',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 104,
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
    fontWeight: '800',
  },
  bigNumber: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
    marginTop: 8,
  },
  panelNote: {
    color: '#e8f1e7',
    fontSize: 14,
    marginTop: 7,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  appButton: {
    alignItems: 'center',
    backgroundColor: '#2f6b3f',
    borderRadius: 8,
    flex: 1,
    height: 52,
    justifyContent: 'center',
  },
  appButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  lightButton: {
    backgroundColor: '#e8f3df',
  },
  lightButtonText: {
    color: '#255833',
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
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#cfd8ca',
    borderRadius: 8,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#2f6b3f',
    fontSize: 16,
    fontWeight: '900',
  },
  sectionTitle: {
    color: '#162016',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 2,
  },
  listRow: {
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
  rowText: {
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
  rowTrailing: {
    color: '#2f6b3f',
    fontSize: 14,
    fontWeight: '900',
    marginLeft: 10,
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
  profileAvatar: {
    alignItems: 'center',
    backgroundColor: '#e8f3df',
    borderRadius: 30,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  profileAvatarText: {
    color: '#2f6b3f',
    fontSize: 24,
    fontWeight: '900',
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
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 12,
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
  activeTabButton: {
    backgroundColor: '#edf6e8',
  },
  tabIcon: {
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
  activeTabText: {
    color: '#2f6b3f',
  },
});
