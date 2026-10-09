import React, { useState, useEffect } from "react";
import { Bluetooth, X } from "lucide-react";

const STORAGE_PREFIX = "uride-bt-nudge-dismissed:";
const PASSCODE = "123456";

/**
 * One-time Bluetooth pairing nudge for the My Vehicle action dock.
 * Slides in above the GPS address row on first load, shows the device's
 * Bluetooth name (= IMEI) + passcode + a one-line benefit, and is
 * permanently dismissed per-device via localStorage when the renter taps clear.
 *
 * Only renders for Noran MT20 devices (the only model with Bluetooth support).
 */
export default function BluetoothPairingNudge({ device }) {
  const [dismissed, setDismissed] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!device?.id) return;
    const isNoranMt20 = device.provider_key === "traccar_noran_mt20";
    if (!isNoranMt20) return;
    const key = STORAGE_PREFIX + device.id;
    const wasDismissed = localStorage.getItem(key) === "1";
    if (wasDismissed) return;
    setDismissed(false);
    // Slow slide-in after a brief delay so it doesn't fight the map load
    const t = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(t);
  }, [device?.id, device?.provider_key]);

  const handleDismiss = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!device?.id) return;
    localStorage.setItem(STORAGE_PREFIX + device.id, "1");
    setVisible(false);
    // Wait for slide-out animation before removing from DOM
    setTimeout(() => setDismissed(true), 400);
  };

  if (dismissed) return null;

  const btName = device?.imei || device?.unique_id || "Unknown";

  return (
    <div
      style={{
        width: "100%",
        padding: "0 14px 10px 14px",
        pointerEvents: "auto",
        transform: visible ? "translateX(0)" : "translateX(-110%)",
        opacity: visible ? 1 : 0,
        transition: "transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "rgba(23,24,28,0.92)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(59,130,246,0.35)",
          borderRadius: 14,
          padding: "10px 12px",
          boxShadow: "0 0 18px rgba(59,130,246,0.15)",
        }}
      >
        {/* BT icon */}
        <div
          style={{
            flexShrink: 0,
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "rgba(59,130,246,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Bluetooth size={18} color="#3B82F6" strokeWidth={2.4} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#F5F5F7",
              margin: 0,
              lineHeight: 1.2,
              letterSpacing: "-0.1px",
            }}
          >
            Pair for auto lock/unlock as you approach
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
            <span style={{ fontSize: 11, color: "#A1A1AA", fontWeight: 400 }}>
              BT: <span style={{ color: "#93C5FD", fontWeight: 600 }}>{btName}</span>
            </span>
            <span style={{ width: 1, height: 10, background: "rgba(255,255,255,0.12)" }} />
            <span style={{ fontSize: 11, color: "#A1A1AA", fontWeight: 400 }}>
              Passcode:{" "}
              <span style={{ color: "#93C5FD", fontWeight: 700, letterSpacing: "0.1em" }}>
                {PASSCODE}
              </span>
            </span>
          </div>
        </div>

        {/* Clear button */}
        <button
          onClick={handleDismiss}
          aria-label="Dismiss Bluetooth pairing info"
          style={{
            flexShrink: 0,
            width: 28,
            height: 28,
            borderRadius: 8,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <X size={14} color="#A1A1AA" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}