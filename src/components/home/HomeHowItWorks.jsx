import React from "react";
import { Search, UserCheck, Fingerprint, Car, CreditCard, Store } from "lucide-react";

const DRIVER_STEPS = [
  { icon: Search, label: "Browse vehicles", desc: "Find rentals near you" },
  { icon: UserCheck, label: "Verify online", desc: "Get approved fast, no showroom visit" },
  { icon: Fingerprint, label: "Contactless pickup", desc: "Access keys or unlock remotely" },
];

const HOST_STEPS = [
  { icon: Car, label: "Add your vehicles", desc: "List your fleet in minutes" },
  { icon: CreditCard, label: "Connect Stripe", desc: "Automated weekly payouts" },
  { icon: Store, label: "Launch your storefront", desc: "Start accepting bookings" },
];

function StepFlow({ steps, accent }) {
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={i} className="flex items-start gap-3 relative">
          {i < steps.length - 1 && (
            <div
              className="absolute left-[19px] top-11 bottom-0 w-px bg-white/10"
              style={{ height: "calc(100% - 6px)" }}
            />
          )}
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 relative z-10 border border-white/10"
            style={{
              background:
                accent === "pink"
                  ? "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))"
                  : "linear-gradient(135deg, #302b63, #1a1040)",
            }}
          >
            <s.icon className="h-4 w-4 text-white" />
          </div>
          <div className="pt-1.5 pb-4">
            <p className="text-sm font-bold text-white">{s.label}</p>
            <p className="text-xs text-white/50">{s.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HomeHowItWorks() {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/40 mb-2">
        Simple process
      </p>
      <h3
        className="text-3xl font-black text-white mb-6"
        style={{ fontFamily: "var(--font-syne)" }}
      >
        How uRideHub Works
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-3xl glass p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <div
              className="h-8 w-8 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
            >
              <Car className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-pink-400">For Drivers</p>
              <p className="text-xs text-white/45">Get approved online, start renting</p>
            </div>
          </div>
          <StepFlow steps={DRIVER_STEPS} accent="pink" />
        </div>

        <div className="rounded-3xl glass p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <div
              className="h-8 w-8 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #302b63, #1a1040)" }}
            >
              <Store className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-400">For Fleet Owners</p>
              <p className="text-xs text-white/45">Automate your rental operations</p>
            </div>
          </div>
          <StepFlow steps={HOST_STEPS} accent="dark" />
        </div>
      </div>
    </div>
  );
}