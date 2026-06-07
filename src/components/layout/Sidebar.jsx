import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Car, CalendarDays, DollarSign,
  Wrench, ChevronLeft, ChevronRight, ChevronDown, BarChart3, X, Building2, Gift, Home, Wallet, Zap,
  Shield, MapPin, ClipboardList, Activity, MessageSquare, Star, Camera, ShieldAlert, Satellite, Settings, Network,
} from "lucide-react";
import { cn } from "@/lib/utils";
import TenantSwitcher from "@/components/layout/TenantSwitcher";
import { useTenant } from "@/lib/useTenant";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const LOGO_FULL = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/860834ab2_A3BAE4B8-976F-4BA4-B14F-141A770ED30E.jpg";
const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

const menuSections = [
  {
    label: "Accounts",
    icon: Users,
    items: [
      { label: "Customers", icon: Users, path: "/customers" },
      { label: "Hosts", icon: Home, path: "/admin/hosts", badgeKey: "pendingHosts" },
    ],
  },
  {
    label: "Fleet",
    icon: Car,
    items: [
      { label: "Vehicles", icon: Car, path: "/vehicles" },
      { label: "Maintenance", icon: Wrench, path: "/admin/maintenance" },
      { label: "Reports", icon: BarChart3, path: "/reports" },
    ],
  },
  {
    label: "Bookings",
    icon: CalendarDays,
    items: [
      { label: "Bookings", icon: CalendarDays, path: "/bookings-admin" },
    ],
  },
  {
    label: "Financial",
    icon: DollarSign,
    items: [
      { label: "Payments", icon: DollarSign, path: "/payments" },
      { label: "P&L Dashboard", icon: BarChart3, path: "/admin/pnl" },
      { label: "Host Payouts", icon: Wallet, path: "/admin/payouts" },
      { label: "Expenses", icon: DollarSign, path: "/admin/expenses" },
      { label: "Payment Alerts", icon: ShieldAlert, path: "/admin/payment-alerts" },
    ],
  },
  {
    label: "Operations",
    icon: Activity,
    items: [
      { label: "Operations Center", icon: Activity, path: "/admin/operations" },
      { label: "Compliance Queue", icon: ClipboardList, path: "/admin/compliance-queue" },
      { label: "Disputes", icon: Shield, path: "/admin/disputes" },
      { label: "Communications", icon: MessageSquare, path: "/admin/communications" },
    ],
  },
  {
    label: "Telematics",
    icon: Satellite,
    items: [
      { label: "GPS Monitor", icon: MapPin, path: "/admin/gps-monitor" },
      { label: "Vehicle Command Center", icon: Zap, path: "/admin/vehicle-command-center" },
      { label: "Telematics Setup", icon: Satellite, path: "/admin/telematics" },
      { label: "Command Verification", icon: Zap, path: "/admin/telematics-command-test" },
      { label: "Installer Portal", icon: Wrench, path: "/installer/telematics" },
      { label: "Telematics Operations", icon: Activity, path: "/admin/telematics-operations" },
      { label: "Telematics Rollout", icon: BarChart3, path: "/admin/telematics-rollout" },
      { label: "Network Readiness", icon: Satellite, path: "/admin/traccar-readiness" },
    ],
  },
  {
    label: "Trust & Quality",
    icon: Shield,
    items: [
      { label: "Reputation Validation", icon: Activity, path: "/admin/reputation-validation" },
      { label: "Review Moderation", icon: Star, path: "/admin/review-moderation" },
      { label: "Inspection Oversight", icon: Camera, path: "/admin/inspection-oversight" },
    ],
  },
  {
    label: "Network",
    icon: Network,
    items: [
      { label: "Dealer Network", icon: Car, path: "/admin/dealer-network" },
      { label: "Referrals", icon: Gift, path: "/referrals" },
    ],
  },
  {
    label: "Platform",
    icon: Settings,
    items: [
      { label: "Companies", icon: Building2, path: "/companies", superadminOnly: true },
      { label: "AI Oracle", icon: Zap, path: "/admin/ai-chat" },
    ],
  },
];

const quickLinks = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Book Now ↗", icon: Car, path: "/" },
];

