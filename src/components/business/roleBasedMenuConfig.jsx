import {
  LayoutDashboard, Users, Car, CalendarDays, DollarSign,
  Wrench, BarChart3, Building2, Gift, Home, Wallet, Zap,
  Shield, MapPin, ClipboardList, Activity, MessageSquare, Star, Camera,
  ShieldAlert, Satellite, Settings, Network, ArrowRightLeft, CreditCard, Bell,
} from "lucide-react";

export const BUSINESS_PORTAL_ROLES = {
  ADMIN: "admin",
  HOST: "host",
};

export const masterQuickLinks = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    paths: {
      admin: "/dashboard",
      host: "/host/dashboard",
    },
    roles: ["admin", "host"],
  },
  {
    id: "book-now",
    label: "Book Now ↗",
    icon: Car,
    paths: {
      admin: "/",
    },
    roles: ["admin"],
    special: true,
  },
];

export const masterMenuSections = [
  // ── ADMIN COMMAND CENTERS ──────────────────────────────────────────────────
  {
    label: "Command Centers",
    icon: LayoutDashboard,
    items: [
      { id: "operations-center", label: "Operations Center", icon: Activity, paths: { admin: "/admin/operations-center" }, roles: ["admin"] },
      { id: "financial-center", label: "Financial Center", icon: DollarSign, paths: { admin: "/admin/financial-center" }, roles: ["admin"] },
      { id: "subscription-center", label: "Subscription Center", icon: CreditCard, paths: { admin: "/admin/subscription-center" }, roles: ["admin"] },
      { id: "telematics-center", label: "Telematics Center", icon: Satellite, paths: { admin: "/admin/telematics-center" }, roles: ["admin"] },
      { id: "compliance-center", label: "Compliance Center", icon: Shield, paths: { admin: "/admin/compliance-center" }, roles: ["admin"] },
    ],
  },
  {
    label: "360 Views",
    icon: BarChart3,
    items: [
      { id: "customer-360", label: "Customer 360", icon: Users, paths: { admin: "/admin/customer-360" }, roles: ["admin"] },
      { id: "booking-360", label: "Booking 360", icon: CalendarDays, paths: { admin: "/admin/booking-360" }, roles: ["admin"] },
      { id: "host-360", label: "Host 360", icon: Home, paths: { admin: "/admin/host-360" }, roles: ["admin"] },
      { id: "vehicle-360", label: "Vehicle 360", icon: Car, paths: { admin: "/admin/vehicle-360" }, roles: ["admin"] },
    ],
  },
  {
    label: "Smart Centers",
    icon: Wrench,
    items: [
      { id: "expense-center", label: "Expense Center", icon: DollarSign, paths: { admin: "/admin/expense-center" }, roles: ["admin"] },
      { id: "maintenance-center", label: "Maintenance Center", icon: Wrench, paths: { admin: "/admin/maintenance-center" }, roles: ["admin"] },
    ],
  },
  // ── HOST COMMAND CENTERS ───────────────────────────────────────────────────
  {
    label: "Command Center",
    icon: LayoutDashboard,
    items: [
      { id: "host-operations-center", label: "Operations Center", icon: Activity, paths: { host: "/host/operations-center" }, roles: ["host"] },
      { id: "host-financial-center", label: "Financial Center", icon: DollarSign, paths: { host: "/host/financial-center" }, roles: ["host"] },
      { id: "host-subscriptions", label: "Subscriptions", icon: CreditCard, paths: { host: "/host/subscriptions" }, roles: ["host"] },
      { id: "host-notifications", label: "Notifications", icon: Bell, paths: { host: "/host/notifications" }, roles: ["host"], badgeKey: "unreadNotifications" },
      { id: "host-telematics-center", label: "Telematics Center", icon: Satellite, paths: { host: "/host/telematics-center" }, roles: ["host"] },
      { id: "host-compliance-center", label: "Compliance Center", icon: Shield, paths: { host: "/host/compliance-center" }, roles: ["host"] },
    ],
  },
  {
    label: "360 Views",
    icon: BarChart3,
    items: [
      { id: "host-customer-360", label: "Customer 360", icon: Users, paths: { host: "/host/customer-360" }, roles: ["host"] },
      { id: "host-booking-360", label: "Booking 360", icon: CalendarDays, paths: { host: "/host/booking-360" }, roles: ["host"] },
      { id: "host-vehicle-360", label: "Vehicle 360", icon: Car, paths: { host: "/host/vehicle-360" }, roles: ["host"] },
      { id: "host-host-360", label: "My Business 360", icon: Home, paths: { host: "/host/host-360" }, roles: ["host"] },
    ],
  },
  {
    label: "Smart Centers",
    icon: Wrench,
    items: [
      { id: "host-expense-center", label: "Expense Center", icon: DollarSign, paths: { host: "/host/expense-center" }, roles: ["host"] },
      { id: "host-maintenance-center", label: "Maintenance Center", icon: Wrench, paths: { host: "/host/maintenance-center" }, roles: ["host"] },
    ],
  },
  // ── ADMIN ACCOUNTS ─────────────────────────────────────────────────────────
  {
    label: "Accounts",
    icon: Users,
    items: [
      { id: "customers", label: "Customers", icon: Users, paths: { admin: "/customers", host: "/host/customers" }, roles: ["admin", "host"] },
      { id: "hosts", label: "Hosts", icon: Home, paths: { admin: "/admin/hosts" }, roles: ["admin"], badgeKey: "pendingHosts" },
      { id: "vehicles", label: "Vehicles", icon: Car, paths: { admin: "/vehicles", host: "/host/vehicles" }, roles: ["admin", "host"] },
      { id: "bookings", label: "Bookings", icon: CalendarDays, paths: { admin: "/bookings-admin" }, roles: ["admin"] },
    ],
  },
  // ── HOST-ONLY SECTIONS ─────────────────────────────────────────────────────
  {
    label: "Fleet",
    icon: Car,
    items: [
      { id: "maintenance", label: "Maintenance", icon: Wrench, paths: { host: "/host/maintenance" }, roles: ["host"] },
      { id: "reports", label: "Reports", icon: BarChart3, paths: { host: "/host/reports" }, roles: ["host"] },
    ],
  },
  {
    label: "Bookings",
    icon: CalendarDays,
    items: [
      { id: "rto-contracts", label: "RTO Contracts", icon: Shield, paths: { host: "/host/rto" }, roles: ["host"] },
    ],
  },
  {
    label: "Financial",
    icon: DollarSign,
    items: [
      { id: "payments", label: "Payments", icon: DollarSign, paths: { host: "/host/payments" }, roles: ["host"] },
      { id: "pnl", label: "P&L Dashboard", icon: BarChart3, paths: { host: "/host/pnl" }, roles: ["host"] },
      { id: "payouts", label: "Payouts", icon: Wallet, paths: { host: "/host/payouts" }, roles: ["host"] },
      { id: "expenses", label: "Expenses", icon: DollarSign, paths: { host: "/host/expenses" }, roles: ["host"] },
      { id: "payment-alerts", label: "Payment Alerts", icon: ShieldAlert, paths: { host: "/host/payment-alerts" }, roles: ["host"] },
    ],
  },
  {
    label: "Operations",
    icon: Activity,
    items: [
      { id: "compliance-queue", label: "Compliance", icon: ClipboardList, paths: { host: "/host/compliance" }, roles: ["host"] },
      { id: "disputes", label: "Disputes", icon: Shield, paths: { admin: "/admin/disputes" }, roles: ["admin"] },
      { id: "communications", label: "Communications", icon: MessageSquare, paths: { admin: "/admin/communications", host: "/host/communications" }, roles: ["admin", "host"] },
      { id: "return-reviews", label: "Return Reviews", icon: ClipboardList, paths: { host: "/host/return-reviews" }, roles: ["host"] },
      { id: "verification-tax", label: "Verification & Tax", icon: Shield, paths: { host: "/host/verification" }, roles: ["host"] },
    ],
  },
  {
    label: "Telematics",
    icon: Satellite,
    items: [
      { id: "gps-store", label: "GPS Store", icon: Shield, paths: { admin: "/admin/gps-store", host: "/host/gps-store" }, roles: ["admin", "host"] },
      { id: "gps-monitor", label: "GPS / Telematics", icon: MapPin, paths: { host: "/host/telematics" }, roles: ["host"] },
      { id: "vehicle-command", label: "Vehicle Command Center", icon: Zap, paths: { admin: "/admin/vehicle-command-center", host: "/host/vehicle-command-center" }, roles: ["admin", "host"] },
      { id: "telematics-setup", label: "Telematics Setup", icon: Satellite, paths: { admin: "/admin/telematics" }, roles: ["admin"] },
      { id: "command-verification", label: "Command Verification", icon: Zap, paths: { admin: "/admin/telematics-command-test", host: "/host/telematics-command-test" }, roles: ["admin", "host"] },
      { id: "telematics-reconciliation", label: "Device Reconciliation", icon: Activity, paths: { admin: "/admin/telematics-reconciliation" }, roles: ["admin"] },
      { id: "installer-portal", label: "Installer Portal", icon: Wrench, paths: { admin: "/installer/telematics" }, roles: ["admin"] },
    ],
  },
  {
    label: "Trust & Quality",
    icon: Shield,
    items: [
      { id: "reputation-validation", label: "Reputation Validation", icon: Activity, paths: { admin: "/admin/reputation-validation" }, roles: ["admin"] },
      { id: "review-moderation", label: "Review Moderation", icon: Star, paths: { admin: "/admin/review-moderation" }, roles: ["admin"] },
      { id: "inspection-oversight", label: "Inspection Oversight", icon: Camera, paths: { admin: "/admin/inspection-oversight" }, roles: ["admin"] },
    ],
  },
  {
    label: "Network",
    icon: Network,
    items: [
      { id: "dealer-network", label: "Dealer Network (Legacy)", icon: Car, paths: { admin: "/admin/dealer-network" }, roles: ["admin"] },
      { id: "dealer360", label: "Dealer360", icon: ArrowRightLeft, paths: { admin: "/admin/dealer360", host: "/host/dealer360" }, roles: ["admin", "host"] },
      { id: "referrals", label: "Referrals", icon: Gift, paths: { admin: "/referrals" }, roles: ["admin"] },
      { id: "installers", label: "Installers", icon: Wrench, paths: { admin: "/admin/installers" }, roles: ["admin"] },
    ],
  },
  {
    label: "Platform",
    icon: Settings,
    items: [
      { id: "companies", label: "Companies", icon: Building2, paths: { admin: "/companies" }, roles: ["admin"], superadminOnly: true },
      { id: "notification-center", label: "Notification Center", icon: Bell, paths: { admin: "/admin/notification-center" }, roles: ["admin"] },
      { id: "notification-preferences", label: "Notification Preferences", icon: Bell, paths: { admin: "/admin/notification-preferences" }, roles: ["admin"] },
      { id: "ai-oracle", label: "AI Oracle", icon: Zap, paths: { admin: "/admin/ai-chat" }, roles: ["admin"] },
      { id: "brand-builder", label: "Brand Builder", icon: Settings, paths: { host: "/host/brand" }, roles: ["host"] },
      { id: "business-operations", label: "Business Operations", icon: Settings, paths: { host: "/host/business-operations" }, roles: ["host"] },
      { id: "host-ai", label: "AI Assistant", icon: MessageSquare, paths: { host: "/host/chat" }, roles: ["host"] },
    ],
  },
];

function materializeItem(item, role) {
  const path = item.paths?.[role];
  if (!path || !item.roles?.includes(role)) return null;
  return {
    ...item,
    label: role === "host" && item.hostLabel ? item.hostLabel : item.label,
    path,
  };
}

export function getBusinessPortalMenu({ role, isSuperadmin = false, showDealerNetwork = true }) {
  const quickLinks = masterQuickLinks
    .map((item) => materializeItem(item, role))
    .filter(Boolean)
    .filter((item) => !item.superadminOnly || isSuperadmin);

  const sections = masterMenuSections
    .map((section) => ({
      ...section,
      items: section.items
        .map((item) => materializeItem(item, role))
        .filter(Boolean)
        .filter((item) => !item.superadminOnly || isSuperadmin)
        .filter((item) => !item.requiresDealer || role === "admin" || showDealerNetwork),
    }))
    .filter((section) => section.items.length > 0);

  return { quickLinks, sections };
}