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

// Customer-facing pages
import BookNow from '@/pages/BookNow';
import LandingPage from '@/pages/LandingPage';
import MyBookings from '@/pages/customer/MyBookings';
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
    // But if the app is public (no auth requirement), guests just have user=null and can browse
    if (authError.type === 'auth_required') { navigateToLogin(); return null; }
  }

  const isAdmin = user?.role === "admin";

  return (
    <Routes>
      {/* ── AUTO-ROUTING LANDING PAGE ── */}
      <Route path="/" element={<LandingPage />} />

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
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App