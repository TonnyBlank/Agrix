export type AppRole = 'farmer_free' | 'farmer_pro' | 'company' | 'admin' | 'platform_admin' | 'county_admin';

export type MobileRouteKey =
  | 'dashboard'
  | 'performance'
  | 'farm'
  | 'products'
  | 'marketplace'
  | 'cart'
  | 'messages'
  | 'orders'
  | 'notifications'
  | 'activity'
  | 'discover'
  | 'scanner'
  | 'calendar'
  | 'dealMatches'
  | 'community'
  | 'microLoans'
  | 'upgrade'
  | 'idVerification'
  | 'companyHub'
  | 'companyProducts'
  | 'companyPartners'
  | 'companyOrders'
  | 'companyProcurement'
  | 'companySettings'
  | 'adminOverview'
  | 'adminLoans'
  | 'adminLoanDecisions'
  | 'adminTransactions'
  | 'adminDisputes'
  | 'adminCompanies'
  | 'adminVerifications'
  | 'adminFeatureFlags'
  | 'adminAuditLogs'
  | 'adminUsers'
  | 'profile';

export type MobileRoute = {
  key: MobileRouteKey;
  title: string;
  section: string;
  roles?: AppRole[];
  proOnly?: boolean;
  endpoint?: string;
  responseKey?: string;
};

export const mobileRoutes: MobileRoute[] = [
  { key: 'dashboard', title: 'Dashboard', section: 'Command Center', endpoint: '/profiles/me' },
  { key: 'performance', title: 'Performance', section: 'Insights', endpoint: '/admin/analytics', roles: ['admin', 'platform_admin'] },
  { key: 'farm', title: 'My Farm', section: 'Farm Operations', endpoint: '/profiles/me', roles: ['farmer_free', 'farmer_pro'] },
  { key: 'products', title: 'My Products', section: 'Farm Operations', endpoint: '/products/mine', roles: ['farmer_free', 'farmer_pro'] },
  { key: 'marketplace', title: 'Marketplace', section: 'Trade', endpoint: '/products', roles: ['farmer_free', 'farmer_pro', 'company'] },
  { key: 'cart', title: 'Cart', section: 'Trade', endpoint: '/cart', roles: ['farmer_free', 'farmer_pro', 'company'] },
  { key: 'messages', title: 'Messages', section: 'Trade', endpoint: '/messages/conversations', roles: ['farmer_free', 'farmer_pro', 'company'] },
  { key: 'orders', title: 'Orders', section: 'Trade', endpoint: '/orders/buying', roles: ['farmer_free', 'farmer_pro', 'company'] },
  { key: 'notifications', title: 'Notifications', section: 'System', endpoint: '/notifications?limit=80' },
  { key: 'activity', title: 'Activity', section: 'System' },
  { key: 'discover', title: 'Discover', section: 'System', endpoint: '/farmer/procurement' },
  { key: 'scanner', title: 'AI Scanner', section: 'Intelligence', roles: ['farmer_free', 'farmer_pro'] },
  { key: 'calendar', title: 'Crop Calendar', section: 'Intelligence', endpoint: '/crop-events', roles: ['farmer_free', 'farmer_pro'] },
  { key: 'dealMatches', title: 'Deal Matches', section: 'Intelligence', endpoint: '/farmer/deal-matches', roles: ['farmer_pro'], proOnly: true },
  { key: 'community', title: 'Community', section: 'Intelligence', roles: ['farmer_free', 'farmer_pro'] },
  { key: 'microLoans', title: 'Micro-Loans', section: 'Growth', endpoint: '/micro-loans/applications', roles: ['farmer_free', 'farmer_pro'] },
  { key: 'upgrade', title: 'Upgrade Plan', section: 'Growth', roles: ['farmer_free'] },
  { key: 'idVerification', title: 'ID Verification', section: 'Account', endpoint: '/id-verification', roles: ['farmer_free', 'farmer_pro', 'company'] },
  { key: 'companyHub', title: 'Company Hub', section: 'Company', endpoint: '/companies/me', roles: ['company'] },
  { key: 'companyProducts', title: 'Company Products', section: 'Company', endpoint: '/companies/me/products', roles: ['company'] },
  { key: 'companyPartners', title: 'Partners', section: 'Company', endpoint: '/companies/me/partners', roles: ['company'] },
  { key: 'companyOrders', title: 'Orders', section: 'Company', endpoint: '/companies/me/orders', roles: ['company'] },
  { key: 'companyProcurement', title: 'Procurement', section: 'Company', endpoint: '/companies/me/procurement', roles: ['company'] },
  { key: 'companySettings', title: 'Company Profile', section: 'Company', endpoint: '/companies/me', roles: ['company'] },
  { key: 'adminOverview', title: 'Overview', section: 'Administration', endpoint: '/admin/overview', roles: ['admin', 'platform_admin', 'county_admin'] },
  { key: 'adminLoans', title: 'Loan Offers', section: 'Administration', endpoint: '/admin/loan-offers', roles: ['admin', 'platform_admin'] },
  { key: 'adminLoanDecisions', title: 'Loan Decisions', section: 'Administration', endpoint: '/admin/loans', roles: ['admin', 'platform_admin', 'county_admin'] },
  { key: 'adminTransactions', title: 'Transactions', section: 'Administration', endpoint: '/admin/orders', roles: ['admin', 'platform_admin', 'county_admin'] },
  { key: 'adminDisputes', title: 'Disputes', section: 'Administration', endpoint: '/admin/orders', roles: ['admin', 'platform_admin', 'county_admin'] },
  { key: 'adminCompanies', title: 'Company Review', section: 'Administration', endpoint: '/admin/companies?status=all', roles: ['admin', 'platform_admin', 'county_admin'] },
  { key: 'adminVerifications', title: 'Verifications', section: 'Administration', endpoint: '/admin/verifications', roles: ['admin', 'platform_admin', 'county_admin'] },
  { key: 'adminFeatureFlags', title: 'Feature Flags', section: 'Administration', endpoint: '/admin/feature-flags', roles: ['admin', 'platform_admin'] },
  { key: 'adminAuditLogs', title: 'Audit Logs', section: 'Administration', endpoint: '/admin/audit-logs', roles: ['admin', 'platform_admin'] },
  { key: 'adminUsers', title: 'User Roles', section: 'Administration', endpoint: '/admin/users', roles: ['admin', 'platform_admin'] },
  { key: 'profile', title: 'Profile & Settings', section: 'Account', endpoint: '/profiles/me' },
];


export function isProRole(role: AppRole | null) {
  return role === 'farmer_pro' || role === 'company' || isAdminRole(role);

}

export function isAdminRole(role: AppRole | null) {
  return role === 'admin' || role === 'platform_admin' || role === 'county_admin';
}

export function normalizeRole(role: AppRole | null) {
  return role === 'admin' ? 'platform_admin' : (role ?? 'farmer_free');
}

export function getVisibleRoutes(role: AppRole | null) {
  const resolvedRole = normalizeRole(role);

  return mobileRoutes.filter((route) => {
    if (route.roles && !route.roles.includes(resolvedRole)) return false;
    if (route.proOnly && !isProRole(resolvedRole)) return false;
    return true;
  });
}
