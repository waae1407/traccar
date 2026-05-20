import React from "react";
import { Building2, Wrench, Car, FileCheck, Briefcase, ShoppingCart } from "lucide-react";

const SEGMENTS = [
  { icon: Building2, label: "Dealership rental fleets" },
  { icon: Wrench, label: "Repair shop loaner/rental vehicles" },
  { icon: Car, label: "Body shop replacement rentals" },
  { icon: FileCheck, label: "Rent-to-own style programs" },
  { icon: Briefcase, label: "Weekly gig-driver rentals" },
  { icon: ShoppingCart, label: "Vehicle liquidation & sourcing support" },
];

export default function HomeAutoBusinessSection() {
  return (
    <div>
      <h3 className="text-lg font-black text-gray-900 mb-2" style={{ fontFamily: "var(--font-syne)" }}>
        Built for Auto Businesses
      </h3>
      <p className="text-sm text-gray-500 leading-relaxed mb-4">
        uRideHub is designed for independent dealerships, repair shops, body shops, small fleet owners, and rental operators who want to monetize vehicles without building their own rental technology.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {SEGMENTS.map((s, i) => (
          <div key={i} className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-100 bg-white">
            <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
              <s.icon className="h-4 w-4 text-violet-600" />
            </div>
            <span className="text-xs font-semibold text-gray-700 leading-tight">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}