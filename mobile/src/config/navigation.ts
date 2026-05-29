export type AppRole = 'farmer_free' | 'farmer_pro' | 'company' | 'admin';

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
  { key: 'performance', title: 'Performance', section: 'Command Center', endpoint: '/admin/analytics', roles: ['admin'] },
  { key: 'farm', title: 'My Farm', section: 'Farm Operations', endpoint: '/profiles/me', roles: ['farmer_free', 'farmer_pro', 'admin'] },
  { key: 'products', title: 'My Products', section: 'Farm Operations', endpoint: '/products/mine', roles: ['farmer_free', 'farmer_pro', 'admin'] },
  { key: 'marketplace', title: 'Marketplace', section: 'Trade', endpoint: '/products' },
  { key: 'cart', title: 'Cart', section: 'Trade', endpoint: '/cart' },
  { key: 'messages', title: 'Messages', section: 'Trade', endpoint: '/messages/conversations' },
  { key: 'orders', title: 'Orders', section: 'Trade', endpoint: '/orders/buying' },
  { key: 'notifications', title: 'Notifications', section: 'System', endpoint: '/notifications?limit=80' },
  { key: 'activity', title: 'Activity', section: 'System' },
  { key: 'discover', title: 'Discover', section: 'System', endpoint: '/farmer/procurement' },
  { key: 'scanner', title: 'AI Scanner', section: 'Intelligence', proOnly: true },
  { key: 'calendar', title: 'Crop Calendar', section: 'Intelligence', endpoint: '/crop-events' },
  { key: 'dealMatches', title: 'Deal Matches', section: 'Intelligence', endpoint: '/farmer/deal-matches', proOnly: true },
  { key: 'community', title: 'Community', section: 'Intelligence' },
  { key: 'microLoans', title: 'Micro-Loans', section: 'Growth', endpoint: '/micro-loans/applications', proOnly: true },
  { key: 'upgrade', title: 'Upgrade Plan', section: 'Growth', roles: ['farmer_free'] },
  { key: 'companyHub', title: 'Company Hub', section: 'Company', endpoint: '/companies/me', roles: ['company'] },
  { key: 'companyProducts', title: 'Products', section: 'Company', endpoint: '/companies/me/products', roles: ['company'] },
  { key: 'companyPartners', title: 'Partners', section: 'Company', endpoint: '/companies/me/partners', roles: ['company'] },
  { key: 'companyOrders', title: 'Orders', section: 'Company', endpoint: '/companies/me/orders', roles: ['company'] },
  { key: 'companyProcurement', title: 'Procurement', section: 'Company', endpoint: '/companies/me/procurement', roles: ['company'] },
  { key: 'companySettings', title: 'Company Profile', section: 'Company', endpoint: '/companies/me', roles: ['company'] },
  { key: 'adminOverview', title: 'Overview', section: 'Admin', endpoint: '/admin/overview', roles: ['admin'] },
  { key: 'adminLoans', title: 'Loan Offers', section: 'Admin', endpoint: '/admin/loan-offers', roles: ['admin'] },
  { key: 'adminLoanDecisions', title: 'Loan Decisions', section: 'Admin', endpoint: '/admin/loans', roles: ['admin'] },
  { key: 'adminTransactions', title: 'Transactions', section: 'Admin', endpoint: '/admin/orders', roles: ['admin'] },
  { key: 'adminDisputes', title: 'Disputes', section: 'Admin', endpoint: '/admin/orders', roles: ['admin'] },
  { key: 'adminCompanies', title: 'Company Review', section: 'Admin', endpoint: '/admin/companies?status=all', roles: ['admin'] },
  { key: 'adminVerifications', title: 'Verifications', section: 'Admin', endpoint: '/admin/verifications', roles: ['admin'] },
  { key: 'adminFeatureFlags', title: 'Feature Flags', section: 'Admin', endpoint: '/admin/feature-flags', roles: ['admin'] },
  { key: 'adminAuditLogs', title: 'Audit Logs', section: 'Admin', endpoint: '/admin/audit-logs', roles: ['admin'] },
  { key: 'adminUsers', title: 'User Roles', section: 'Admin', endpoint: '/admin/users', roles: ['admin'] },
  { key: 'profile', title: 'Profile & Settings', section: 'Account', endpoint: '/profiles/me' },
];

export function isProRole(role: AppRole | null) {
  return role === 'farmer_pro' || role === 'company' || role === 'admin';
}

export function getVisibleRoutes(role: AppRole | null) {
  const resolvedRole = role ?? 'farmer_free';

  return mobileRoutes.filter((route) => {
    if (route.roles && !route.roles.includes(resolvedRole)) return false;
    if (route.proOnly && !isProRole(resolvedRole)) return false;
    return true;
  });
}
