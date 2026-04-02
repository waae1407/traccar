import React from "react";
import { useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { User, Phone, Mail, LogOut, ChevronRight, Shield, CreditCard, HelpCircle, Bell, Upload, Check } from "lucide-react";

export default function AccountPage() {
  const { user } = useOutletContext() || {};

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
        <div className="relative mb-6">
          <div className="h-20 w-20 rounded-full bg-gray-100 flex items-center justify-center">
            <User className="h-9 w-9 text-gray-400" />
          </div>
        </div>
        <h3 className="font-bold text-gray-900 text-xl">Sign in to uRide</h3>
        <p className="text-gray-400 text-sm mt-2 max-w-xs">Access your bookings, manage your account, and track your payments.</p>
        <button onClick={() => base44.auth.redirectToLogin(window.location.href)}
          className="mt-6 w-full max-w-xs h-12 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          Sign In / Create Account
        </button>
        <p className="text-xs text-gray-400 mt-4">New accounts are created as customers. No admin required.</p>
      </div>
    );
  }

  const menuSections = [
    {
      title: "Profile",
      items: [
        { icon: User, label: "Personal Info", sub: user.full_name || "Update your details" },
        { icon: Phone, label: "Phone Number", sub: user.phone || "Add phone number" },
        { icon: Mail, label: "Email", sub: user.email || "—" },
      ],
    },
    {
      title: "Rental",
      items: [
        { icon: Shield, label: "ID Verification", sub: user.driver_license_url ? "Verified ✓" : "Upload required", badge: !user.driver_license_url ? "Action" : null },
        { icon: CreditCard, label: "Payment Methods", sub: "Manage saved cards" },
      ],
    },
    {
      title: "Support",
      items: [
        { icon: HelpCircle, label: "Help Center", sub: "FAQs and support" },
        { icon: Bell, label: "Notifications", sub: "Manage alerts" },
      ],
    },
  ];

  return (
    <div className="py-5">
      {/* Profile header */}
      <div className="px-4 mb-6">
        <div className="flex items-center gap-4 p-5 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="relative">
            <div className="h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              {user.full_name?.charAt(0) || "U"}
            </div>
            {user.driver_license_url && (
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
                <Check className="h-2.5 w-2.5 text-white" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-lg leading-tight">{user.full_name || "Customer"}</p>
            <p className="text-sm text-gray-500 truncate">{user.email}</p>
            <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-pink-50 text-pink-600 border border-pink-100">
              {user.role === "admin" ? "Admin" : "Customer"}
            </span>
          </div>
        </div>
      </div>

      {/* Menu sections */}
      {menuSections.map((section) => (
        <div key={section.title} className="mb-4 px-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{section.title}</p>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            {section.items.map((item, idx) => (
              <button key={item.label} className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left ${idx < section.items.length - 1 ? "border-b border-gray-100" : ""}`}>
                <div className="h-8 w-8 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <item.icon className="h-4 w-4 text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{item.label}</p>
                  <p className="text-xs text-gray-400 truncate">{item.sub}</p>
                </div>
                {item.badge && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 flex-shrink-0">{item.badge}</span>
                )}
                <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Sign out */}
      <div className="px-4 mt-2">
        <button
          onClick={() => base44.auth.logout()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-red-200 text-red-500 font-semibold text-sm hover:bg-red-50 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>

      <div className="h-4" />
    </div>
  );
}