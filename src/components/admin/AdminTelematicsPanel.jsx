import React, { useState } from "react";
import { Activity } from "lucide-react";
import TelematicsCommandButtons from "@/components/telematics/TelematicsCommandButtons";

export default function AdminTelematicsPanel({ booking, vehicleDeviceId }) {
  const [lastResult, setLastResult] = useState(null);

  if (!vehicleDeviceId && !booking?.vehicle_id) {
    return (
      <div className="rounded-2xl border border-white/[0.06] p-4" style={{ background: "hsl(222 24% 11% / 0.8)" }}>
        <div className="mb-1 flex items-center gap-2">
          <Activity className="h-4 w-4 text-white/20" />
          <p className="text-xs font-bold uppercase tracking-wider text-white/30">Unified Telematics</p>
        </div>
        <p className="mt-1 text-xs text-white/25">No telematics command target is configured for this vehicle.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07]" style={{ background: "hsl(222 24% 11% / 0.9)" }}>
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/50">Unified Telematics Controls</p>
        </div>
        <span className="rounded-full border border-emerald-500/25 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold text-emerald-400">sendTelematicsCommand</span>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-[10px] font-mono text-white/25">Device: {vehicleDeviceId || "resolved from vehicle"}</p>
        <TelematicsCommandButtons role="admin" vehicleId={booking?.vehicle_id} bookingId={booking?.id} uniqueId={vehicleDeviceId} booking={booking} onResult={setLastResult} />
        {lastResult && <div className="rounded-xl border border-white/[0.08] p-3 text-xs text-white/50">Last command: {lastResult.command_type} · {lastResult.queue_status || "sent"}</div>}
      </div>
    </div>
  );
}