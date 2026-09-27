import React, { useState } from "react";
import { Activity, MapPin, Battery, Power, X, Zap, Settings2, AlertTriangle } from "lucide-react";

function getBatteryInfo(device) {
  const voltage = device?.power_voltage || device?.battery_voltage || 0;
  if (!voltage) return { pct: 0, label: "Unknown", color: "#71717A", voltage: "0.0", isLow: false, isCritical: false };

  let pct = 0;
  if (device?.ignition_status === 'on' || voltage >= 13.0) {
    pct = 100;
  } else {
    pct = Math.max(0, Math.min(100, Math.round(((voltage - 11.8) / (12.6 - 11.8)) * 100)));
  }

  let label = "Good";
  let color = "#30D158";
  let isLow = false;
  let isCritical = false;

  if (voltage < 11.6) {
    label = "Critical";
    color = "#FF453A";
    isLow = true;
    isCritical = true;
  } else if (voltage < 12.0) {
    label = "Low";
    color = "#FF9F0A";
    isLow = true;
  } else if (voltage <= 12.3) {
    label = "Fair";
    color = "#FF9F0A";
    isLow = true;
  }

  if (device?.ignition_status === 'on' || voltage >= 13.0) {
    label = "Charging";
    color = "#30D158";
    isLow = false;
    isCritical = false;
  }

  return { pct, label, color, voltage: voltage.toFixed(1), isLow, isCritical };
}

function formatTime(value) {
  if (!value) return "Unknown";
  const d = new Date(value);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
}

