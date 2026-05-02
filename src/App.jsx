import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

// Layouts
import AppLayout from '@/components/layout/AppLayout';
import CustomerLayout from '@/components/customer/CustomerLayout';
import { AdminGuard } from '@/components/layout/RoleGuard';

// Public pages
import PublicHome from '@/pages/PublicHome.jsx';
import PrivacyPolicy from '@/pages/PrivacyPolicy.jsx';
import TermsOfService from '@/pages/TermsOfService.jsx';

// Customer-facing pages
import BookNow from '@/pages/BookNow.jsx';
import LandingPage from '@/pages/LandingPage';
import MyBookings from '@/pages/customer/MyBookings.jsx';
import ActivityPage from '@/pages/customer/ActivityPage';
import AccountPage from '@/pages/customer/AccountPage';
import CheckoutFlow from '@/pages/checkout/CheckoutFlow';

// Admin CRM pages
import Dashboard from '@/pages/Dashboard';
import Customers from '@/pages/Customers';
import Vehicles from '@/pages/Vehicles';
import Bookings from '@/pages/Bookings';
import Payments from '@/pages/Payments';
import RentToOwn from '@/pages/RentToOwn';
import MaintenancePage from '@/pages/MaintenancePage';
import Reports from '@/pages/Reports';
import CompanyManagement from '@/pages/CompanyManagement';
import CustomerPreview from '@/pages/CustomerPreview';
import Referrals from '@/pages/Referrals';
import AdminHosts from '@/pages/admin/AdminHosts';
import AdminPayouts from '@/pages/admin/AdminPayouts';

// Host pages
import HostLayout from '@/components/host/HostLayout';
import HostDashboard from '@/pages/host/HostDashboard';
import HostVehicles from '@/pages/host/HostVehicles';
import HostPayouts from '@/pages/host/HostPayouts';
import HostCompliance from '@/pages/host/HostCompliance';
import HostRTO from '@/pages/host/HostRTO';
import HostFleetInsights from '@/pages/host/HostFleetInsights';
import HostAVReadiness from '@/pages/host/HostAVReadiness';

// Public pages
import BecomeAHost from '@/pages/BecomeAHost';
import Marketplace from '@/pages/Marketplace';
import SwapMarketplace from '@/pages/SwapMarketplace';

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, user } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <img src={LOGO_ICON} alt="uRide" className="h-12 w-12 rounded-full animate-pulse" />
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (authError) {
    // user_not_registered means they logged in but aren't registered — show error
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    // auth_required means the PLATFORM requires login — respect that
    // But allow public pages through even without auth
    if (authError.type === 'auth_required') {
      const publicPaths = ['/', '/privacy', '/terms'];
      if (!publicPaths.includes(window.location.pathname)) {
        navigateToLogin(); return null;
      }
    }
  }

  const isAdmin = user?.role === "admin";

  return (
    <Routes>
      {/* ── PUBLIC PAGES (no login required) ── */}
      <Route path="/" element={<PublicHome />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />

      {/* ── PUBLIC PAGES (no login required, no layout) ── */}
      <Route path="/become-a-host" element={<BecomeAHost />} />
      <Route path="/marketplace" element={<Marketplace />} />
      <Route path="/swap" element={<SwapMarketplace />} />

      {/* ── HOST ROUTES ── */}
      <Route element={<HostLayout />}>
        <Route path="/host/dashboard" element={<HostDashboard />} />
        <Route path="/host/vehicles" element={<HostVehicles />} />
        <Route path="/host/payouts" element={<HostPayouts />} />
        <Route path="/host/compliance" element={<HostCompliance />} />
        <Route path="/host/rto" element={<HostRTO />} />
        <Route path="/host/fleet-insights" element={<HostFleetInsights />} />
        <Route path="/host/av-readiness" element={<HostAVReadiness />} />
      </Route>

      {/* ── CUSTOMER / PUBLIC ROUTES ── */}
      <Route element={<CustomerLayout />}>
        <Route path="/book-now" element={<BookNow />} />
        <Route path="/my-bookings" element={<MyBookings />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/account" element={<AccountPage />} />
      </Route>

      {/* ── CHECKOUT (standalone, no customer layout chrome) ── */}
      <Route path="/checkout" element={<CheckoutFlow />} />

      {/* ── ADMIN ROUTES (admin-only, uses dark CRM layout) ── */}
      <Route element={<AdminGuard><AppLayout /></AdminGuard>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/vehicles" element={<Vehicles />} />
        <Route path="/bookings-admin" element={<Bookings />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/rent-to-own" element={<RentToOwn />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/companies" element={<CompanyManagement />} />
        <Route path="/customer-preview" element={<CustomerPreview />} />
        <Route path="/referrals" element={<Referrals />} />
        <Route path="/admin/hosts" element={<AdminHosts />} />
        <Route path="/admin/payouts" element={<AdminPayouts />} />
      </Route>

      {/* Legacy /bookings redirect for admin */}
      <Route path="/bookings" element={isAdmin ? <Navigate to="/bookings-admin" replace /> : <Navigate to="/my-bookings" replace />} />

      {/* Legacy root redirect (backward compat) */}
      <Route path="/home" element={<Navigate to="/book-now" replace />} />

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            {/* Fully public — rendered before any auth check */}
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            {/* Everything else goes through auth */}
            <Route path="*" element={<AuthenticatedApp />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App