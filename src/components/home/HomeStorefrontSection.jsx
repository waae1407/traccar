import React from "react";
import { Palette, Car, CalendarDays, CreditCard, Fingerprint, BarChart2 } from "lucide-react";

const FEATURES = [
  { icon: Palette, label: "Add your logo & business profile" },
  { icon: Car, label: "List your vehicles" },
  { icon: CalendarDays, label: "Accept weekly bookings" },
  { icon: CreditCard, label: "Manage payouts" },
  { icon: Fingerprint, label: "Support contactless pickup" },
  { icon: BarChart2, label: "Track fleet activity" },
];

export default function HomeStorefrontSection() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
      <h3 className="text-lg font-black text-gray-900 mb-2" style={{ fontFamily: "var(--font-syne)" }}>
        Your Own Rental Storefront
      </h3>
      <p className="text-sm leading-relaxed mb-2" style={{ color: "#5f6675" }}>
        Every approved host gets a dedicated uRideHub storefront to showcase vehicles, accept bookings, manage customers, and build their own local rental brand.
      </p>
      <p className="text-xs font-semibold mb-3" style={{ color: "hsl(338 90% 56%)" }}>
        Your customers. Your storefront. Powered by uRideHub.
      </p>

      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-gray-200 mb-5">
        <span className="text-xs text-gray-400">🔗</span>
        <span className="text-xs font-mono text-gray-600 truncate">uridehub.com/fleet/<span className="text-pink-600 font-bold">your-business-name</span></span>
      </div>

      <div className="grid grid-cols-2 gap-2">
         {FEATURES.map((f, i) => (
           <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-gray-100">
             <div className="h-7 w-7 rounded-lg bg-pink-50 flex items-center justify-center flex-shrink-0">
               <f.icon className="h-3.5 w-3.5 text-pink-600" />
             </div>
             <span className="text-[11px] font-semibold leading-tight" style={{ color: "#0f172a" }}>{f.label}</span>
           </div>
         ))}
       </div>
    </div>
  );
}