export default function VehicleHealthGrid({ device, gps, onOpenDiagnostics }) {
  const [selected, setSelected] = useState(null);
  const battInfo = getBatteryInfo(device);

  const monitors = [
    {
      key: "connection",
      label: "Connection",
      sub: device?.online_status === "offline" ? "Offline" : "Online",
      icon: Activity,
      color: device?.online_status === "offline" ? "#FF453A" : "#30D158",
      detail: {
        title: "Connection Status",
        rows: [
          { label: "Status", value: device?.online_status === "offline" ? "Offline" : "Online", alert: device?.online_status === "offline" },
          { label: "Last Seen", value: formatTime(device?.last_seen_at) },
          { label: "Signal Strength", value: device?.signal_strength ? `${device.signal_strength}%` : "N/A" },
          { label: "Protocol", value: device?.provider_type?.toUpperCase() || "N/A" },
        ],
      },
    },
    {
      key: "gps",
      label: "GPS Status",
      sub: gps.status === "online" ? "Active" : "Lost",
      icon: MapPin,
      color: gps.status === "online" ? "#30D158" : "#FF453A",
      detail: {
        title: "GPS Status",
        rows: [
          { label: "Status", value: gps.status === "online" ? "Active" : "Lost", alert: gps.status !== "online" },
          { label: "Last Update", value: formatTime(device?.location_updated_at) },
          { label: "Latitude", value: device?.last_latitude ? device.last_latitude.toFixed(6) : "N/A" },
          { label: "Longitude", value: device?.last_longitude ? device.last_longitude.toFixed(6) : "N/A" },
          { label: "Speed", value: device?.speed ? `${Math.round(device.speed)} mph` : "0 mph" },
        ],
      },
    },
    {
      key: "battery",
      label: "Main Batt",
      sub: battInfo.pct > 0 ? `${battInfo.pct}%` : "N/A",
      icon: Battery,
      color: battInfo.color,
      isLow: battInfo.isLow,
      detail: {
        title: "Battery Health",
        rows: [
          { label: "Charge Level", value: battInfo.pct > 0 ? `${battInfo.pct}%` : "N/A" },
          { label: "Voltage", value: `${battInfo.voltage}V`, alert: battInfo.isLow },
          { label: "Health", value: battInfo.label, alert: battInfo.isCritical },
          { label: "Ignition", value: device?.ignition_status === "on" ? "Charging" : "Off" },
        ],
        showChargeRecommendation: battInfo.isLow,
        battInfo,
      },
    },
    {
      key: "ignition",
      label: "Ignition",
      sub: device?.ignition_status === "on" ? "On" : "Off",
      icon: Power,
      color: device?.ignition_status === "on" ? "#30D158" : "#71717A",
      detail: {
        title: "Ignition Status",
        rows: [
          { label: "Status", value: device?.ignition_status === "on" ? "On" : "Off" },
          { label: "Speed", value: device?.speed ? `${Math.round(device.speed)} mph` : "0 mph" },
          { label: "Heading", value: device?.course != null ? `${Math.round(device.course)}°` : "N/A" },
        ],
      },
    },
  ];

  const handleChargeRecommendation = async () => {
    const { toast } = await import("sonner");
    toast.info("Charge Recommendation", {
      description: "Start the vehicle and let it run for 30 minutes to recharge the battery. Driving is even more effective than idling.",
      duration: 6000,
    });
    setSelected(null);
  };

  return (
    <div style={{ marginBottom: 10 }}>
      <div className="flex items-center justify-between mb-2">
        <p style={{ fontSize: 11, fontWeight: 700, color: "#71717A", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Vehicle Health
        </p>
      </div>
      <div style={{
        background: "#17181C",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 22,
        padding: "16px 8px",
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "16px 4px",
      }}>
        {monitors.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => setSelected(item)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                background: "none", border: "none", cursor: "pointer", padding: 0,
                transition: "transform 0.15s ease",
              }}
              className="control-tap"
            >
              <Icon
                size={18}
                color={item.color}
                style={{ filter: `drop-shadow(0 2px 8px ${item.color}66)` }}
              />
              <p style={{ fontSize: 10, color: "#A1A1AA", textAlign: "center", lineHeight: 1.2 }}>{item.label}</p>
              <p style={{ fontSize: 11, fontWeight: 600, color: item.color !== "#71717A" ? item.color : "#FFFFFF", textAlign: "center", lineHeight: 1.2 }}>{item.sub}</p>
            </button>
          );
        })}
      </div>

      <button
        onClick={onOpenDiagnostics}
        style={{
          width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16, padding: "12px", display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8, marginTop: 12, cursor: "pointer", transition: "all 0.2s"
        }}
      >
        <Settings2 size={16} color="#A1A1AA" />
        <span style={{ fontSize: 13, fontWeight: 600, color: "#E4E4E7" }}>View Full Diagnostics</span>
      </button>

      {/* ── MONITOR DETAIL SHEET ── */}
      {selected && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end"
        }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={() => setSelected(null)} />
          <div style={{
            position: "relative", background: "#17181C", borderTop: "1px solid rgba(255,255,255,0.1)",
            borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: "24px 20px 40px",
            boxShadow: "0 -10px 40px rgba(0,0,0,0.5)", animation: "fade-in-up 0.3s ease-out",
            maxHeight: "85vh", display: "flex", flexDirection: "column"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexShrink: 0 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#FFF", margin: 0 }}>{selected.detail.title}</h3>
                <p style={{ fontSize: 12, color: "#A1A1AA", margin: "2px 0 0" }}>Tap any monitor for details</p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={16} color="#FFF" />
              </button>
            </div>

            <div style={{ overflowY: "auto", flex: 1, paddingRight: 4, paddingBottom: 20 }} className="no-scrollbar">
              {/* Monitor icon header */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, padding: "16px", background: "rgba(255,255,255,0.03)", borderRadius: 18, border: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: `${selected.color}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <selected.icon size={24} color={selected.color} style={{ filter: `drop-shadow(0 2px 8px ${selected.color}66)` }} />
                </div>
                <div>
                  <p style={{ fontSize: 13, color: "#A1A1AA", margin: 0 }}>{selected.label}</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: selected.color, margin: "2px 0 0", letterSpacing: "-0.3px" }}>{selected.sub}</p>
                </div>
              </div>

              {/* Detail rows */}
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.05)", padding: "12px 16px", display: "grid", gap: 12, marginBottom: 16 }}>
                {selected.detail.rows.map((row) => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "#A1A1AA" }}>{row.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: row.alert ? (selected.color) : "#F5F5F7" }}>{row.value}</span>
                  </div>
                ))}
              </div>

              {/* Battery charge recommendation */}
              {selected.detail.showChargeRecommendation && (
                <div style={{
                  background: "rgba(255,159,10,0.08)",
                  border: "1px solid rgba(255,159,10,0.3)",
                  borderRadius: 18,
                  padding: 16,
                  marginBottom: 16,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <AlertTriangle size={18} color="#FF9F0A" />
                    <p style={{ fontSize: 14, fontWeight: 700, color: "#FFF", margin: 0 }}>Low Battery Detected</p>
                  </div>
                  <p style={{ fontSize: 12, color: "#A1A1AA", margin: "0 0 14px", lineHeight: 1.5 }}>
                    Battery voltage is {selected.detail.battInfo.voltage}V ({selected.detail.battInfo.label}). Start and run the vehicle for 30 minutes to recharge.
                  </p>
                  <button
                    onClick={handleChargeRecommendation}
                    style={{
                      width: "100%",
                      background: "linear-gradient(135deg, #FF9F0A, #FF6B00)",
                      border: "none", borderRadius: 16, padding: "14px",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      color: "#FFF", fontSize: 14, fontWeight: 700, cursor: "pointer",
                      boxShadow: "0 4px 16px rgba(255,159,10,0.3)",
                    }}
                    className="control-tap"
                  >
                    <Zap size={16} color="#FFF" />
                    Start & Run 30 min to Charge
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}