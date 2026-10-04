import React, { useState } from "react";
import { ChevronDown, Activity } from "lucide-react";

const LABEL_FONT = "'Barlow Condensed', sans-serif";

function DiagRow({ label, value, isAlert }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "#A1A1AA" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: isAlert ? "#FF453A" : "#F5F5F7" }}>{value}</span>
    </div>
  );
}

function Group({ title, children, last }) {
  return (
    <div style={{ marginBottom: last ? 0 : 14 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#71717A", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 8px 0" }}>{title}</p>
      <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", padding: "10px 14px", display: "grid", gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function getCompassDirection(course) {
  if (course === undefined || course === null) return "Unknown";
  const val = course % 360;
  if (val >= 337.5 || val < 22.5) return `${val}° N`;
  if (val < 67.5) return `${val}° NE`;
  if (val < 112.5) return `${val}° E`;
  if (val < 157.5) return `${val}° SE`;
  if (val < 202.5) return `${val}° S`;
  if (val < 247.5) return `${val}° SW`;
  if (val < 292.5) return `${val}° W`;
  return `${val}° NW`;
}

/**
 * AdditionalMonitorsSection — inline expandable card showing extra monitored
 * telemetry (security, alarms, environmental, raw). Placed after the End Your
 * Rental button on the My Vehicle screen.
 */
export default function AdditionalMonitorsSection({ device }) {
  const [open, setOpen] = useState(false);
  const flag = (v) => (v ? "Triggered" : "Clear");

  return (
    <div style={{ marginBottom: 10 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          background: "rgba(26,26,26,0.72)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 18,
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: "pointer",
          transition: "all 0.2s",
        }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 12,
          background: "rgba(47,128,255,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Activity size={18} color="#2F80FF" />
        </div>
        <div style={{ flex: 1, textAlign: "left" }}>
          <p style={{ fontSize: 17, fontWeight: 800, color: "#FFFFFF", fontFamily: LABEL_FONT, letterSpacing: "0.03em", textTransform: "uppercase", lineHeight: 1.1, margin: 0 }}>
            Additional Monitors
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 3 }}>
            Doors · Alarms · Smoke · Diagnostics
          </p>
        </div>
        <ChevronDown
          size={18}
          color="#71717A"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.25s ease" }}
        />
      </button>

      {open && (
        <div style={{
          marginTop: 8,
          background: "rgba(26,26,26,0.72)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 18,
          padding: "16px 18px",
          animation: "fade-in-up 0.25s ease-out",
        }}>
          <Group title="Security & Access">
            <DiagRow label="Doors" value={device?.door_open ? "Open" : "Closed"} isAlert={device?.door_open} />
            <DiagRow label="Trunk" value={device?.trunk_open ? "Open" : "Closed"} isAlert={device?.trunk_open} />
            <DiagRow label="Starter Circuit" value={device?.starter_disabled ? "Disabled" : "Normal"} isAlert={device?.starter_disabled} />
            <DiagRow label="Hood Wire Volt" value={device?.hood_wire_voltage ? `${device.hood_wire_voltage}V` : "0.0V"} />
            <DiagRow label="Door Wire Volt" value={device?.door_wire_voltage ? `${device.door_wire_voltage}V` : "0.0V"} />
          </Group>
          <Group title="System Alarms">
            <DiagRow label="Impact / Shock" value={flag(device?.shock_alarm)} isAlert={device?.shock_alarm} />
            <DiagRow label="Power Cut" value={flag(device?.power_cut_alarm)} isAlert={device?.power_cut_alarm} />
            <DiagRow label="Low Battery" value={flag(device?.low_battery_alarm)} isAlert={device?.low_battery_alarm} />
            <DiagRow label="Overspeed" value={flag(device?.overspeed_alarm)} isAlert={device?.overspeed_alarm} />
            <DiagRow label="Movement" value={flag(device?.movement_alarm)} isAlert={device?.movement_alarm} />
            <DiagRow label="Geofence" value={flag(device?.geofence_alarm)} isAlert={device?.geofence_alarm} />
          </Group>
          <Group title="Environmental">
            <DiagRow label="Smoke Sensor" value={device?.smoke_detected ? "Detected" : "Clear"} isAlert={device?.smoke_detected} />
            <DiagRow label="Smoke Voltage" value={device?.smoke_voltage ? `${device.smoke_voltage}V` : "0.0V"} />
          </Group>
          <Group title="Raw Data" last>
            <DiagRow label="Bluetooth" value={device?.bluetooth_on ? "Active" : "Inactive"} />
            <DiagRow label="Heading" value={getCompassDirection(device?.course)} />
            <DiagRow label="Device Mileage" value={device?.device_mileage ? `${device.device_mileage.toLocaleString()} mi` : "0 mi"} />
          </Group>
        </div>
      )}
    </div>
  );
}