import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Car, Users, DollarSign, Wrench, Shield, Satellite, CalendarDays, BarChart3, Search, Home, ExternalLink, Zap, UserPlus, MapPin } from "lucide-react";

const ADMIN_SECTIONS = [
  {
    label: "Create",
    color: "text-pink-400",
    items: [
      { label: "Add Vehicle", icon: Car, path: "/vehicles" },
      { label: "Add Host", icon: Home, path: "/admin/hosts" },
      { label: "New Booking", icon: CalendarDays, path: "/bookings-admin" },
      { label: "Add Customer", icon: UserPlus, path: "/customers" },
    ],
  },
  {
    label: "Money",
    color: "text-green-400",
    items: [
      { label: "Add Expense", icon: DollarSign, path: "/admin/expense-center" },
      { label: "View Failed Payments", icon: DollarSign, path: "/admin/payment-alerts" },
      { label: "View Payouts", icon: DollarSign, path: "/admin/payouts" },
      { label: "Financial Center", icon: BarChart3, path: "/admin/financial-center" },
    ],
  },
  {
    label: "Fleet",
    color: "text-blue-400",
    items: [
      { label: "Add Maintenance", icon: Wrench, path: "/admin/maintenance-center" },
      { label: "Upload Compliance Doc", icon: Shield, path: "/admin/compliance-center" },
      { label: "Assign GPS Device", icon: Satellite, path: "/admin/telematics-center" },
      { label: "Find Installer", icon: MapPin, path: "/admin/installers" },
    ],
  },
  {
    label: "Support",
    color: "text-purple-400",
    items: [
      { label: "Customer 360", icon: Users, path: "/admin/customer-360" },
      { label: "Booking 360", icon: CalendarDays, path: "/admin/booking-360" },
      { label: "Host 360", icon: Home, path: "/admin/host-360" },
      { label: "Vehicle 360", icon: Car, path: "/admin/vehicle-360" },
    ],
  },
];

const HOST_SECTIONS = [
  {
    label: "Create",
    color: "text-pink-600",
    items: [
      { label: "Add Vehicle", icon: Car, path: "/host/vehicles/setup" },
      { label: "Add Expense", icon: DollarSign, path: "/host/expenses" },
      { label: "Add Maintenance", icon: Wrench, path: "/host/maintenance" },
    ],
  },
  {
    label: "Fleet",
    color: "text-blue-600",
    items: [
      { label: "My Vehicles", icon: Car, path: "/host/vehicles" },
      { label: "Upload Compliance Doc", icon: Shield, path: "/host/compliance" },
      { label: "Send GPS Command", icon: Zap, path: "/host/vehicle-command-center" },
      { label: "Find Installer", icon: MapPin, path: "/host/installers" },
      { label: "GPS / Telematics", icon: Satellite, path: "/host/telematics" },
    ],
  },
  {
    label: "Money",
    color: "text-green-600",
    items: [
      { label: "View Payouts", icon: DollarSign, path: "/host/payouts" },
      { label: "View Payment Alerts", icon: BarChart3, path: "/host/payment-alerts" },
      { label: "View Storefront", icon: ExternalLink, path: "/host/brand" },
    ],
  },
];

const SEARCH_LINKS = [
  { label: "Search Customer", path: "/admin/customer-360" },
  { label: "Search Booking", path: "/admin/booking-360" },
  { label: "Search Host", path: "/admin/host-360" },
  { label: "Search Vehicle", path: "/admin/vehicle-360" },
];

const HOST_SEARCH_LINKS = [
  { label: "My Vehicles", path: "/host/vehicles" },
  { label: "My Customers", path: "/host/customers" },
  { label: "My Payments", path: "/host/payments" },
];

export default function QuickActionsDrawer({ open, onClose, role = "admin" }) {
  const navigate = useNavigate();
  const sections = role === "admin" ? ADMIN_SECTIONS : HOST_SECTIONS;
  const searchLinks = role === "admin" ? SEARCH_LINKS : HOST_SEARCH_LINKS;

  const go = (path) => {
    navigate(path);
    onClose();
  };

  if (!open) return null;

  const isAdmin = role === "admin";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className={`relative z-10 w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border shadow-2xl flex flex-col ${isAdmin ? "border-white/[0.08]" : "border-gray-200"}`}
        style={{ background: isAdmin ? "hsl(222 24% 10%)" : "#fff" }}>

        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isAdmin ? "border-white/[0.06]" : "border-gray-100"} sticky top-0 z-10`}
          style={{ background: isAdmin ? "hsl(222 24% 10%)" : "#fff" }}>
          <div>
            <h2 className={`text-base font-bold ${isAdmin ? "text-white" : "text-gray-900"}`}>Quick Actions</h2>
            <p className={`text-xs mt-0.5 ${isAdmin ? "text-white/40" : "text-gray-500"}`}>Jump to any action fast</p>
          </div>
          <button onClick={onClose} className={`h-8 w-8 rounded-xl flex items-center justify-center transition-all ${isAdmin ? "text-white/40 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"}`}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search shortcuts */}
        <div className={`px-5 pt-4 pb-2 border-b ${isAdmin ? "border-white/[0.04]" : "border-gray-100"}`}>
          <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${isAdmin ? "text-white/30" : "text-gray-400"}`}>Search Shortcuts</p>
          <div className="flex flex-wrap gap-2">
            {searchLinks.map(l => (
              <button key={l.path} onClick={() => go(l.path)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isAdmin ? "bg-white/[0.07] text-white/70 hover:bg-white/[0.12] hover:text-white border border-white/[0.06]" : "bg-gray-100 text-gray-700 hover:bg-pink-50 hover:text-pink-700 border border-gray-200"}`}>
                <Search className="h-3 w-3" />
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action sections */}
        <div className="px-5 py-4 space-y-5">
          {sections.map(section => (
            <div key={section.label}>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-2.5 ${section.color}`}>{section.label}</p>
              <div className="grid grid-cols-2 gap-2">
                {section.items.map(item => (
                  <button key={item.path} onClick={() => go(item.path)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl text-left transition-all group ${isAdmin ? "bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.05] hover:border-white/[0.12]" : "bg-gray-50 hover:bg-pink-50 border border-gray-100 hover:border-pink-200"}`}>
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isAdmin ? "bg-white/[0.07]" : "bg-white border border-gray-200"}`}>
                      <item.icon className={`h-4 w-4 ${isAdmin ? "text-white/60 group-hover:text-white" : "text-gray-500 group-hover:text-pink-600"} transition-colors`} />
                    </div>
                    <span className={`text-xs font-medium leading-snug ${isAdmin ? "text-white/60 group-hover:text-white" : "text-gray-700 group-hover:text-gray-900"} transition-colors`}>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}