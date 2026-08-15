import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Car, DollarSign, Wrench, Shield, Satellite, CalendarDays, BarChart3, Home, MapPin, Zap, UserPlus, ExternalLink, Battery } from "lucide-react";

const ADMIN_ACTIONS = [
  { label: "Add Vehicle", icon: Car, path: "/vehicles", color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "Add Host", icon: Home, path: "/admin/hosts", color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "Add Expense", icon: DollarSign, path: "/admin/expense-center", color: "text-green-400", bg: "bg-green-500/10" },
  { label: "Add Maintenance", icon: Wrench, path: "/admin/maintenance-center", color: "text-orange-400", bg: "bg-orange-500/10" },
  { label: "New Booking", icon: CalendarDays, path: "/bookings-admin", color: "text-pink-400", bg: "bg-pink-500/10" },
  { label: "Compliance Doc", icon: Shield, path: "/admin/compliance-center", color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { label: "GPS Command", icon: Zap, path: "/admin/vehicle-command-center", color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { label: "Battery Health", icon: Battery, path: "/admin/battery-health", color: "text-lime-400", bg: "bg-lime-500/10" },
  { label: "Financial Center", icon: BarChart3, path: "/admin/financial-center", color: "text-emerald-400", bg: "bg-emerald-500/10" },
];

const HOST_ACTIONS = [
  { label: "My Vehicles", icon: Car, path: "/host/vehicles", color: "text-blue-600", bg: "bg-blue-50" },
  { label: "Add Vehicle", icon: Car, path: "/host/vehicles/setup", color: "text-indigo-600", bg: "bg-indigo-50" },
  { label: "Add Expense", icon: DollarSign, path: "/host/expenses", color: "text-green-600", bg: "bg-green-50" },
  { label: "Add Maintenance", icon: Wrench, path: "/host/maintenance", color: "text-orange-600", bg: "bg-orange-50" },
  { label: "Compliance Doc", icon: Shield, path: "/host/compliance", color: "text-yellow-600", bg: "bg-yellow-50" },
  { label: "Find Installer", icon: MapPin, path: "/host/installers", color: "text-purple-600", bg: "bg-purple-50" },
  { label: "GPS Command", icon: Zap, path: "/host/vehicle-command-center", color: "text-cyan-600", bg: "bg-cyan-50" },
  { label: "Battery Health", icon: Battery, path: "/host/battery-health", color: "text-lime-600", bg: "bg-lime-50" },
  { label: "Financial Center", icon: BarChart3, path: "/host/pnl", color: "text-emerald-600", bg: "bg-emerald-50" },
  { label: "View Storefront", icon: ExternalLink, path: "/host/brand", color: "text-pink-600", bg: "bg-pink-50" },
];

export default function QuickActionsCard({ role = "admin", onOpenDrawer }) {
  const isAdmin = role === "admin";
  const actions = isAdmin ? ADMIN_ACTIONS : HOST_ACTIONS;
  const { user } = useAuth();

  // Fetch battery health scorecards to show a warning badge on the Battery Health icon
  const { data: hosts = [] } = useQuery({
    queryKey: ["qa-host", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user?.email }),
    enabled: !!user?.email && role === "host",
  });
  const hostId = hosts[0]?.id;

  const { data: scorecards = [] } = useQuery({
    queryKey: ["qa-battery-warnings", role, hostId],
    queryFn: () =>
      role === "admin"
        ? base44.entities.BatteryHealthScorecard.list("-updated_date", 200)
        : base44.entities.BatteryHealthScorecard.filter({ host_id: hostId }),
    enabled: role === "admin" || !!hostId,
    refetchInterval: 60_000,
  });
  const batteryWarningCount = scorecards.filter(
    (s) =>
      (s.severity && s.severity !== "healthy") ||
      (s.resting_voltage != null && s.resting_voltage < 12.7 && s.resting_voltage > 0)
  ).length;

  return (
    <div className={`rounded-2xl border p-4 ${isAdmin ? "border-white/[0.07]" : "border-gray-100 bg-white shadow-sm"}`}
      style={isAdmin ? { background: "hsl(222 24% 11% / 0.9)" } : {}}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className={`text-sm font-bold ${isAdmin ? "text-white" : "text-gray-900"}`}>Quick Actions</h2>
          <p className={`text-[11px] mt-0.5 ${isAdmin ? "text-white/35" : "text-gray-500"}`}>Jump to common tasks</p>
        </div>
        {onOpenDrawer && (
          <button onClick={onOpenDrawer}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${isAdmin ? "text-white/50 hover:text-white bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.07]" : "text-pink-600 hover:text-pink-700 bg-pink-50 hover:bg-pink-100"}`}>
            See all →
          </button>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {actions.map(action => (
          <Link key={action.path} to={action.path}
            className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-all group text-center ${isAdmin ? "hover:bg-white/[0.06] active:bg-white/[0.09]" : "hover:bg-gray-50 active:bg-gray-100"}`}>
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center relative ${action.bg}`}>
              <action.icon className={`h-4 w-4 ${action.color}`} />
              {action.label === "Battery Health" && batteryWarningCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border border-white/20">
                  {batteryWarningCount}
                </span>
              )}
            </div>
            <span className={`text-[10px] font-medium leading-tight text-center ${isAdmin ? "text-white/50 group-hover:text-white/80" : "text-gray-600 group-hover:text-gray-900"} transition-colors`}>
              {action.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}