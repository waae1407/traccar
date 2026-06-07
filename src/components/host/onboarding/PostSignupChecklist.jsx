import React from "react";
import { Car, DollarSign, CreditCard, FileText, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const checklistByMode = {
  marketplace_partner: [
    [Car, "Add your first vehicle", "/host/vehicles"],
    [DollarSign, "Add pricing", "/host/vehicles"],
    [CreditCard, "Connect Stripe, if needed", "/host/business-operations"],
    [FileText, "Customize storefront", "/host/brand"],
  ],
  hybrid_growth: [
    [Car, "Add your first vehicle", "/host/vehicles"],
    [DollarSign, "Add pricing", "/host/vehicles"],
    [CreditCard, "Connect Stripe, if needed", "/host/business-operations"],
    [FileText, "Customize storefront", "/host/brand"],
  ],
  fleetos_professional: [
    [Car, "Add your first vehicle", "/host/vehicles"],
    [DollarSign, "Add pricing", "/host/vehicles"],
    [CreditCard, "Connect Stripe, if needed", "/host/business-operations"],
    [FileText, "Customize storefront", "/host/brand"],
  ],
};

export default function PostSignupChecklist({ mode }) {
  const items = checklistByMode[mode] || checklistByMode.marketplace_partner;

  return (
    <div className="rounded-3xl bg-white border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Next steps</p>
      <h2 className="text-lg font-black text-gray-900 mt-1" style={{ fontFamily: "var(--font-syne)" }}>Finish enabling bookings</h2>
      <p className="text-sm text-gray-500 mt-1">These checklist items do not block your storefront URL.</p>
      <div className="mt-4 space-y-2">
        {items.map(([Icon, label, path], index) => (
          <Link key={label} to={path} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 hover:bg-pink-50 hover:border-pink-100 transition-all">
            <div className="h-9 w-9 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-pink-600 font-black text-xs">
              {index + 1}
            </div>
            <Icon className="h-4 w-4 text-gray-500" />
            <span className="flex-1 text-sm font-bold text-gray-800">{label}</span>
            <ArrowRight className="h-4 w-4 text-gray-300" />
          </Link>
        ))}
      </div>
    </div>
  );
}