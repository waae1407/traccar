import React, { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { LayoutDashboard, Car, DollarSign, Shield, FileKey, Zap, LogOut, Menu, X, MessageSquare, Sparkles, Users, Receipt, Wrench, BarChart2, CreditCard, ClipboardCheck, ShieldAlert, Satellite } from "lucide-react";
import { cn } from "@/lib/utils";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

const baseNavItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/host/dashboard" },
  { label: "My Vehicles", icon: Car, path: "/host/vehicles" },
  { label: "Telematics", icon: Satellite, path: "/host/telematics" },
  { label: "Command Verification", icon: Zap, path: "/host/telematics-command-test" },
  { label: "Brand Builder", icon: Sparkles, path: "/host/brand" },
  { label: "Customers", icon: Users, path: "/host/customers" },
  { label: "Payments", icon: CreditCard, path: "/host/payments" },
  { label: "Payment Alerts", icon: ShieldAlert, path: "/host/payment-alerts" },
  { label: "Communications", icon: MessageSquare, path: "/host/communications" },
  { label: "Return Reviews", icon: ClipboardCheck, path: "/host/return-reviews" },
  { label: "Payouts", icon: DollarSign, path: "/host/payouts" },
  { label: "Expenses", icon: Receipt, path: "/host/expenses" },
  { label: "Maintenance", icon: Wrench, path: "/host/maintenance" },
  { label: "P&L Dashboard 💰", icon: BarChart2, path: "/host/pnl" },
  { label: "Compliance", icon: Shield, path: "/host/compliance" },
  { label: "RTO Contracts", icon: FileKey, path: "/host/rto" },
  { label: "Verification & Tax", icon: Shield, path: "/host/verification" },
  { label: "Business Operations", icon: Sparkles, path: "/host/business-operations" },
  { label: "AI Assistant", icon: MessageSquare, path: "/host/chat" },
];

// Internal-only / secondary host routes — accessible via direct URL, hidden from nav:
// /host/payment-history   (merge target into /host/payments)
// /host/fleet-insights    (secondary — covered by P&L/Dashboard)
// /host/reports           (secondary — covered by P&L)
// /host/av-readiness      (niche/beta — not active product line)

export default function HostLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: hosts = [] } = useQuery({
    queryKey: ["host-layout-host", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];
  const { data: plans = [] } = useQuery({
    queryKey: ["host-layout-plan", host?.id],
    queryFn: () => base44.entities.OperatorPlanConfiguration.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });
  const plan = plans[0];
  const showDealerNetwork = plan?.dealer_network_enabled || ["pending_payment", "active"].includes(plan?.dealer_network_membership_status);
  const navItems = showDealerNetwork
    ? [...baseNavItems.slice(0, 3), { label: "Dealer Network", icon: Car, path: "/host/dealer-network" }, ...baseNavItems.slice(3)]
    : baseNavItems;

  return (
    <div className="min-h-screen" style={{ fontFamily: "var(--font-inter)", background: "#f8f8fa" }}>
      {/* Mobile overlay */}
      {mobileOpen && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Sidebar — desktop only */}
      <aside className={cn(
        "fixed top-0 left-0 h-full z-50 flex flex-col w-64 transition-transform duration-300",
        "border-r border-gray-100 shadow-xl",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )} style={{ background: "linear-gradient(180deg, #ffffff 0%, #faf9ff 100%)" }}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-5" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <div className="flex items-center gap-2.5">
            <img src={LOGO_ICON} alt="uRide" className="h-8 w-8 rounded-xl object-cover shadow-sm" />
            <div>
              <span className="font-black text-gray-900 text-base" style={{ fontFamily: "var(--font-syne)" }}>uRide</span>
              <p className="text-[10px] font-bold -mt-0.5" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Host Portal</p>
            </div>
          </div>
          <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 px-3 mb-3">Host Menu</p>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
            return (
              <Link key={item.path} to={item.path} onClick={() => setMobileOpen(false)}
                className={cn(
                  "group flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all",
                  isActive
                    ? "text-pink-600 font-semibold"
                    : "text-gray-400 hover:text-gray-900 hover:bg-gray-50"
                )}
                style={isActive ? { background: "linear-gradient(135deg, hsl(338 90% 56% / 0.08), hsl(265 80% 62% / 0.06))", border: "1px solid hsl(338 90% 56% / 0.15)" } : {}}>
                <item.icon className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-pink-600" : "text-gray-400 group-hover:text-gray-600")} />
                <span>{item.label}</span>
                {isActive && <div className="ml-auto h-1.5 w-1.5 rounded-full" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }} />}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-3" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-sm"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              {user?.full_name?.charAt(0) || "H"}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-900 truncate">{user?.full_name}</p>
              <p className="text-[10px] text-gray-400 truncate">{user?.email}</p>
            </div>
          </div>
          <button onClick={() => logout()} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all">
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64 flex flex-col min-h-screen">
        {/* Mobile topbar */}
        <header className="lg:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-100 h-16 flex items-center justify-between px-5">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <img src={LOGO_ICON} alt="uRide" className="h-7 w-7 rounded-xl object-cover" />
            <span className="font-bold text-gray-900 text-sm" style={{ fontFamily: "var(--font-syne)" }}>Host Portal</span>
          </div>
          <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            {user?.full_name?.charAt(0) || "H"}
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 max-w-5xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}