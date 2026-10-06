import React from "react";
import { X, MapPin } from "lucide-react";
import GeofenceConfig from "@/components/gps/GeofenceConfig";

const LABEL_FONT = "'Barlow Condensed', sans-serif";

/**
 * Full-screen geofence management overlay — mirrors the DriveHistoryReplay
 * overlay pattern. Opens directly from the vehicle action sheet so the host
 * can create / toggle / delete geofence alerts for the selected device
 * without navigating away to hunt for the section.
 */
export default function GeofenceManagerOverlay({ vehicle, device, user, onClose }) {
  if (!device?.id) return null;

  const name = vehicle?.display_name || [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || "Vehicle";

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15">
            <MapPin className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight" style={{ fontFamily: LABEL_FONT, textTransform: "uppercase", letterSpacing: "0.03em" }}>
              Geofencing
            </h1>
            <p className="text-xs text-muted-foreground leading-tight">{name}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <X className="h-5 w-5 text-foreground" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-5 bg-background">
        <div className="mx-auto w-full max-w-md">
          {!device.last_latitude || !device.last_longitude ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <MapPin className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm font-semibold text-foreground mb-1">No GPS position yet</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your device hasn't reported a location yet. Geofence alerts need a known position to anchor the alert center. Once the device checks in, come back here to set it up.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-4">
              <GeofenceConfig device={device} user={user} />
            </div>
          )}

          {/* How it works */}
          <div className="mt-4 rounded-2xl border border-border bg-card/50 p-4">
            <p className="text-xs font-bold text-foreground mb-2" style={{ fontFamily: LABEL_FONT, textTransform: "uppercase", letterSpacing: "0.03em" }}>
              How it works
            </p>
            <ul className="space-y-1.5 text-xs text-muted-foreground leading-relaxed">
              <li>• Checked every 5 minutes against your device's live GPS position.</li>
              <li>• Breach sends push + email + SMS with a Google Maps link to the vehicle.</li>
              <li>• Repeat alerts are suppressed for 15 minutes to avoid spam.</li>
              <li>• "Auto-kill starter" disables the engine on breach — restore manually.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}