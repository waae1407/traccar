import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Car,
  CalendarDays,
  DollarSign,
  FileKey,
  Wrench,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LOGO_FULL = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/860834ab2_A3BAE4B8-976F-4BA4-B14F-141A770ED30E.jpg";
const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Customers", icon: Users, path: "/customers" },
  { label: "Vehicles", icon: Car, path: "/vehicles" },
  { label: "Bookings", icon: CalendarDays, path: "/bookings" },
  { label: "Payments", icon: DollarSign, path: "/payments" },
  { label: "Rent-to-Own", icon: FileKey, path: "/rent-to-own" },
  { label: "Maintenance", icon: Wrench, path: "/maintenance" },
  { label: "Reports", icon: BarChart3, path: "/reports" },
];

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const location = useLocation();

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 h-full z-50 flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 border-r border-sidebar-border",
          collapsed ? "w-[72px]" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
          {!collapsed ? (
            <img src={LOGO_FULL} alt="uRide" className="h-9 object-contain" />
          ) : (
            <img src={LOGO_ICON} alt="uRide" className="h-9 w-9 rounded-full object-cover" />
          )}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 rounded-md hover:bg-sidebar-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || 
              (item.path !== "/" && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/25"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Collapse button (desktop) */}
        <div className="hidden lg:flex p-3 border-t border-sidebar-border">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/60 transition-colors"
          >
            {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </button>
        </div>
      </aside>
    </>
  );
}