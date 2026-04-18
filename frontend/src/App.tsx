import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

import Index from "./pages/Index";
import About from "./pages/About";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import CompanyOnboarding from "./pages/CompanyOnboarding";
import DashboardRedirect from "./pages/DashboardRedirect";
import DashboardHome from "./pages/dashboard/DashboardHome";
import FarmerFreeDashboard from "./pages/dashboard/FarmerFreeDashboard";
import FarmerProDashboard from "./pages/dashboard/FarmerProDashboard";
import PerformanceAnalytics from "./pages/dashboard/PerformanceAnalytics";
import MyFarm from "./pages/dashboard/MyFarm";
import MyProducts from "./pages/dashboard/MyProducts";
import Marketplace from "./pages/dashboard/Marketplace";
import Orders from "./pages/dashboard/Orders";
import AIScanner from "./pages/dashboard/AIScanner";
import CropCalendar from "./pages/dashboard/CropCalendar";
import Community from "./pages/dashboard/Community";
import Messages from "./pages/dashboard/Messages";
import MicroLoans from "./pages/dashboard/MicroLoans";
import UpgradePlan from "./pages/dashboard/UpgradePlan";
import ProfileRoute from "./pages/dashboard/ProfileRoute";
import FarmerProfile from "./pages/dashboard/FarmerProfile";
import AdminDashboard from "./pages/dashboard/AdminDashboard";
import CompanyDashboard from "./pages/dashboard/CompanyDashboard";
import CompanyPartners from "./pages/dashboard/CompanyPartners";
import CompanyOrders from "./pages/dashboard/CompanyOrders";
import CompanyProcurement from "./pages/dashboard/CompanyProcurement";
import CompanyProducts from "./pages/dashboard/CompanyProducts";
import CompanyProfileSettings from "./pages/dashboard/CompanyProfileSettings";
import NotificationsCenter from "./pages/dashboard/NotificationsCenter";
import ActivityTimeline from "./pages/dashboard/ActivityTimeline";
import DiscoveryHub from "./pages/dashboard/DiscoveryHub";
import AdminLoans from "./pages/dashboard/admin/AdminLoans";
import AdminLoanDecisions from "./pages/dashboard/admin/AdminLoanDecisions";
import AdminTransactions from "./pages/dashboard/admin/AdminTransactions";
import AdminUsers from "./pages/dashboard/admin/AdminUsers";
import AdminCompanyVerification from "./pages/dashboard/admin/AdminCompanyVerification";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();
const nonAdminRoles = ["farmer_free", "farmer_pro", "company"] as const;
const farmerRoles = ["farmer_free", "farmer_pro"] as const;

