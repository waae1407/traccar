import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import SessionContinuityManager from '@/components/session/SessionContinuityManager';

// Layouts
import AppLayout from '@/components/layout/AppLayout';
import CustomerLayout from '@/components/customer/CustomerLayout';
import { AdminGuard, HostGuard, AdminOrInstallerGuard } from '@/components/layout/RoleGuard';

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
import AdminPnL from '@/pages/AdminPnL';
import AdminPayouts from '@/pages/admin/AdminPayouts';
import AdminExpenses from '@/pages/admin/AdminExpenses';
import AdminMaintenanceV2 from '@/pages/admin/AdminMaintenanceV2';
import AdminRecurringExpenses from '@/pages/admin/AdminRecurringExpenses';
import AdminPaymentReconciliationPreview from '@/pages/admin/AdminPaymentReconciliationPreview';
import AdminFinancialControlCenter from '@/pages/admin/AdminFinancialControlCenter';
import AdminRemediationWorkspace from '@/pages/admin/AdminRemediationWorkspace';
import AdminAIChat from '@/pages/admin/AdminAIChat';
import AdminAuditLog from '@/pages/admin/AdminAuditLog';
import AdminOperationalAlerts from '@/pages/admin/AdminOperationalAlerts';
import AdminDisputes from '@/pages/admin/AdminDisputes';
import AdminOperationsCenter from '@/pages/admin/AdminOperationsCenter';
import AdminGPSMonitor from '@/pages/admin/AdminGPSMonitor';
import AdminTelematicsCenter from '@/pages/admin/AdminTelematicsCenter.jsx';
import AdminTraccarReadiness from '@/pages/admin/AdminTraccarReadiness.jsx';
import AdminTelematicsOperationsCenter from '@/pages/admin/AdminTelematicsOperationsCenter.jsx';
import AdminTelematicsCommandTest from '@/pages/admin/AdminTelematicsCommandTest.jsx';
import VehicleCommandCenter from '@/pages/VehicleCommandCenter.jsx';
import CustomerMyVehicle from '@/pages/customer/MyVehicle.jsx';
import TelematicsRolloutDashboard from '@/pages/admin/TelematicsRolloutDashboard.jsx';
import AdminComplianceQueue from '@/pages/admin/AdminComplianceQueue';
import AdminCommunications from '@/pages/admin/AdminCommunications';
import AdminReputationValidation from '@/pages/admin/AdminReputationValidation.jsx';
import AdminReviewModeration from '@/pages/admin/AdminReviewModeration.jsx';
import AdminInspectionOversight from '@/pages/admin/AdminInspectionOversight.jsx';
import AdminDealerNetwork from '@/pages/admin/AdminDealerNetwork.jsx';
import PaymentOperationsAlertCenter from '@/pages/admin/PaymentOperationsAlertCenter.jsx';
import AdminInstallers from '@/pages/admin/AdminInstallers.jsx';
import Customer360 from '@/pages/admin/Customer360.jsx';
import Booking360 from '@/pages/admin/Booking360.jsx';
import Host360 from '@/pages/admin/Host360.jsx';
import Vehicle360 from '@/pages/admin/Vehicle360.jsx';
import FinancialCenter from '@/pages/admin/FinancialCenter.jsx';
import ExpenseCenter from '@/pages/admin/ExpenseCenter.jsx';
import MaintenanceCenter from '@/pages/admin/MaintenanceCenter.jsx';
import TelematicsCenter from '@/pages/admin/TelematicsCenter.jsx';
import ComplianceCenter from '@/pages/admin/ComplianceCenter.jsx';
import OperationsCenter from '@/pages/admin/OperationsCenter.jsx';
import HostCommunications from '@/pages/host/HostCommunications';
import CustomerCommunications from '@/pages/customer/CustomerCommunications';
import RenterAIChat from '@/pages/customer/RenterAIChat';

