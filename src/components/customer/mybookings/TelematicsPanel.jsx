import React, { useState } from "react";
import { Zap } from "lucide-react";
import CustomerSafetyCheck from "@/components/telematics/safety/CustomerSafetyCheck";
import TelematicsCommandButtons from "@/components/telematics/TelematicsCommandButtons";

export default function TelematicsPanel({ booking }) {
  const [lastResult, setLastResult] = useState(null);
  const isKilled = booking.moovetrax_kill_active || booking.starter_disabled;

  if (isKilled) {
    return (
      <div className="mx-4 mb-3 overflow-hidden rounded-2xl border border-red-500/30" style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(220,38,38,0.08))" }}>
        <div className="p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/20">
              <Zap className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-red-400">Vehicle Disabled</p>
              <p className="mt-0.5 text-[11px] text-red-400/60">Payment required to restore access</p>
            </div>
          </div>
          <p className="mb-3 text-xs leading-relaxed text-white/50">Your vehicle has been remotely disabled due to a missed payment. Update your payment method to restore access immediately.</p>
          <a href={`/checkout?request=${booking.id}&step=payment`} className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white" style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}>
            Pay Now to Restore →
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      <CustomerSafetyCheck booking={booking} />
      <div className="mx-4 mb-3 overflow-hidden rounded-2xl border border-white/[0.08]" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))" }}>
        <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/50">Remote Vehicle Controls</p>
            <p className="mt-0.5 text-[10px] text-white/30">Controls appear only when this rental, payment, device, and provider are eligible.</p>
          </div>
        </div>
        {lastResult && (
          <div className="mx-3 mb-3 rounded-xl border border-white/[0.08] p-3 text-xs text-white/60">
            Last command: <span className="font-bold text-white/80">{lastResult.command_type}</span> · {lastResult.queue_status || "sent"}
          </div>
        )}
        <div className="px-3 pb-3">
          <TelematicsCommandButtons
            role="customer"
            bookingId={booking.id}
            vehicleId={booking.vehicle_id}
            booking={booking}
            showAlarmControls={false}
            unavailableMessage="Vehicle controls are not available for this rental."
            onResult={setLastResult}
          />
        </div>
      </div>
    </>
  );
}