function LegacyEnterpriseRedirect() {
  const { role } = useAuth();

  if (role === "company") {
    return <Navigate to="/dashboard/company" replace />;
  }

  if (role === "farmer_pro") {
    return <Navigate to="/dashboard/pro" replace />;
  }

  return <Navigate to="/dashboard/free" replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/about" element={<About />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/company-register" element={<CompanyOnboarding />} />
            <Route path="/dashboard" element={<ProtectedRoute><DashboardRedirect /></ProtectedRoute>} />
            <Route path="/dashboard/admin" element={<ProtectedRoute allowedRoles={["admin"]}><AdminDashboard /></ProtectedRoute>} />
            <Route path="/dashboard/company" element={<ProtectedRoute allowedRoles={["company"]}><CompanyDashboard /></ProtectedRoute>} />
            <Route path="/dashboard/company/products" element={<ProtectedRoute allowedRoles={["company"]}><CompanyProducts /></ProtectedRoute>} />
            <Route path="/dashboard/company/partners" element={<ProtectedRoute allowedRoles={["company"]}><CompanyPartners /></ProtectedRoute>} />
            <Route path="/dashboard/company/orders" element={<ProtectedRoute allowedRoles={["company"]}><CompanyOrders /></ProtectedRoute>} />
            <Route path="/dashboard/company/procurement" element={<ProtectedRoute allowedRoles={["company"]}><CompanyProcurement /></ProtectedRoute>} />
            <Route path="/dashboard/company/settings" element={<ProtectedRoute allowedRoles={["company"]}><CompanyProfileSettings /></ProtectedRoute>} />
            <Route path="/dashboard/notifications" element={<ProtectedRoute><NotificationsCenter /></ProtectedRoute>} />
            <Route path="/dashboard/activity" element={<ProtectedRoute><ActivityTimeline /></ProtectedRoute>} />
            <Route path="/dashboard/discover" element={<ProtectedRoute><DiscoveryHub /></ProtectedRoute>} />
            <Route path="/dashboard/admin/loans" element={<ProtectedRoute allowedRoles={["admin"]}><AdminLoans /></ProtectedRoute>} />
            <Route path="/dashboard/admin/loan-decisions" element={<ProtectedRoute allowedRoles={["admin"]}><AdminLoanDecisions /></ProtectedRoute>} />
            <Route path="/dashboard/admin/transactions" element={<ProtectedRoute allowedRoles={["admin"]}><AdminTransactions /></ProtectedRoute>} />
            <Route path="/dashboard/admin/users" element={<ProtectedRoute allowedRoles={["admin"]}><AdminUsers /></ProtectedRoute>} />
            <Route path="/dashboard/admin/companies" element={<ProtectedRoute allowedRoles={["admin"]}><AdminCompanyVerification /></ProtectedRoute>} />
            <Route path="/dashboard/free" element={<ProtectedRoute allowedRoles={[...farmerRoles]}><DashboardHome /></ProtectedRoute>} />
            <Route path="/dashboard/pro" element={<ProtectedRoute allowedRoles={[...farmerRoles]}><DashboardHome /></ProtectedRoute>} />
            <Route path="/dashboard/enterprise" element={<ProtectedRoute allowedRoles={[...nonAdminRoles]}><LegacyEnterpriseRedirect /></ProtectedRoute>} />
            <Route path="/dashboard/preview/farmer-free" element={<ProtectedRoute><FarmerFreeDashboard /></ProtectedRoute>} />
            <Route path="/dashboard/preview/farmer-pro" element={<ProtectedRoute><FarmerProDashboard /></ProtectedRoute>} />
            <Route path="/dashboard/analytics" element={<ProtectedRoute allowedRoles={[...farmerRoles]}><PerformanceAnalytics /></ProtectedRoute>} />
            <Route path="/dashboard/farm" element={<ProtectedRoute allowedRoles={[...farmerRoles]}><MyFarm /></ProtectedRoute>} />
            <Route path="/dashboard/products" element={<ProtectedRoute allowedRoles={[...farmerRoles]}><MyProducts /></ProtectedRoute>} />
            <Route path="/dashboard/marketplace" element={<ProtectedRoute allowedRoles={[...nonAdminRoles]}><Marketplace /></ProtectedRoute>} />
            <Route path="/dashboard/orders" element={<ProtectedRoute allowedRoles={[...farmerRoles]}><Orders /></ProtectedRoute>} />
            <Route path="/dashboard/ai-scanner" element={<ProtectedRoute allowedRoles={[...farmerRoles]}><AIScanner /></ProtectedRoute>} />
            <Route path="/dashboard/calendar" element={<ProtectedRoute allowedRoles={[...farmerRoles]}><CropCalendar /></ProtectedRoute>} />
            <Route path="/dashboard/community" element={<ProtectedRoute allowedRoles={[...farmerRoles]}><Community /></ProtectedRoute>} />
            <Route path="/dashboard/messages" element={<ProtectedRoute allowedRoles={[...nonAdminRoles]}><Messages /></ProtectedRoute>} />
            <Route path="/dashboard/micro-loans" element={<ProtectedRoute allowedRoles={[...farmerRoles]}><MicroLoans /></ProtectedRoute>} />
            <Route path="/dashboard/upgrade" element={<ProtectedRoute allowedRoles={[...farmerRoles]}><UpgradePlan /></ProtectedRoute>} />
            <Route path="/dashboard/profile" element={<ProtectedRoute allowedRoles={[...nonAdminRoles]}><ProfileRoute /></ProtectedRoute>} />
            <Route path="/dashboard/farmers/:userId" element={<ProtectedRoute allowedRoles={[...nonAdminRoles]}><FarmerProfile /></ProtectedRoute>} />
            <Route path="/micro-loans-isolated" element={<MicroLoans />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
