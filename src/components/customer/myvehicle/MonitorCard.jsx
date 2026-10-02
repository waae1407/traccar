import React, { useState } from "react";
import { Gauge, ShieldCheck, BatteryMedium, ParkingCircle, ChevronDown } from "lucide-react";

/**
 * MonitorCard — replaces the old "SAFE DRIVER" checkmark pill.
 *
 * A compact, tappable card that hugs the map pin. Collapsed it shows a subtle
 * status dot (green = all clear, amber = watch). Tapping expands a small glass
 * card listing exactly what's being monitored with live values:
 *   Speed · Idle/Parked · Security · Battery
 */
function statusDotColor(device) {
  const alarms = [device?.shock_alarm, device?.power_cut_alarm, device?.low_battery_alarm,
    device?.overspeed_alarm, device?.movement_alarm, device?.geofence_alarm];
  if (alarms.some(Boolean)) return "#FF9F0A";
  if (device?.door_open || device?.trunk_open) return "#FF9F0A";
  return "#50C878";
}

function idleStr(device) {
  if (device?.speed > 0 || device?.ignition_status === "on") return "Driving";
  if (!device?.parked_at) return "—";
  const ms = Date.now() - new Date(device.parked_at).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just parked";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function MonitorCard({ device, battInfo, gps }) {
  const [open, setOpen] = useState(false);
  const dotColor = statusDotColor(device);
  const speedVal = device?.speed > 0 ? `${Math.round(device.speed)} mph` : "0 mph";
  const securityVal = device?.door_open || device?.trunk_open
    ? `${device?.door_open ? "Door" : ""}${device?.door_open && device?.trunk_open ? " + " : ""}${device?.trunk_open ? "Trunk" : ""} open`
    : "Secured";
  const securityAlert = device?.door_open || device?.trunk_open;

  const monitors = [
    { icon: <Gauge size={14} />, label: "Speed", value: speedVal, alert: false },
    { icon: <ParkingCircle size={14} />, label: "Idle", value: idleStr(device), alert: false },
    { icon: <ShieldCheck size={14} />, label: "Security", value: securityVal, alert: securityAlert },
    { icon: <BatteryMedium size={14} />, label: "Battery", value: `${battInfo?.voltage || "—"}V · ${battInfo?.label || "—"}`, alert: battInfo?.color === "#FF453A" },
  ];

  return (
    <div
      style={{
        position: "absolute",
        top: "calc(50% + 14px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 12,
        pointerEvents: "auto",
        maxWidth: 260,
      }}
    >
      {/* Collapsed: subtle dot + tap hint */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="control-tap"
          aria-label="Show monitored signals"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "5px 12px 5px 10px",
            borderRadius: 999,
            background: "rgba(10,10,12,0.78)",
            border: "1px solid rgba(255,255,255,0.12)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              width: 8, height: 8, borderRadius: "50%", background: dotColor,
              boxShadow: `0 0 8px ${dotColor}80`,
            }}
          />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "rgba(255,255,255,0.85)" }}>
            MONITORS
          </span>
          <ChevronDown size={12} color="rgba(255,255,255,0.5)" />
        </button>
      )}

      {/* Expanded: glass card with live monitor values */}
      {open && (
        <div
          style={{
            background: "rgba(10,10,12,0.92)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(212,175,55,0.22)",
            borderRadius: 16,
            padding: "12px 14px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            animation: "fade-in-up 0.2s ease-out",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, boxShadow: `0 0 8px ${dotColor}80` }} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "#FFF" }}>LIVE MONITORS</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Hide monitors"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" }}
            >
              <ChevronDown size={14} color="rgba(255,255,255,0.5)" style={{ transform: "rotate(180deg)" }} />
            </button>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {monitors.map((m) => (
              <div key={m.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: m.alert ? "#FF9F0A" : "rgba(255,255,255,0.55)" }}>{m.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{m.label}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: m.alert ? "#FF9F0A" : "#F5F5F7" }}>{m.value}</span>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", margin: "10px 0 0", textAlign: "center", letterSpacing: "0.03em" }}>
            GPS · {gps?.label || "—"}
          </p>
        </div>
      )}
    </div>
  );
}