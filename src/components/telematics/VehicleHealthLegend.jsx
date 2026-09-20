import React, { useState } from "react";
import { ChevronDown, ChevronUp, Battery, Satellite, Car, AlertTriangle } from "lucide-react";

// Compact legend overlay for the vehicle health marker system.
// Sits in the corner of the fleet map so admins/hosts can decode the dots.
export default function VehicleHealthLegend({ audience = "admin" }) {
  const [open, setOpen] = useState(false);

  const rows = [
    { icon: <div className="h-3 w-3 rounded-full bg-emerald-500 border border-white" />, label: "Healthy / Live" },
    { icon: <div className="h-3 w-3 rounded-full bg-yellow-500 border border-white" />, label: "Warning / Stale" },
    { icon: <div className="h-3 w-3 rounded-full bg-red-500 border border-white" />, label: "Critical / Offline" },
    { icon: <div className="h-3 w-3 rounded-full bg-gray-500 border border-white" />, label: "No recent data" },
  ];

  const dotRows = [
    { icon: <Battery className="h-3.5 w-3.5 text-emerald-400" />, label: "Battery ≥12.2V" },
    { icon: <Battery className="h-3.5 w-3.5 text-yellow-400" />, label: "Battery 12.0–12.2V" },
    { icon: <Battery className="h-3.5 w-3.5 text-red-400" />, label: "Battery <12.0V" },
    { icon: <Satellite className="h-3.5 w-3.5 text-emerald-400" />, label: "GPS live (<5 min)" },
    { icon: <Satellite className="h-3.5 w-3.5 text-yellow-400" />, label: "GPS stale (>30 min)" },
    { icon: <Satellite className="h-3.5 w-3.5 text-red-400" />, label: "GPS offline (>2 hr)" },
  ];

  const badgeRows = [
    { icon: "🚗", label: "Door open" },
    { icon: "📦", label: "Trunk open" },
    { icon: "💨", label: "Smoke detected" },
    { icon: "🔒", label: "Starter disabled" },
    { icon: "🔑", label: "Engine running" },
  ];

  // Filter badges by audience — same logic as the marker density
  const filteredBadges = badgeRows.filter((_, i) => {
    if (audience === "customer") return false; // customers only see unlocked
    if (audience === "host") return i !== 2; // no smoke for hosts
    return true; // admin sees all
  });

  return (
    <div className="absolute bottom-3 left-3 z-[1000] max-w-[220px]">
      <div className="overflow-hidden rounded-xl border border-border bg-card/95 shadow-lg backdrop-blur">
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        >
          <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <Car className="h-3.5 w-3.5 text-primary" />
            Marker Guide
          </span>
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
        {open && (
          <div className="space-y-2.5 border-t border-border px-3 py-2.5">
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Car Circle — Overall</p>
              <div className="space-y-1">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {r.icon}
                    <span className="text-[11px] text-foreground">{r.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Dots Below Car</p>
              <div className="space-y-1">
                {dotRows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {r.icon}
                    <span className="text-[11px] text-foreground">{r.label}</span>
                  </div>
                ))}
              </div>
            </div>
            {filteredBadges.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <AlertTriangle className="h-3 w-3 text-red-400" />
                  Red Alert Badges
                </p>
                <div className="space-y-1">
                  {filteredBadges.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px]">{r.icon}</span>
                      <span className="text-[11px] text-foreground">{r.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}