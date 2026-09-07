import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BarChart3,
  Building2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Layers,
  LogOut,
  LucideIcon,
  MessageSquare,
  Package,
  Radar,
  ScanLine,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Sprout,
  Target,
  Truck,
  Users,
  Zap,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { NavLink } from "@/components/NavLink";
import BrandWordmark from "@/components/branding/BrandWordmark";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const mainNav = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Services Hub", url: "/dashboard/services", icon: Layers },
  { title: "Performance", url: "/dashboard/analytics", icon: BarChart3 },
];

const adminNav = [
  { title: "Overview", url: "/dashboard/admin", icon: ShieldCheck },
  { title: "Logistics", url: "/dashboard/logistics", icon: Truck },
  { title: "Loan Offers", url: "/dashboard/admin/loans", icon: CreditCard },
  { title: "Loan Decisions", url: "/dashboard/admin/loan-decisions", icon: ClipboardList },
  { title: "Risk & Credit", url: "/dashboard/admin/risk-credit", icon: ShieldCheck },
  { title: "Transactions", url: "/dashboard/admin/transactions", icon: ClipboardList },
  { title: "Disputes", url: "/dashboard/admin/disputes", icon: AlertTriangle },
  { title: "Company Review", url: "/dashboard/admin/companies", icon: Building2 },
  { title: "Verifications", url: "/dashboard/admin/verifications", icon: ShieldCheck },
  { title: "Feature Flags", url: "/dashboard/admin/feature-flags", icon: Zap },
  { title: "Audit Logs", url: "/dashboard/admin/audit-logs", icon: Radar },
  { title: "User Roles", url: "/dashboard/admin/users", icon: Users },
  { title: "Profile & Settings", url: "/dashboard/profile", icon: Settings2 },
];

const farmerNav = [
  { title: "My Farm", url: "/dashboard/farm", icon: Sprout },
  { title: "My Products", url: "/dashboard/products", icon: Package },
];

const companyNav = [
  { title: "Company Hub", url: "/dashboard/company", icon: Building2 },
  { title: "Services Hub", url: "/dashboard/services", icon: Layers },
  { title: "Products", url: "/dashboard/company/products", icon: Package },
  { title: "Partners", url: "/dashboard/company/partners", icon: Users },
  { title: "Orders", url: "/dashboard/company/orders", icon: ClipboardList },
  { title: "Procurement", url: "/dashboard/company/procurement", icon: ClipboardList },
  { title: "Marketplace", url: "/dashboard/marketplace", icon: ShoppingCart },
  { title: "Cart", url: "/dashboard/cart", icon: ShoppingCart },
  { title: "Marketplace Orders", url: "/dashboard/orders", icon: ClipboardList },
  { title: "Company Profile", url: "/dashboard/company/settings", icon: Settings2 },
  { title: "Risk & Credit", url: "/dashboard/risk-credit", icon: ShieldCheck },
  { title: "Messages", url: "/dashboard/messages", icon: MessageSquare },
];

const tradeNav = [
  { title: "Marketplace", url: "/dashboard/marketplace", icon: ShoppingCart },
  { title: "Cart", url: "/dashboard/cart", icon: ShoppingCart },
  { title: "Messages", url: "/dashboard/messages", icon: MessageSquare },
  { title: "Orders", url: "/dashboard/orders", icon: ClipboardList },
];

const transporterNav = [
  { title: "Dispatch Board", url: "/dashboard/logistics", icon: Truck },
];

const transporterSystemNav = [
  { title: "Notifications", url: "/dashboard/notifications", icon: Bell },
  { title: "Activity", url: "/dashboard/activity", icon: Radar },
  { title: "Profile & Settings", url: "/dashboard/profile", icon: Settings2 },
];

const systemNav = [
  { title: "Notifications", url: "/dashboard/notifications", icon: Bell },
  { title: "Activity", url: "/dashboard/activity", icon: Radar },
  { title: "Discover", url: "/dashboard/discover", icon: Users },
];

const intelligenceNav = [
  { title: "AI Scanner", url: "/dashboard/ai-scanner", icon: ScanLine, pro: true },
  { title: "Crop Calendar", url: "/dashboard/calendar", icon: Calendar },
  { title: "Deal Matches", url: "/dashboard/deal-matches", icon: Target },
  { title: "Community", url: "/dashboard/community", icon: Users },
];

type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  pro?: boolean;
};

function isProRole(role: string | null | undefined) {
  return role === "farmer_pro" || role === "company";
}

type NavChildItem = {
  title: string;
  url: string;
};