// Host pages
import HostLayout from '@/components/host/HostLayout';
import HostDashboard from '@/pages/host/HostDashboard';
import HostVehicles from '@/pages/host/HostVehicles';
import HostPayouts from '@/pages/host/HostPayouts';
import HostPayments from '@/pages/host/HostPayments';
import HostCompliance from '@/pages/host/HostCompliance';
import HostRTO from '@/pages/host/HostRTO';
import HostFleetInsights from '@/pages/host/HostFleetInsights';
import HostAVReadiness from '@/pages/host/HostAVReadiness';
import HostAIChat from '@/pages/host/HostAIChat';
import HostBrandBuilder from '@/pages/host/HostBrandBuilder';
import HostCRM from '@/pages/host/HostCRM';
import HostExpenses from '@/pages/host/HostExpenses';
import HostMaintenance from '@/pages/host/HostMaintenance';
import HostReports from '@/pages/host/HostReports';
import HostPnL from '@/pages/host/HostPnL';
import HostVerificationDocs from '@/pages/host/HostVerificationDocs';
import HostPaymentHistory from '@/pages/host/HostPaymentHistory';
import HostReturnReviews from '@/pages/host/HostReturnReviews.jsx';
import HostDealerNetwork from '@/pages/host/HostDealerNetwork.jsx';
import HostCustomer360 from '@/pages/host/HostCustomer360.jsx';
import HostBooking360 from '@/pages/host/HostBooking360.jsx';
import HostVehicle360 from '@/pages/host/HostVehicle360.jsx';
import HostMyBusiness360 from '@/pages/host/HostMyBusiness360.jsx';
import HostFinancialCenter from '@/pages/host/HostFinancialCenter.jsx';
import HostOperationsCenter from '@/pages/host/HostOperationsCenter.jsx';
import HostComplianceCenter from '@/pages/host/HostComplianceCenter.jsx';
import HostTelematicsCenter from '@/pages/host/HostTelematicsCenter.jsx';
import HostExpenseCenter from '@/pages/host/HostExpenseCenter.jsx';
import HostMaintenanceCenter from '@/pages/host/HostMaintenanceCenter.jsx';
import HostDealer360 from '@/pages/host/HostDealer360.jsx';
import GPSLanding from '@/pages/GPSLanding.jsx';
import GPSCheckout from '@/pages/gps/GPSCheckout.jsx';
import GPSActivate from '@/pages/gps/GPSActivate.jsx';
import CustomerGPS from '@/pages/customer/CustomerGPS.jsx';
import HostGPSStore from '@/pages/host/HostGPSStore.jsx';
import AdminGPSStore from '@/pages/admin/AdminGPSStore.jsx';
import AdminDealer360 from '@/pages/admin/AdminDealer360.jsx';
import SubscriptionCommandCenter from '@/pages/admin/SubscriptionCommandCenter.jsx';
import AdminNotificationCenter from '@/pages/admin/AdminNotificationCenter.jsx';
import AdminNotificationPreferences from '@/pages/admin/AdminNotificationPreferences.jsx';
import AdminTelematicsReconciliation from '@/pages/admin/AdminTelematicsReconciliation.jsx';
import HostSubscriptions from '@/pages/host/HostSubscriptions.jsx';
import HostNotifications from '@/pages/host/HostNotifications.jsx';
import CustomerNotifications from '@/pages/customer/CustomerNotifications.jsx';
import CustomerSubscriptions from '@/pages/customer/CustomerSubscriptions.jsx';
import HostBusinessOperations from '@/pages/host/HostBusinessOperations.jsx';
import HostTelematicsDashboard from '@/pages/host/HostTelematicsDashboard.jsx';
import HostTelematicsCommandTest from '@/pages/host/HostTelematicsCommandTest.jsx';
import HostInstallers from '@/pages/host/HostInstallers.jsx';
import HostFirstVehicleSetup from '@/pages/host/HostFirstVehicleSetup.jsx';
import HostPaymentAlerts from '@/pages/host/HostPaymentAlerts.jsx';
import HostOnboardingSuccess from '@/pages/host/HostOnboardingSuccess.jsx';
import PublicHostStorefront from '@/pages/PublicHostStorefront';
import HostStorefrontLayout from '@/components/host/storefront/HostStorefrontLayout';
import CustomDomainGate from '@/components/host/storefront/CustomDomainGate';
import HostStorefrontHome from '@/pages/host/HostStorefrontHome';

