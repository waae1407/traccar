import React from "react";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Globe2, Store, Percent } from "lucide-react";

const labels = {
  marketplace_partner: "Marketplace Partner",
  fleetos_professional: "FleetOS Professional",
  hybrid_growth: "Hybrid Growth",
};

export default function CommerceProfileCard({ commerceProfile }) {
  if (!commerceProfile) return null;

  const stats = [
    [Globe2, "Marketplace", commerceProfile.marketplace_visibility ? "Visible" : "Hidden"],
    [Store, "Booking", commerceProfile.booking_enabled ? "Enabled" : "Disabled"],
    [CreditCard, "Processor", commerceProfile.payment_processor?.replace("_", " ") || "—"],
    [Percent, "Commission", `${Math.round(Number(commerceProfile.commission_rate || 0) * 100)}%`],
  ];

  return (
    <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-gray-900">Commerce Profile</p>
          <p className="text-xs text-gray-500 mt-1">Shared booking system with plan-based commerce behavior.</p>
        </div>
        <Badge className="bg-gray-900 text-white">{labels[commerceProfile.plan_type] || commerceProfile.plan_type}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {stats.map(([Icon, label, value]) => (
          <div key={label} className="rounded-xl bg-gray-50 p-3">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase tracking-wider">
              <Icon className="h-3.5 w-3.5" /> {label}
            </div>
            <p className="font-black text-gray-900 mt-1 capitalize">{value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-emerald-700 bg-emerald-50 rounded-xl p-3">
        Vehicles, customers, bookings, contracts, GPS, inspections, CRM, maintenance, notifications, and reports stay unified across every plan.
      </p>
    </div>
  );
}