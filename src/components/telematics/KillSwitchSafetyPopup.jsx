import React, { useState } from "react";
import { createPortal } from "react-dom";
import { ShieldAlert, Car, Clock, X } from "lucide-react";
import TelematicsService from "@/lib/telematics/TelematicsService";

const LABEL_FONT = "'Barlow Condensed', sans-serif";

/**
 * KillSwitchSafetyPopup — Shown when a manual starter-kill is blocked because
 * the vehicle is moving. Offers two choices:
 *   1. "Park command" — queues the kill for auto-dispatch when the vehicle stops (15-min TTL).
 *   2. "Cancel" — aborts the kill entirely.
 *
 * Props:
 *   blockedData: { speed, ignition_status, device_id, vehicle_id, booking_id, reason } | null
 *   onClose: () => void
 *   onParked: (result) => void  — called after the parked command is created
 */
export default function KillSwitchSafetyPopup({ blockedData, onClose, onParked }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!blockedData) return null;

  const speed = Number(blockedData.speed) || 0;
  const ignition = blockedData.ignition_status || "unknown";

  const handlePark = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await TelematicsService.sendCommand({
        telematics_device_id: blockedData.device_id,
        vehicle_id: blockedData.vehicle_id || "",
        booking_id: blockedData.booking_id || "",
        command_type: "disable_starter",
        source: "vehicle_command_center",
        reason: blockedData.reason || "Manual kill — parked for auto-dispatch",
        confirm_starter_command: true,
        park_until_stopped: true,
      });
      onParked?.(res.data);
      onClose();
    } catch (err) {
      setError(err?.message || "Failed to park command. Please try again.");
    }
    setLoading(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-sm rounded-3xl border border-red-500/30 bg-card p-6 shadow-2xl animate-fade-in-up">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-lg hover:bg-secondary transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 border-2 border-red-500/30">
            <ShieldAlert className="h-8 w-8 text-red-400" />
          </div>
        </div>

        {/* Title */}
        <h2
          className="text-center text-xl font-bold text-foreground mb-2"
          style={{ fontFamily: LABEL_FONT, textTransform: "uppercase", letterSpacing: "0.03em" }}
        >
          Vehicle Is Moving
        </h2>
        <p className="text-center text-sm text-muted-foreground mb-5 leading-relaxed">
          For safety reasons, the starter kill cannot be sent while the vehicle is in motion.
          The vehicle is currently reporting <span className="font-semibold text-foreground">{speed} mph</span>
          {ignition !== "unknown" && ` with ignition ${ignition}`}.
        </p>

        {/* Options */}
        <div className="space-y-3">
          <button
            onClick={handlePark}
            disabled={loading}
            className="control-tap w-full rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center gap-3 disabled:opacity-50 hover:bg-amber-500/15 transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 shrink-0">
              {loading ? (
                <Clock className="h-5 w-5 text-amber-400 animate-spin" />
              ) : (
                <Clock className="h-5 w-5 text-amber-400" />
              )}
            </div>
            <div className="flex-1 text-left">
              <p
                className="text-sm font-bold text-foreground"
                style={{ fontFamily: LABEL_FONT, textTransform: "uppercase", letterSpacing: "0.03em" }}
              >
                Park Command
              </p>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                Send automatically when the vehicle stops (within 15 min)
              </p>
            </div>
          </button>

          <button
            onClick={onClose}
            disabled={loading}
            className="control-tap w-full rounded-2xl border border-border bg-secondary/50 p-4 flex items-center gap-3 disabled:opacity-50 hover:bg-secondary transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary shrink-0">
              <Car className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 text-left">
              <p
                className="text-sm font-bold text-foreground"
                style={{ fontFamily: LABEL_FONT, textTransform: "uppercase", letterSpacing: "0.03em" }}
              >
                Cancel
              </p>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                Abort the kill command entirely
              </p>
            </div>
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}