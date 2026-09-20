import React, { useState } from "react";
import { ChevronDown, ChevronUp, Car, Battery, Satellite, AlertTriangle, HelpCircle } from "lucide-react";

// Legend overlay explaining what CAUSES each health marker color.
// Shows the trigger conditions, not just the color names.
export default function VehicleHealthLegend({ audience = "admin" }) {
  const [open, setOpen] = useState(false);

  const carCircleRows = [
    { color: "bg-emerald-500", label: "Healthy", cause: "Battery ≥12.2V, GPS fresh, no alerts" },
    { color: "bg-yellow-500", label: "Warning", cause: "Battery 12.0–12.2V, GPS stale >30min, or door/trunk open" },
    { color: "bg-red-500", label: "Critical", cause: "Battery <12.0V, GPS offline >2hr, or smoke detected" },
    { color: "bg-gray-500", label: "Stale data", cause: "No voltage AND no position update in 15+ min" },
  ];

  const batteryRows = [
    { color: "bg-emerald-500", label: "≥12.2V", cause: "Healthy — vehicle will start" },
    { color: "bg-yellow-500", label: "12.0–12.2V", cause: "Low — charge soon, may not hold long" },
    { color: "bg-red-500", label: "<12.0V", cause: "Critical — vehicle may not start" },
    { color: "bg-gray-500", label: "No data", cause: "No voltage reading in 15+ min" },
  ];

  const gpsRows = [
    { color: "bg-emerald-500", label: "Live", cause: "Position updated <5 min ago" },
    { color: "bg-yellow-500", label: "Stale", cause: "No position update in 30+ min" },
    { color: "bg-red-500", label: "Offline", cause: "Device offline or no position in 2+ hours" },
  ];

  const badgeRows = [
    { icon: "🚗", label: "Door open", cause: "Door sensor triggered open" },
    { icon: "📦", label: "Trunk open", cause: "Trunk sensor triggered open" },
    { icon: "💨", label: "Smoke detected", cause: "Onboard smoke alarm active" },
    { icon: "🔒", label: "Starter disabled", cause: "Relay kill command sent (payment or admin)" },
    { icon: "🔑", label: "Engine running", cause: "Ignition detected as ON" },
  ];

  const filteredBadges = badgeRows.filter((_, i) => {
    if (audience === "customer") return false;
    if (audience === "host") return i !== 2;
    return true;
  });

  return (
    <div className="absolute bottom-3 left-3 z-[1000] max-w-[260px]">
      <div className="overflow-hidden rounded-xl border border-border bg-card/95 shadow-lg backdrop-blur">
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        >
          <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <HelpCircle className="h-3.5 w-3.5 text-primary" />
            What the lights mean
          </span>
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
        {open && (
          <div className="max-h-[320px] space-y-3 overflow-y-auto border-t border-border px-3 py-2.5">
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <Car className="h-3 w-3 text-primary" /> Car Circle — Overall Health
              </p>
              <div className="space-y-1.5">
                {carCircleRows.map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className={`mt-0.5 h-3 w-3 flex-shrink-0 rounded-full ${r.color} border border-white`} />
                    <div>
                      <p className="text-[11px] font-bold text-foreground">{r.label}</p>
                      <p className="text-[10px] leading-tight text-muted-foreground">{r.cause}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <Battery className="h-3 w-3 text-emerald-400" /> Battery Dot
              </p>
              <div className="space-y-1.5">
                {batteryRows.map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className={`mt-0.5 h-3 w-3 flex-shrink-0 rounded-full ${r.color} border border-white`} />
                    <div>
                      <p className="text-[11px] font-bold text-foreground">{r.label}</p>
                      <p className="text-[10px] leading-tight text-muted-foreground">{r.cause}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <Satellite className="h-3 w-3 text-emerald-400" /> GPS Dot
              </p>
              <div className="space-y-1.5">
                {gpsRows.map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className={`mt-0.5 h-3 w-3 flex-shrink-0 rounded-full ${r.color} border border-white`} />
                    <div>
                      <p className="text-[11px] font-bold text-foreground">{r.label}</p>
                      <p className="text-[10px] leading-tight text-muted-foreground">{r.cause}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {filteredBadges.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <AlertTriangle className="h-3 w-3 text-red-400" /> Red Alert Badges
                </p>
                <div className="space-y-1.5">
                  {filteredBadges.map((r, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-red-500 text-[8px]">{r.icon}</span>
                      <div>
                        <p className="text-[11px] font-bold text-foreground">{r.label}</p>
                        <p className="text-[10px] leading-tight text-muted-foreground">{r.cause}</p>
                      </div>
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