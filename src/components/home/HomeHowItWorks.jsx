import React from "react";
import { Search, UserCheck, Fingerprint, Car, CreditCard, Store } from "lucide-react";

const DRIVER_STEPS = [
  { icon: Search, label: "Browse vehicles", desc: "Find weekly rentals near you" },
  { icon: UserCheck, label: "Verify online", desc: "Fast approval, no showroom visit" },
  { icon: Fingerprint, label: "Contactless pickup", desc: "Access keys or unlock remotely" },
];

const HOST_STEPS = [
  { icon: Car, label: "Add your vehicles", desc: "List your fleet in minutes" },
  { icon: CreditCard, label: "Connect Stripe", desc: "Automated weekly payouts" },
  { icon: Store, label: "Launch your storefront", desc: "Start accepting bookings" },
];

function StepFlow({ steps, accent }) {
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i} className="flex items-start gap-3 relative">
          {/* Connector line */}
          {i < steps.length - 1 && (
            <div className="absolute left-[18px] top-9 bottom-0 w-px bg-gray-100" style={{ height: "calc(100% - 8px)" }} />
          )}
          <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 relative z-10"
            style={{ background: accent === "pink" ? "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" : "linear-gradient(135deg, #302b63, #1a1040)" }}>
            <s.icon className="h-4 w-4 text-white" />
          </div>
          <div className="pt-1 pb-3">
            <p className="text-sm font-bold text-gray-900">{s.label}</p>
            <p className="text-xs text-gray-400">{s.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HomeHowItWorks() {
  return (
    <div>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Simple process</p>
      <h3 className="text-lg font-black text-gray-900 mb-5" style={{ fontFamily: "var(--font-syne)" }}>
        How uRideHub Works
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Driver flow */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-7 w-7 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              <Car className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-pink-600 uppercase tracking-wider">For Drivers</p>
              <p className="text-xs text-gray-500">Get approved online, rent weekly</p>
            </div>
          </div>
          <StepFlow steps={DRIVER_STEPS} accent="pink" />
        </div>

        {/* Host flow */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-7 w-7 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #302b63, #1a1040)" }}>
              <Store className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">For Fleet Owners</p>
              <p className="text-xs text-gray-500">Automate your rental operations</p>
            </div>
          </div>
          <StepFlow steps={HOST_STEPS} accent="dark" />
        </div>
      </div>
    </div>
  );
}