import {
  LayoutDashboard, Users, Car, CalendarDays, DollarSign,
  Wrench, BarChart3, Building2, Gift, Home, Wallet, Zap,
  Shield, MapPin, ClipboardList, Activity, MessageSquare, Star, Camera,
  ShieldAlert, Satellite, Settings, Network, ArrowRightLeft, CreditCard, Bell, ShieldCheck,
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

// ═════════════════════════════════════════════════════════════════════════════
// HOST_MENU_LEGACY_V1 — Original host menu preserved for easy revert.
// To revert: replace the "HOST MENU v2" sections below with this block.
// ═════════════════════════════════════════════════════════════════════════════
// {
//   label: "Command Center", icon: LayoutDashboard, items: [
//     { id: "host-alert360", label: "Alert360", icon: ShieldAlert, paths: { host: "/host/alert360" }, roles: ["host"] },
//     { id: "host-operations-center", label: "Operations Center", icon: Activity, paths: { host: "/host/operations-center" }, roles: ["host"] },
//     { id: "host-financial-center", label: "Financial Center", icon: DollarSign, paths: { host: "/host/financial-center" }, roles: ["host"] },
//     { id: "host-subscriptions", label: "Subscriptions", icon: CreditCard, paths: { host: "/host/subscriptions" }, roles: ["host"] },
//     { id: "host-notifications", label: "Notifications", icon: Bell, paths: { host: "/host/notifications" }, roles: ["host"], badgeKey: "unreadNotifications" },
//     { id: "host-telematics-center", label: "Telematics Center", icon: Satellite, paths: { host: "/host/telematics-center" }, roles: ["host"] },
//     { id: "host-compliance-center", label: "Compliance Center", icon: Shield, paths: { host: "/host/compliance-center" }, roles: ["host"] },
//   ],
// },
// { label: "360 Views", icon: BarChart3, items: [
//   { id: "host-customer-360", label: "Customer 360", icon: Users, paths: { host: "/host/customer-360" }, roles: ["host"] },
//   { id: "host-booking-360", label: "Booking 360", icon: CalendarDays, paths: { host: "/host/booking-360" }, roles: ["host"] },
//   { id: "host-vehicle-360", label: "Vehicle 360", icon: Car, paths: { host: "/host/vehicle-360" }, roles: ["host"] },
//   { id: "host-host-360", label: "My Business 360", icon: Home, paths: { host: "/host/host-360" }, roles: ["host"] },
// ]},
// { label: "Smart Centers", icon: Wrench, items: [
//   { id: "host-expense-center", label: "Expense Center", icon: DollarSign, paths: { host: "/host/expense-center" }, roles: ["host"] },
//   { id: "host-maintenance-center", label: "Maintenance Center", icon: Wrench, paths: { host: "/host/maintenance-center" }, roles: ["host"] },
// ]},
// { label: "Fleet", icon: Car, items: [
//   { id: "maintenance", label: "Maintenance", icon: Wrench, paths: { host: "/host/maintenance" }, roles: ["host"] },
//   { id: "reports", label: "Reports", icon: BarChart3, paths: { host: "/host/reports" }, roles: ["host"] },
// ]},
// { label: "Bookings", icon: CalendarDays, items: [
//   { id: "rto-contracts", label: "RTO Contracts", icon: Shield, paths: { host: "/host/rto" }, roles: ["host"] },
// ]},
// { label: "Financial", icon: DollarSign, items: [
//   { id: "payments", label: "Payments", icon: DollarSign, paths: { host: "/host/payments" }, roles: ["host"] },
//   { id: "pnl", label: "P&L Dashboard", icon: BarChart3, paths: { host: "/host/pnl" }, roles: ["host"] },
//   { id: "payouts", label: "Payouts", icon: Wallet, paths: { host: "/host/payouts" }, roles: ["host"] },
//   { id: "expenses", label: "Expenses", icon: DollarSign, paths: { host: "/host/expenses" }, roles: ["host"] },
//   { id: "payment-alerts", label: "Payment Alerts", icon: ShieldAlert, paths: { host: "/host/payment-alerts" }, roles: ["host"] },
// ]},
// { label: "Operations", icon: Activity, items: [
//   { id: "compliance-queue", label: "Compliance", icon: ClipboardList, paths: { host: "/host/compliance" }, roles: ["host"] },
//   { id: "communications", label: "Communications", icon: MessageSquare, paths: { host: "/host/communications" }, roles: ["host"] },
//   { id: "return-reviews", label: "Return Reviews", icon: ClipboardList, paths: { host: "/host/return-reviews" }, roles: ["host"] },
//   { id: "verification-tax", label: "Verification & Tax", icon: Shield, paths: { host: "/host/verification" }, roles: ["host"] },
// ]},
// { label: "Telematics", icon: Satellite, items: [
//   { id: "gps-store", label: "GPS Store", icon: Shield, paths: { host: "/host/gps-store" }, roles: ["host"] },
//   { id: "gps-monitor", label: "GPS / Telematics", icon: MapPin, paths: { host: "/host/telematics" }, roles: ["host"] },
//   { id: "vehicle-command", label: "Vehicle Command Center", icon: Zap, paths: { host: "/host/vehicle-command-center" }, roles: ["host"] },
//   { id: "command-verification", label: "Command Verification", icon: Zap, paths: { host: "/host/telematics-command-test" }, roles: ["host"] },
// ]},
// { label: "Platform", icon: Settings, items: [
//   { id: "brand-builder", label: "Brand Builder", icon: Settings, paths: { host: "/host/brand" }, roles: ["host"] },
//   { id: "business-operations", label: "Business Operations", icon: Settings, paths: { host: "/host/business-operations" }, roles: ["host"] },
//   { id: "host-ai", label: "AI Assistant", icon: MessageSquare, paths: { host: "/host/chat" }, roles: ["host"] },
// ]},

export const masterMenuSections = [
  // ── ADMIN COMMAND CENTERS ──────────────────────────────────────────────────
  {
    label: "Command Centers",
    icon: LayoutDashboard,
    items: [
      { id: "alert360", label: "Alert360", icon: ShieldAlert, paths: { admin: "/admin/alert360" }, roles: ["admin"] },
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
      { id: "dealer360", label: "Dealer360", icon: ArrowRightLeft, paths: { admin: "/admin/dealer360" }, roles: ["admin"] },
      { id: "insurance360", label: "Insurance360", icon: ShieldCheck, paths: { admin: "/admin/insurance360" }, roles: ["admin"] },
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
  // ── ADMIN ACCOUNTS ─────────────────────────────────────────────────────────
  {
    label: "Accounts",
    icon: Users,
    items: [
      { id: "customers", label: "Customers", icon: Users, paths: { admin: "/customers" }, roles: ["admin"] },
      { id: "hosts", label: "Hosts", icon: Home, paths: { admin: "/admin/hosts" }, roles: ["admin"], badgeKey: "pendingHosts" },
      { id: "vehicles", label: "Vehicles", icon: Car, paths: { admin: "/vehicles" }, roles: ["admin"] },
      { id: "bookings", label: "Bookings", icon: CalendarDays, paths: { admin: "/bookings-admin" }, roles: ["admin"] },
    ],
  },
  // ── ADMIN OPERATIONS ────────────────────────────────────────────────────────
  {
    label: "Operations",
    icon: Activity,
    items: [
      { id: "disputes", label: "Disputes", icon: Shield, paths: { admin: "/admin/disputes" }, roles: ["admin"] },
      { id: "communications", label: "Communications", icon: MessageSquare, paths: { admin: "/admin/communications" }, roles: ["admin"] },
    ],
  },
  // ── ADMIN TELEMATICS ────────────────────────────────────────────────────────
  {
    label: "Telematics",
    icon: Satellite,
    items: [
      { id: "gps-store-admin", label: "GPS Store", icon: Shield, paths: { admin: "/admin/gps-store" }, roles: ["admin"] },
      { id: "vehicle-command-admin", label: "Vehicle Command Center", icon: Zap, paths: { admin: "/admin/vehicle-command-center" }, roles: ["admin"] },
      { id: "telematics-setup", label: "Telematics Setup", icon: Satellite, paths: { admin: "/admin/telematics" }, roles: ["admin"] },
      { id: "command-verification", label: "Command Verification", icon: Zap, paths: { admin: "/admin/telematics-command-test" }, roles: ["admin"] },
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
    ],
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // HOST MENU v2 (simplified) — plain-English labels, zero duplicates.
  // To revert: replace sections below with HOST_MENU_LEGACY_V1 (commented above).
  // ═══════════════════════════════════════════════════════════════════════════
  {
    label: "My Vehicles",
    icon: Car,
    items: [
      { id: "host-vehicles", label: "All Vehicles", icon: Car, paths: { host: "/host/vehicles" }, roles: ["host"] },
      { id: "host-gps", label: "GPS & Location", icon: MapPin, paths: { host: "/host/telematics" }, roles: ["host"] },
      { id: "host-vehicle-commands", label: "Vehicle Commands", icon: Zap, paths: { host: "/host/vehicle-command-center" }, roles: ["host"] },
      { id: "host-gps-store", label: "GPS Store", icon: Shield, paths: { host: "/host/gps-store" }, roles: ["host"] },
      { id: "host-maintenance", label: "Maintenance & Repairs", icon: Wrench, paths: { host: "/host/maintenance" }, roles: ["host"] },
    ],
  },
  {
    label: "Bookings",
    icon: CalendarDays,
    items: [
      { id: "host-booking-360", label: "Active Rentals", icon: CalendarDays, paths: { host: "/host/booking-360" }, roles: ["host"] },
      { id: "host-return-reviews", label: "Returns to Review", icon: ClipboardList, paths: { host: "/host/return-reviews" }, roles: ["host"] },
      { id: "host-rto", label: "RTO Contracts", icon: Shield, paths: { host: "/host/rto" }, roles: ["host"] },
      { id: "host-communications", label: "Customer Messages", icon: MessageSquare, paths: { host: "/host/communications" }, roles: ["host"] },
    ],
  },
  {
    label: "Money",
    icon: DollarSign,
    items: [
      { id: "host-payouts", label: "Earnings & Payouts", icon: Wallet, paths: { host: "/host/payouts" }, roles: ["host"] },
      { id: "host-expenses", label: "Expenses", icon: DollarSign, paths: { host: "/host/expenses" }, roles: ["host"] },
      { id: "host-payment-alerts", label: "Payment Alerts", icon: ShieldAlert, paths: { host: "/host/payment-alerts" }, roles: ["host"] },
      { id: "host-pnl", label: "P&L Dashboard", icon: BarChart3, paths: { host: "/host/pnl" }, roles: ["host"] },
      { id: "host-reports", label: "Reports", icon: BarChart3, paths: { host: "/host/reports" }, roles: ["host"] },
    ],
  },
  {
    label: "Customers",
    icon: Users,
    items: [
      { id: "host-customers", label: "Customer List", icon: Users, paths: { host: "/host/customers" }, roles: ["host"] },
      { id: "host-customer-360", label: "Customer Details", icon: Users, paths: { host: "/host/customer-360" }, roles: ["host"] },
    ],
  },
  {
    label: "Compliance",
    icon: Shield,
    items: [
      { id: "host-compliance", label: "Vehicle Compliance", icon: ClipboardList, paths: { host: "/host/compliance" }, roles: ["host"] },
      { id: "host-verification", label: "My Documents", icon: Shield, paths: { host: "/host/verification" }, roles: ["host"] },
      { id: "host-platform-agreement", label: "Platform Agreement", icon: ShieldCheck, paths: { host: "/host/platform-agreement" }, roles: ["host"] },
    ],
  },
  {
    label: "My Storefront",
    icon: Building2,
    items: [
      { id: "host-brand", label: "Brand & Storefront", icon: Settings, paths: { host: "/host/brand" }, roles: ["host"] },
      { id: "host-business-operations", label: "Business Settings", icon: Settings, paths: { host: "/host/business-operations" }, roles: ["host"] },
      { id: "host-subscriptions", label: "Subscriptions", icon: CreditCard, paths: { host: "/host/subscriptions" }, roles: ["host"] },
      { id: "host-dealer360", label: "Dealer Network", icon: ArrowRightLeft, paths: { host: "/host/dealer360" }, roles: ["host"] },
    ],
  },
  {
    label: "Alerts & Help",
    icon: Bell,
    items: [
      { id: "host-alert360", label: "All Alerts", icon: ShieldAlert, paths: { host: "/host/alert360" }, roles: ["host"] },
      { id: "host-notifications", label: "Notifications", icon: Bell, paths: { host: "/host/notifications" }, roles: ["host"], badgeKey: "unreadNotifications" },
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