// Internal-only tools — kept for direct URL access, removed from sidebar nav:
// /admin/expenses-preview        (duplicate preview route)
// /admin/maintenance-v2          (duplicate route)
// /admin/recurring-expenses-preview (duplicate preview route)
// /admin/payment-reconciliation-preview (duplicate preview route)
// /admin/payment-reconciliation  (internal reconciliation tool)
// /admin/financial-control-center (internal stabilization tool)
// /admin/remediation-workspace   (internal remediation tool)
// /customer-preview              (internal QA tool)
// /maintenance                   (legacy — superseded by /admin/maintenance)

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const location = useLocation();
  const { isSuperadmin } = useTenant();
  const { data: pendingHosts = [] } = useQuery({
    queryKey: ["sidebar-pending-hosts"],
    queryFn: () => base44.entities.Host.filter({ status: "pending" }),
    refetchInterval: 60_000,
  });
  const pendingHostCount = pendingHosts.filter(h => !h.admin_viewed).length;
  const visibleSections = menuSections
    .filter(section => !section.superadminOnly || isSuperadmin)
    .map(section => ({
      ...section,
      items: section.items.filter(item => !item.superadminOnly || isSuperadmin),
    }))
    .filter(section => section.items.length > 0);
  const collapsedItems = [...quickLinks.slice(0, 1), ...visibleSections.flatMap(section => section.items), quickLinks[1]];
  const [openSections, setOpenSections] = React.useState({});

  const isItemActive = (item) => location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path + "/"));

  const toggleSection = (label) => {
    setOpenSections(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const SidebarLink = ({ item, compact = false, special = false }) => {
    const isActive = isItemActive(item);
    const showBadge = item.badgeKey === "pendingHosts" && pendingHostCount > 0;

    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "group flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden",
          compact ? "px-3 py-2.5" : "px-3 py-2",
          special
            ? "text-pink-400/70 hover:text-pink-300 hover:bg-pink-500/[0.08]"
            : isActive
              ? "nav-active shadow-glow-sm"
              : "text-white/50 hover:text-white/90 hover:bg-white/[0.06]"
        )}
      >
        <item.icon className={cn("flex-shrink-0 relative z-10", isActive && !special ? "text-primary" : special ? "text-pink-400/60" : "text-white/40 group-hover:text-white/70")} style={{ height: '1.125rem', width: '1.125rem' }} />
        {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
        {showBadge && !collapsed && (
          <span className="ml-auto relative z-10 min-w-[20px] h-5 px-1.5 rounded-full bg-yellow-500 text-[10px] font-black text-black flex items-center justify-center">
            {pendingHostCount}
          </span>
        )}
        {showBadge && collapsed && <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-yellow-500" />}
        {isActive && !collapsed && !showBadge && !special && <div className="ml-auto relative z-10 h-1.5 w-1.5 rounded-full bg-primary" />}
      </Link>
    );
  };

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={cn(
        "fixed top-0 left-0 h-full z-50 flex flex-col transition-all duration-300 ease-in-out",
        "border-r border-white/[0.06]",
        "bg-[hsl(222,30%,8%)]",
        collapsed ? "w-[72px]" : "w-64",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Ambient glow top */}
        <div className="absolute top-0 left-0 right-0 h-48 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 50% -20%, hsl(338 90% 56% / 0.12) 0%, transparent 70%)" }} />

        {/* Logo */}
        <div className="relative h-[70px] flex items-center justify-between px-4 border-b border-white/[0.06]">
          {!collapsed ? (
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 rounded-xl bg-primary/30 blur-md" />
                <img src={LOGO_ICON} alt="uRide" className="relative h-9 w-9 rounded-xl object-cover ring-1 ring-primary/40" />
              </div>
              <span className="font-bold text-white text-xl tracking-tight" style={{ fontFamily: "var(--font-syne)" }}>uRide</span>
            </div>
          ) : (
            <div className="relative mx-auto">
              <div className="absolute inset-0 rounded-xl bg-primary/30 blur-md" />
              <img src={LOGO_ICON} alt="uRide" className="relative h-9 w-9 rounded-xl object-cover ring-1 ring-primary/40" />
            </div>
          )}
          <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tenant Switcher for superadmin */}
        <div className="pt-3">
          <TenantSwitcher collapsed={collapsed} />
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 px-3 space-y-1 overflow-y-auto">
          {!collapsed && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 px-3 mb-3">Main Menu</p>
          )}

          {collapsed ? (
            collapsedItems.map((item, index) => (
              <React.Fragment key={`${item.path}-${index}`}>
                {index === 1 && <div className="my-2 border-t border-white/[0.06]" />}
                {index === collapsedItems.length - 1 && <div className="my-2 border-t border-white/[0.06]" />}
                <SidebarLink item={item} compact special={index === collapsedItems.length - 1} />
              </React.Fragment>
            ))
          ) : (
            <>
              <SidebarLink item={quickLinks[0]} compact />
              <div className="my-2 border-t border-white/[0.06]" />

              {visibleSections.map((section) => {
                const sectionActive = section.items.some(isItemActive);
                const isOpen = openSections[section.label] ?? sectionActive;
                return (
                  <div key={section.label} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => toggleSection(section.label)}
                      className={cn(
                        "w-full group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
                        sectionActive ? "text-white bg-white/[0.06]" : "text-white/55 hover:text-white hover:bg-white/[0.04]"
                      )}
                    >
                      <section.icon className={cn("flex-shrink-0", sectionActive ? "text-primary" : "text-white/35 group-hover:text-white/70")} style={{ height: '1.125rem', width: '1.125rem' }} />
                      <span className="flex-1 text-left">{section.label}</span>
                      <ChevronDown className={cn("h-4 w-4 text-white/30 transition-transform", isOpen && "rotate-180")} />
                    </button>
                    {isOpen && (
                      <div className="ml-4 pl-3 border-l border-white/[0.06] space-y-1">
                        {section.items.map((item) => <SidebarLink key={item.path} item={item} />)}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="my-2 border-t border-white/[0.06]" />
              <SidebarLink item={quickLinks[1]} compact special />
            </>
          )}
        </nav>

        {/* Version tag */}
        {!collapsed && (
          <div className="px-4 pb-3">
            <div className="rounded-xl p-3 border border-white/[0.06] bg-white/[0.03]">
              <p className="text-[10px] text-white/30 text-center">uRide Fleet Management</p>
              <p className="text-[10px] text-primary/60 text-center mt-0.5">Production Operations</p>
            </div>
          </div>
        )}

        {/* Collapse toggle */}
        <div className="hidden lg:flex p-3 border-t border-white/[0.06]">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center p-2 rounded-xl hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </aside>
    </>
  );
}