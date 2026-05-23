import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Car, CalendarDays, DollarSign,
  FileKey, Wrench, ChevronLeft, ChevronRight, BarChart3, X, Building2, Gift, Home, Wallet, Zap,
  Shield, Bell, MapPin, ClipboardList, Activity, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import TenantSwitcher from "@/components/layout/TenantSwitcher";
import { useTenant } from "@/lib/useTenant";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const LOGO_FULL = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/860834ab2_A3BAE4B8-976F-4BA4-B14F-141A770ED30E.jpg";
const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Customers", icon: Users, path: "/customers" },
  { label: "Vehicles", icon: Car, path: "/vehicles" },
  { label: "Bookings", icon: CalendarDays, path: "/bookings-admin" },
  { label: "Payments", icon: DollarSign, path: "/payments" },
  { label: "Reports", icon: BarChart3, path: "/reports" },
  { label: "P&L Dashboard 💰", icon: BarChart3, path: "/admin/pnl" },
  { label: "Referrals 🎁", icon: Gift, path: "/referrals" },
  { label: "AI Oracle 🤖", icon: Zap, path: "/admin/ai-chat" },
  { label: "Book Now ↗", icon: Car, path: "/", divider: true },
];

const hostNavItems = [
  { label: "Hosts", icon: Home, path: "/admin/hosts" },
  { label: "Host Payouts", icon: Wallet, path: "/admin/payouts" },
];

const operationsNavItems = [
  { label: "Expenses", icon: DollarSign, path: "/admin/expenses" },
  { label: "Recurring Expenses", icon: DollarSign, path: "/admin/recurring-expenses" },
  { label: "Disputes", icon: Shield, path: "/admin/disputes" },
  { label: "Operational Alerts", icon: Bell, path: "/admin/operational-alerts" },
  { label: "GPS Monitor", icon: MapPin, path: "/admin/gps-monitor" },
  { label: "Compliance Queue", icon: ClipboardList, path: "/admin/compliance-queue" },
  { label: "Communications", icon: MessageSquare, path: "/admin/communications" },
  { label: "Operations Center", icon: Activity, path: "/admin/operations" },
];

const superadminNavItems = [
  { label: "Companies", icon: Building2, path: "/companies" },
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
        <nav className="flex-1 py-2 px-3 space-y-0.5 overflow-y-auto">
          {!collapsed && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 px-3 mb-3">Main Menu</p>
          )}
          {/* Host Management Section */}
          {!collapsed && <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/50 px-3 mb-2 mt-1">Hosts</p>}
          {hostNavItems.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
            const showBadge = item.path === "/admin/hosts" && pendingHostCount > 0;
            return (
              <Link key={item.path} to={item.path} onClick={() => setMobileOpen(false)}
                className={cn("group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden",
                  isActive ? "nav-active shadow-glow-sm" : "text-white/50 hover:text-white/90 hover:bg-white/[0.06]")}>
                <item.icon className={cn("flex-shrink-0 relative z-10", isActive ? "text-primary" : "text-white/40 group-hover:text-white/70")} style={{ height: '1.125rem', width: '1.125rem' }} />
                {!collapsed && <span className="relative z-10">{item.label}</span>}
                {showBadge && !collapsed && (
                  <span className="ml-auto relative z-10 min-w-[20px] h-5 px-1.5 rounded-full bg-yellow-500 text-[10px] font-black text-black flex items-center justify-center">
                    {pendingHostCount}
                  </span>
                )}
                {showBadge && collapsed && (
                  <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-yellow-500" />
                )}
                {isActive && !collapsed && !showBadge && <div className="ml-auto relative z-10 h-1.5 w-1.5 rounded-full bg-primary" />}
              </Link>
            );
          })}
          {!collapsed && <div className="my-2 border-t border-white/[0.06]" />}
          {!collapsed && <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/50 px-3 mb-2 mt-1">Operations</p>}
          {operationsNavItems.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
            return (
              <Link key={item.path} to={item.path} onClick={() => setMobileOpen(false)}
                className={cn("group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden",
                  isActive ? "nav-active shadow-glow-sm" : "text-white/50 hover:text-white/90 hover:bg-white/[0.06]")}>
                <item.icon className={cn("flex-shrink-0 relative z-10", isActive ? "text-primary" : "text-white/40 group-hover:text-white/70")} style={{ height: '1.125rem', width: '1.125rem' }} />
                {!collapsed && <span className="relative z-10">{item.label}</span>}
                {isActive && !collapsed && <div className="ml-auto relative z-10 h-1.5 w-1.5 rounded-full bg-primary" />}
              </Link>
            );
          })}
          {!collapsed && <div className="my-2 border-t border-white/[0.06]" />}
          {isSuperadmin && (
            <>
              {!collapsed && <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/50 px-3 mb-2 mt-3">Platform</p>}
              {superadminNavItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link key={item.path} to={item.path} onClick={() => setMobileOpen(false)}
                    className={cn("group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden",
                      isActive ? "nav-active shadow-glow-sm" : "text-white/50 hover:text-white/90 hover:bg-white/[0.06]")}>
                    <item.icon className={cn("flex-shrink-0 relative z-10", isActive ? "text-primary" : "text-white/40 group-hover:text-white/70")} style={{ height: '1.125rem', width: '1.125rem' }} />
                    {!collapsed && <span className="relative z-10">{item.label}</span>}
                  </Link>
                );
              })}
              {!collapsed && <div className="my-2 border-t border-white/[0.06]" />}
            </>
          )}
          {navItems.map((item) => {
            if (item.divider) return (
              <div key={item.path}>
                <div className="my-2 border-t border-white/[0.06]" />
                <Link to={item.path} onClick={() => setMobileOpen(false)}
                  className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-pink-400/70 hover:text-pink-300 hover:bg-pink-500/[0.08]">
                  <item.icon className="h-4 w-4 flex-shrink-0 text-pink-400/60" style={{ height: '1.125rem', width: '1.125rem' }} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </div>
            );
            const isActive = location.pathname === item.path ||
              (item.path !== "/" && item.path !== "/dashboard" && location.pathname.startsWith(item.path)) ||
              (item.path === "/dashboard" && location.pathname === "/dashboard");
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden",
                  isActive
                    ? "nav-active shadow-glow-sm"
                    : "text-white/50 hover:text-white/90 hover:bg-white/[0.06]"
                )}
              >
                {isActive && (
                  <div className="absolute inset-0 rounded-xl opacity-50"
                    style={{ background: "linear-gradient(135deg, hsl(338 90% 56% / 0.15) 0%, hsl(265 80% 62% / 0.08) 100%)" }} />
                )}
                <item.icon className={cn(
                  "h-4.5 w-4.5 flex-shrink-0 relative z-10",
                  isActive ? "text-primary drop-shadow-[0_0_8px_hsl(338_90%_56%/0.8)]" : "text-white/40 group-hover:text-white/70"
                )} style={{ height: '1.125rem', width: '1.125rem' }} />
                {!collapsed && (
                  <span className="relative z-10">{item.label}</span>
                )}
                {isActive && !collapsed && (
                  <div className="ml-auto relative z-10 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_hsl(338_90%_56%/0.8)]" />
                )}
              </Link>
            );
          })}
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