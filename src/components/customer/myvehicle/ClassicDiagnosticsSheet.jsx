import React from "react";
import { X } from "lucide-react";

function getCompassDirection(course) {
  if (course === undefined || course === null) return "Unknown";
  const val = course % 360;
  if (val >= 337.5 || val < 22.5) return `${val}° (North)`;
  if (val < 67.5) return `${val}° (NE)`;
  if (val < 112.5) return `${val}° (East)`;
  if (val < 157.5) return `${val}° (SE)`;
  if (val < 202.5) return `${val}° (South)`;
  if (val < 247.5) return `${val}° (SW)`;
  if (val < 292.5) return `${val}° (West)`;
  return `${val}° (NW)`;
}

function DiagRow({ label, value, isAlert }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "#A1A1AA" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: isAlert ? "#FF453A" : "#F5F5F7" }}>{value}</span>
    </div>
  );
}

function Section({ title, last, children }) {
  return (
    <div style={{ marginBottom: last ? 0 : 20 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#71717A", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 10px 0" }}>{title}</p>
      <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.05)", padding: "12px 16px", display: "grid", gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

// Bottom sheet with raw telemetry for the Classic My Vehicle screen.
export default function ClassicDiagnosticsSheet({ device, onClose }) {
  const flag = (v) => (v ? "Triggered" : "Clear");
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div style={{
        position: "relative", background: "#17181C", borderTop: "1px solid rgba(255,255,255,0.1)",
        borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: "24px 20px 40px",
        boxShadow: "0 -10px 40px rgba(0,0,0,0.5)", animation: "fade-in-up 0.3s ease-out",
        maxHeight: "85vh", display: "flex", flexDirection: "column"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#FFF", margin: 0 }}>System Diagnostics</h3>
            <p style={{ fontSize: 12, color: "#A1A1AA", margin: "2px 0 0" }}>Raw telemetry from MT20 interface</p>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={16} color="#FFF" />
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, paddingRight: 4, paddingBottom: 20 }} className="no-scrollbar">
          <Section title="Security & Access">
            <DiagRow label="Doors" value={device?.door_open ? "Open" : "Closed"} isAlert={device?.door_open} />
            <DiagRow label="Trunk" value={device?.trunk_open ? "Open" : "Closed"} isAlert={device?.trunk_open} />
            <DiagRow label="Starter Circuit" value={device?.starter_disabled ? "Disabled" : "Normal"} isAlert={device?.starter_disabled} />
            <DiagRow label="Hood Wire Volt" value={device?.hood_wire_voltage ? `${device.hood_wire_voltage}V (Analog)` : "0.0V (Analog)"} />
            <DiagRow label="Door Wire Volt" value={device?.door_wire_voltage ? `${device.door_wire_voltage}V (Analog)` : "0.0V (Analog)"} />
          </Section>
          <Section title="System Alarms">
            <DiagRow label="Impact / Shock" value={flag(device?.shock_alarm)} isAlert={device?.shock_alarm} />
            <DiagRow label="Power Cut" value={flag(device?.power_cut_alarm)} isAlert={device?.power_cut_alarm} />
            <DiagRow label="Low Battery" value={flag(device?.low_battery_alarm)} isAlert={device?.low_battery_alarm} />
            <DiagRow label="Overspeed" value={flag(device?.overspeed_alarm)} isAlert={device?.overspeed_alarm} />
            <DiagRow label="Movement" value={flag(device?.movement_alarm)} isAlert={device?.movement_alarm} />
            <DiagRow label="Geofence" value={flag(device?.geofence_alarm)} isAlert={device?.geofence_alarm} />
          </Section>
          <Section title="Environmental">
            <DiagRow label="Smoke Sensor" value={device?.smoke_detected ? "Detected" : "Clear"} isAlert={device?.smoke_detected} />
            <DiagRow label="Smoke Voltage" value={device?.smoke_voltage ? `${device.smoke_voltage}V (Analog)` : "0.0V (Analog)"} />
          </Section>
          <Section title="Raw Data" last>
            <DiagRow label="Bluetooth" value={device?.bluetooth_on ? "Active" : "Inactive"} />
            <DiagRow label="Direction Heading" value={getCompassDirection(device?.course)} />
            <DiagRow label="Device Mileage" value={device?.device_mileage ? `${device.device_mileage.toLocaleString()} miles` : "0 miles"} />
          </Section>
        </div>
      </div>
    </div>
  );
}