// Public pages
import BecomeAHost from '@/pages/BecomeAHost';
import SmartOperatorQuestionnaire from '@/pages/SmartOperatorQuestionnaire.jsx';
import Marketplace from '@/pages/Marketplace';
import SwapMarketplace from '@/pages/SwapMarketplace';
import Installers from '@/pages/Installers.jsx';
import InstallerTelematicsPortal from '@/pages/InstallerTelematicsPortal.jsx';

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
      const publicPaths = ['/', '/privacy', '/terms', '/become-a-host', '/operator-questionnaire', '/marketplace', '/swap', '/installers', '/installer/telematics'];
      if (!publicPaths.includes(window.location.pathname)) {
        navigateToLogin(); return null;
      }
    }
  }

  const isAdmin = user?.role === "admin";

  return (
    <CustomDomainGate>
    <SessionContinuityManager />
    <Routes>
      {/* ── PUBLIC PAGES (no login required) ── */}
      <Route path="/" element={<PublicHome />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />

      {/* ── GPS PUBLIC PAGES ── */}
      <Route path="/gps" element={<GPSLanding />} />
      <Route path="/gps/checkout" element={<GPSCheckout />} />
      <Route path="/gps/activate" element={<GPSActivate />} />

      {/* ── PUBLIC PAGES (no login required, no layout) ── */}
      <Route path="/become-a-host" element={<BecomeAHost />} />
      <Route path="/operator-questionnaire" element={<SmartOperatorQuestionnaire />} />
      <Route path="/marketplace" element={<Marketplace />} />
      <Route path="/swap" element={<SwapMarketplace />} />
      <Route path="/installers" element={<Installers />} />

      {/* ── HOST ROUTES ── */}
      <Route element={<HostGuard><HostLayout /></HostGuard>}>
        <Route path="/host/dashboard" element={<HostDashboard />} />
        <Route path="/host/onboarding-success" element={<HostOnboardingSuccess />} />
        <Route path="/host/vehicles" element={<HostVehicles />} />
        <Route path="/host/vehicles/setup" element={<HostFirstVehicleSetup />} />
        <Route path="/host/payments" element={<HostPayments />} />
        <Route path="/host/payouts" element={<HostPayouts />} />
        <Route path="/host/compliance" element={<HostCompliance />} />
        <Route path="/host/rto" element={<HostRTO />} />
        <Route path="/host/fleet-insights" element={<HostFleetInsights />} />
        <Route path="/host/av-readiness" element={<HostAVReadiness />} />
        <Route path="/host/chat" element={<HostAIChat />} />
        <Route path="/host/brand" element={<HostBrandBuilder />} />
        <Route path="/host/customers" element={<HostCRM />} />
        <Route path="/host/expenses" element={<HostExpenses />} />
        <Route path="/host/maintenance" element={<HostMaintenance />} />
        <Route path="/host/reports" element={<HostReports />} />
        <Route path="/host/pnl" element={<HostPnL />} />
        <Route path="/host/verification" element={<HostVerificationDocs />} />
        <Route path="/host/payment-history" element={<HostPaymentHistory />} />
        <Route path="/host/return-reviews" element={<HostReturnReviews />} />
        <Route path="/host/communications" element={<HostCommunications />} />
        <Route path="/host/business-operations" element={<HostBusinessOperations />} />
        <Route path="/host/payment-alerts" element={<HostPaymentAlerts />} />
        <Route path="/host/dealer-network" element={<HostDealerNetwork />} />
        <Route path="/host/dealer360" element={<HostDealer360 />} />
        <Route path="/host/customer-360" element={<HostCustomer360 />} />
        <Route path="/host/booking-360" element={<HostBooking360 />} />
        <Route path="/host/vehicle-360" element={<HostVehicle360 />} />
        <Route path="/host/host-360" element={<HostMyBusiness360 />} />
        <Route path="/host/financial-center" element={<HostFinancialCenter />} />
        <Route path="/host/operations-center" element={<HostOperationsCenter />} />
        <Route path="/host/compliance-center" element={<HostComplianceCenter />} />
        <Route path="/host/telematics-center" element={<HostTelematicsCenter />} />
        <Route path="/host/expense-center" element={<HostExpenseCenter />} />
        <Route path="/host/maintenance-center" element={<HostMaintenanceCenter />} />
        <Route path="/host/telematics" element={<HostTelematicsDashboard />} />
        <Route path="/host/installers" element={<HostInstallers />} />
        <Route path="/host/vehicle-command-center" element={<VehicleCommandCenter mode="host" />} />
        <Route path="/host/telematics-command-test" element={<HostTelematicsCommandTest />} />
        <Route path="/host/gps-store" element={<HostGPSStore />} />
        <Route path="/host/subscriptions" element={<HostSubscriptions />} />
        <Route path="/host/notifications" element={<HostNotifications />} />
      </Route>

      {/* ── PUBLIC HOST STOREFRONTS — white-labeled customer app ── */}
      <Route path="/host/:businessSlug" element={<HostStorefrontLayout />}>
        <Route index element={<HostStorefrontHome />} />
        <Route path="bookings" element={<MyBookings />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="support" element={<RenterAIChat />} />
        <Route path="messages" element={<CustomerCommunications />} />
        <Route path="account" element={<AccountPage />} />
      </Route>


      {/* ── PUBLIC INSTALLER ROUTES ── */}
      <Route path="/installer/telematics" element={<InstallerTelematicsPortal />} />

      {/* ── CUSTOMER / PUBLIC ROUTES ── */}
      <Route element={<CustomerLayout />}>
        <Route path="/book-now" element={<BookNow />} />
        <Route path="/my-bookings" element={<MyBookings />} />
        <Route path="/customer/gps" element={<CustomerGPS />} />
        <Route path="/customer/subscriptions" element={<CustomerSubscriptions />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/support" element={<RenterAIChat />} />
        <Route path="/vehicle-command-center" element={<CustomerMyVehicle />} />
        <Route path="/messages" element={<CustomerCommunications />} />
        <Route path="/notifications" element={<CustomerNotifications />} />
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
        <Route path="/admin/expenses" element={<AdminExpenses />} />
        <Route path="/admin/expenses-preview" element={<AdminExpenses />} />
        <Route path="/admin/maintenance" element={<AdminMaintenanceV2 />} />
        <Route path="/admin/maintenance-v2" element={<AdminMaintenanceV2 />} />
        <Route path="/admin/recurring-expenses" element={<AdminRecurringExpenses />} />
        <Route path="/admin/recurring-expenses-preview" element={<AdminRecurringExpenses />} />
        <Route path="/admin/payment-reconciliation" element={<AdminPaymentReconciliationPreview />} />
        <Route path="/admin/payment-reconciliation-preview" element={<AdminPaymentReconciliationPreview />} />
        <Route path="/admin/financial-control-center" element={<AdminFinancialControlCenter />} />
        <Route path="/admin/remediation-workspace" element={<AdminRemediationWorkspace />} />
        <Route path="/admin/ai-chat" element={<AdminAIChat />} />
        <Route path="/admin/pnl" element={<AdminPnL />} />
        <Route path="/admin/audit-log" element={<AdminAuditLog />} />
        <Route path="/admin/disputes" element={<AdminDisputes />} />
        <Route path="/admin/operational-alerts" element={<AdminOperationalAlerts />} />
        <Route path="/admin/gps-monitor" element={<AdminGPSMonitor />} />
        <Route path="/admin/telematics" element={<AdminTelematicsCenter />} />
        <Route path="/admin/vehicle-command-center" element={<VehicleCommandCenter mode="admin" />} />
        <Route path="/admin/telematics-command-test" element={<AdminTelematicsCommandTest />} />
        <Route path="/admin/telematics-operations" element={<AdminTelematicsOperationsCenter />} />
        <Route path="/admin/telematics-rollout" element={<TelematicsRolloutDashboard />} />
        <Route path="/admin/traccar-readiness" element={<AdminTraccarReadiness />} />
        <Route path="/admin/operations" element={<AdminOperationsCenter />} />
        <Route path="/admin/compliance-queue" element={<AdminComplianceQueue />} />
        <Route path="/admin/communications" element={<AdminCommunications />} />
        <Route path="/admin/reputation-validation" element={<AdminReputationValidation />} />
        <Route path="/admin/review-moderation" element={<AdminReviewModeration />} />
        <Route path="/admin/inspection-oversight" element={<AdminInspectionOversight />} />
        <Route path="/admin/dealer-network" element={<AdminDealerNetwork />} />
        <Route path="/admin/payment-alerts" element={<PaymentOperationsAlertCenter />} />
        <Route path="/admin/installers" element={<AdminInstallers />} />
        <Route path="/admin/dealer360" element={<AdminDealer360 />} />
        <Route path="/admin/customer-360" element={<Customer360 />} />
        <Route path="/admin/booking-360" element={<Booking360 />} />
        <Route path="/admin/host-360" element={<Host360 />} />
        <Route path="/admin/vehicle-360" element={<Vehicle360 />} />
        <Route path="/admin/financial-center" element={<FinancialCenter />} />
        <Route path="/admin/expense-center" element={<ExpenseCenter />} />
        <Route path="/admin/maintenance-center" element={<MaintenanceCenter />} />
        <Route path="/admin/telematics-center" element={<TelematicsCenter />} />
        <Route path="/admin/compliance-center" element={<ComplianceCenter />} />
        <Route path="/admin/operations-center" element={<OperationsCenter />} />
        <Route path="/admin/gps-store" element={<AdminGPSStore />} />
        <Route path="/admin/subscription-center" element={<SubscriptionCommandCenter />} />
        <Route path="/admin/notification-center" element={<AdminNotificationCenter />} />
        <Route path="/admin/notification-preferences" element={<AdminNotificationPreferences />} />
        <Route path="/admin/telematics-reconciliation" element={<AdminTelematicsReconciliation />} />
      </Route>

      {/* Legacy /bookings redirect for admin */}
      <Route path="/bookings" element={isAdmin ? <Navigate to="/bookings-admin" replace /> : <Navigate to="/my-bookings" replace />} />

      {/* Legacy root redirect (backward compat) */}
      <Route path="/home" element={<Navigate to="/book-now" replace />} />

      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </CustomDomainGate>
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