interface NavGroupProps {
  label: string;
  items: NavItem[];
  collapsed: boolean;
}

function navButtonClass(isActive: boolean) {
  return cn(
    "group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[14px] transition-all duration-200",
    isActive
      ? "bg-[linear-gradient(135deg,rgba(112,117,46,0.62),rgba(94,111,38,0.36))] font-semibold text-gold-400"
      : "text-sidebar-foreground/82 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
  );
}

function NavGroup({ label, items, collapsed }: NavGroupProps) {
  const location = useLocation();
  const { role } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      {!collapsed && (
        <SidebarGroupLabel className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/45">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu className="space-y-1">
          {items.map((item) => {
            const isActive =
              location.pathname === item.url ||
              (item.url === "/dashboard" && location.pathname === "/dashboard/free") ||
              (item.url === "/dashboard" && location.pathname === "/dashboard/pro") ||
              (item.url === "/dashboard" && location.pathname === "/dashboard/company") ||
              (item.url === "/dashboard/admin" && location.pathname.startsWith("/dashboard/admin"));

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild>
                  <NavLink
                    to={item.url}
                    end={item.url === "/dashboard"}
                    onClick={() => {
                      if (isMobile) {
                        setOpenMobile(false);
                      }
                    }}
                    className={navButtonClass(isActive)}
                    activeClassName=""
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.title}</span>}
                    {!collapsed && item.pro && !isProRole(role) && (
                      <span className="ml-auto rounded-full bg-gold-500/18 px-1.5 py-0.5 text-[10px] font-semibold text-gold-400">
                        PRO
                      </span>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

interface GrowthNavGroupProps {
  collapsed: boolean;
}

function GrowthNavGroup({ collapsed }: GrowthNavGroupProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();
  const showUpgradeLink = role === "farmer_free";
  const isMicroLoansRoute = location.pathname === "/dashboard/micro-loans";
  const [microLoansOpen, setMicroLoansOpen] = useState(isMicroLoansRoute);
  const microLoanChildren: NavChildItem[] = [
    { title: "Borrow Loan", url: "/dashboard/micro-loans?section=borrow" },
    { title: "Repay Loan", url: "/dashboard/micro-loans?section=repay" },
    { title: "Loan Status", url: "/dashboard/micro-loans?section=status" },
  ];

  useEffect(() => {
    if (isMicroLoansRoute) {
      setMicroLoansOpen(true);
    }
  }, [isMicroLoansRoute]);

  return (
    <SidebarGroup>
      {!collapsed && (
        <SidebarGroupLabel className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/45">
          Growth
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu className="space-y-1">
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isMicroLoansRoute}
              onClick={() => {
                setMicroLoansOpen(true);
                navigate("/dashboard/micro-loans");
                if (isMobile) {
                  setOpenMobile(false);
                }
              }}
              className={navButtonClass(isMicroLoansRoute)}
            >
              <CreditCard className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">Micro-Loans</span>}
              {!collapsed && !isProRole(role) && (
                <span className="ml-auto rounded-full bg-gold-500/18 px-1.5 py-0.5 text-[10px] font-semibold text-gold-400">
                  PRO
                </span>
              )}
            </SidebarMenuButton>
            {!collapsed && (
              <SidebarMenuAction
                onClick={() => setMicroLoansOpen((open) => !open)}
                aria-label={microLoansOpen ? "Collapse Micro-Loans menu" : "Expand Micro-Loans menu"}
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform", microLoansOpen && "rotate-180")} />
              </SidebarMenuAction>
            )}
            {microLoansOpen && (
              <SidebarMenuSub>
                {microLoanChildren.map((item) => {
                  const isActive = `${location.pathname}${location.search}` === item.url;

                  return (
                    <SidebarMenuSubItem key={item.title}>
                      <SidebarMenuSubButton asChild isActive={isActive}>
                        <NavLink
                          to={item.url}
                          onClick={() => {
                            if (isMobile) {
                              setOpenMobile(false);
                            }
                          }}
                          activeClassName=""
                        >
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  );
                })}
              </SidebarMenuSub>
            )}
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink
                to="/dashboard/risk-credit"
                onClick={() => {
                  if (isMobile) {
                    setOpenMobile(false);
                  }
                }}
                className={navButtonClass(location.pathname === "/dashboard/risk-credit")}
                activeClassName=""
              >
                <ShieldCheck className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">Risk & Credit</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {showUpgradeLink ? (
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <NavLink
                  to="/dashboard/upgrade"
                  onClick={() => {
                    if (isMobile) {
                      setOpenMobile(false);
                    }
                  }}
                  className={navButtonClass(location.pathname === "/dashboard/upgrade")}
                  activeClassName=""
                >
                  <Zap className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">Upgrade Plan</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut, profile, role, user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === "admin";
  const isCompany = role === "company";
  const isTransporter = role === "transporter";
  const profileHref = isCompany ? "/dashboard/company/settings" : "/dashboard/profile";
  const displayName =
    profile?.full_name ||
    (typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null) ||
    "User";

  const tierBadge =
    role === "company"
      ? { label: "Company", cls: "bg-sky-500/18 text-sky-200" }
      : role === "admin"
        ? { label: "Admin", cls: "bg-sidebar-accent/70 text-sidebar-foreground" }
        : role === "transporter"
          ? { label: "Transporter", cls: "bg-sky-500/18 text-sky-200" }
          : isProRole(role)
            ? { label: "Pro", cls: "bg-gold-500/18 text-gold-400" }
            : { label: "Free", cls: "bg-emerald-500/18 text-emerald-200" };

  const dashboardHomeHref =
    role === "admin"
      ? "/dashboard/admin"
      : role === "company"
        ? "/dashboard/company"
        : role === "transporter"
          ? "/dashboard/logistics"
          : "/dashboard";

  const roleAwareMainNav = mainNav.map((item) =>
    item.url === "/dashboard" ? { ...item, url: dashboardHomeHref } : item,
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/55 bg-sidebar">
      <SidebarHeader className="border-b border-sidebar-border/60 px-3 py-4">
        <div className="flex items-start gap-2.5">
          <Link to={dashboardHomeHref} className="flex min-w-0 flex-1 items-start gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[1rem] bg-emerald-500 text-primary-foreground shadow-[0_10px_24px_-12px_rgba(16,185,129,0.8)]">
              <span className="font-display text-base font-bold">A</span>
            </div>
            {!collapsed && (
              <div className="flex flex-col items-start min-w-0">
                <BrandWordmark className="truncate text-[1.2rem] text-sidebar-foreground" />
                <span className={cn("mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold", tierBadge.cls)}>
                  {tierBadge.label}
                </span>
              </div>
            )}
          </Link>

          {!collapsed && (
            <button
              type="button"
              onClick={toggleSidebar}
              className="mt-0.5 rounded-full p-1 text-sidebar-foreground/45 transition-colors hover:text-sidebar-foreground"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="space-y-4 px-2.5 py-4">
        {isAdmin ? (
          <>
            <NavGroup label="Administration" items={adminNav} collapsed={collapsed} />
            <NavGroup label="System" items={systemNav} collapsed={collapsed} />
          </>
        ) : isCompany ? (
          <>
            <NavGroup label="Company Workspace" items={companyNav} collapsed={collapsed} />
            <NavGroup label="Insights" items={[{ title: "Performance", url: "/dashboard/analytics", icon: BarChart3 }]} collapsed={collapsed} />
            <NavGroup label="System" items={systemNav} collapsed={collapsed} />
          </>
        ) : isTransporter ? (
          <>
            <NavGroup label="Logistics" items={transporterNav} collapsed={collapsed} />
            <NavGroup label="System" items={transporterSystemNav} collapsed={collapsed} />
          </>
        ) : (
          <>
            <NavGroup label="Command Center" items={roleAwareMainNav} collapsed={collapsed} />
            <NavGroup label="Farm Operations" items={farmerNav} collapsed={collapsed} />
            <NavGroup label="Trade" items={tradeNav} collapsed={collapsed} />
            <NavGroup label="Intelligence" items={intelligenceNav} collapsed={collapsed} />
            <NavGroup label="System" items={systemNav} collapsed={collapsed} />
            <GrowthNavGroup collapsed={collapsed} />
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/60 p-3">
        {!collapsed && (
          <Link to={profileHref} className="mb-3 flex items-center gap-2.5">
            {profile?.photo_url ? (
              <img
                src={profile.photo_url}
                alt={displayName}
                className="h-9 w-9 rounded-[1rem] border border-sidebar-border/70 object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-[1rem] bg-sidebar-accent/90 text-sm font-bold text-sidebar-foreground">
                {(displayName[0] || "U").toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-sidebar-foreground">{displayName}</p>
              <p className="truncate text-xs text-sidebar-foreground/55">{profile?.county || "Kenya"}</p>
            </div>
          </Link>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start rounded-xl px-2.5 py-2 text-sidebar-foreground/82 hover:bg-red-500/10 hover:text-red-500 transition-colors"
          onClick={async () => {
            await signOut();
            navigate("/");
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && "Sign Out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
