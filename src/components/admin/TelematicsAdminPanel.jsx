import React, { useState } from "react";
import { Activity } from "lucide-react";
import TelematicsCommandButtons from "@/components/telematics/TelematicsCommandButtons";

export default function TelematicsAdminPanel({ booking }) {
  const [lastResult, setLastResult] = useState(null);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07]" style={{ background: "hsl(222 24% 10% / 0.95)" }}>
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: "linear-gradient(135deg, #e91e8c22, #7c3aed22)", border: "1px solid #e91e8c33" }}>
            <Activity className="h-4 w-4" style={{ color: "#e91e8c" }} />
          </div>
          <div>
            <p className="text-sm font-black text-white" style={{ fontFamily: "var(--font-syne)" }}>Unified Telematics Controls</p>
            <p className="text-[10px] text-white/30">All commands route through sendTelematicsCommand</p>
          </div>
        </div>
      </div>
      <div className="space-y-3 p-3">
        <TelematicsCommandButtons role="admin" vehicleId={booking?.vehicle_id} bookingId={booking?.id} booking={booking} onResult={setLastResult} />
        {lastResult && <div className="rounded-xl border border-white/[0.08] p-3 text-xs text-white/50">Last command: {lastResult.command_type} · {lastResult.queue_status || "sent"}</div>}
      </div>
    </div>
  );
}