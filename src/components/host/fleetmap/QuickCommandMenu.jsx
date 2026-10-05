import React from "react";
import { Lock, Unlock, Navigation, Volume2, Power } from "lucide-react";

/**
 * QuickCommandMenu — small popover that appears on long-press of a vehicle marker.
 * Shows quick GPS commands: Lock, Unlock, Locate (horn/lights), and starter kill toggle.
 */
export default function QuickCommandMenu({ vehicle, device, position, onClose, onCommand }) {
  if (!vehicle || !position) return null;

  const hasGps = !!device?.id;
  if (!hasGps) {
    return (
      <>
        <div style={{ position: "fixed", inset: 0, zIndex: 85 }} onClick={onClose} />
        <div style={{
          position: "fixed", top: position.y, left: position.x,
          transform: "translate(-50%, -100%)",
          background: "#17181C", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 14, padding: "12px 16px", zIndex: 86,
          boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
          maxWidth: 220,
        }}>
          <p style={{ fontSize: 12, color: "#8E8E93", margin: 0, textAlign: "center" }}>
            No GPS device on this vehicle. Quick controls require a telematics device.
          </p>
        </div>
      </>
    );
  }

  const commands = [
    { type: "lock", icon: Lock, label: "Lock", color: "#22C55E" },
    { type: "unlock", icon: Unlock, label: "Unlock", color: "#3B82F6" },
    { type: "find", icon: Navigation, label: "Locate", color: "#F59E0B" },
    { type: "horn", icon: Volume2, label: "Horn", color: "#EC4899" },
  ];

  if (device?.supports_starter_interrupt) {
    commands.push({
      type: device?.starter_disabled ? "restore" : "kill",
      icon: Power,
      label: device?.starter_disabled ? "Enable Starter" : "Disable Starter",
      color: device?.starter_disabled ? "#22C55E" : "#FF453A",
    });
  }

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 85 }} onClick={onClose} />
      <div style={{
        position: "fixed", top: position.y, left: position.x,
        transform: "translate(-50%, -100%)",
        background: "#17181C", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 16, padding: 10, zIndex: 86,
        boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
        display: "flex", flexDirection: "column", gap: 4,
        maxWidth: 200,
      }}>
        <p style={{ fontSize: 10, color: "#8E8E93", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 8px 6px", margin: 0 }}>
          {vehicle.display_name || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}
        </p>
        {commands.map((cmd) => (
          <button
            key={cmd.type}
            onClick={() => { onCommand(cmd.type); onClose(); }}
            className="control-tap"
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 10,
              background: "transparent", border: "none", cursor: "pointer",
              transition: "background 0.15s", width: "100%", textAlign: "left",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <cmd.icon size={18} color={cmd.color} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#F5F5F7" }}>{cmd.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}