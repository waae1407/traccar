import React, { useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { LayoutDashboard, Car, DollarSign, Shield, FileKey, TrendingUp, Zap, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/host/dashboard" },
  { label: "My Vehicles", icon: Car, path: "/host/vehicles" },
  { label: "Payouts", icon: DollarSign, path: "/host/payouts" },
  { label: "Compliance", icon: Shield, path: "/host/compliance" },
  { label: "RTO Contracts", icon: FileKey, path: "/host/rto" },
  { label: "Fleet Insights", icon: TrendingUp, path: "/host/fleet-insights" },
  { label: "AV Readiness", icon: Zap, path: "/host/av-readiness" },
];

export default function HostLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex" style={{ background: "hsl(222 28% 7%)" }}>
      {/* Mobile overlay */}
      {mobileOpen && <div className="fixed inset-0 bg-black/70 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-full z-50 flex flex-col w-64 transition-transform duration-300",
        "border-r border-white/[0.06]",
        "bg-[hsl(222,30%,8%)]",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="h-[70px] flex items-center justify-between px-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <img src={LOGO_ICON} alt="uRide" className="h-9 w-9 rounded-xl ring-1 ring-primary/40" />
            <div>
              <span className="font-bold text-white text-base font-syne">uRide</span>
              <p className="text-[10px] text-primary/60">Host Portal</p>
            </div>
          </div>
          <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 text-white/60">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 px-3 mb-3">Host Menu</p>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
            return (
              <Link key={item.path} to={item.path} onClick={() => setMobileOpen(false)}
                className={cn("group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  isActive ? "nav-active shadow-glow-sm" : "text-white/50 hover:text-white/90 hover:bg-white/[0.06]")}>
                <item.icon className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-primary" : "text-white/40 group-hover:text-white/70")} />
                <span>{item.label}</span>
                {isActive && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/[0.06]">
          <div className="px-3 py-2 mb-2">
            <p className="text-xs font-semibold text-white truncate">{user?.full_name}</p>
            <p className="text-[11px] text-white/40 truncate">{user?.email}</p>
          </div>
          <button onClick={() => logout()} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all">
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Mobile topbar */}
        <div className="lg:hidden flex items-center justify-between px-4 h-14 border-b border-white/[0.06] bg-[hsl(222,30%,8%)]">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg hover:bg-white/10 text-white/60">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-bold text-white font-syne text-sm">Host Portal</span>
          <div className="w-9" />
        </div>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}