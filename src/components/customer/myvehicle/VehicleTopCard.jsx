import React, { useState, useEffect } from "react";

const GOLD = "#F9D479";

export default function VehicleTopCard({ addressLine, statusLabel = "PARKED" }) {
  const [timeStr, setTimeStr] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const h12 = now.getHours() % 12 || 12;
      const ampm = now.getHours() >= 12 ? "PM" : "AM";
      const mm = String(now.getMinutes()).padStart(2, "0");
      setTimeStr(`${h12}:${mm} ${ampm}`);
    };
    update();
    const t = setInterval(update, 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      style={{
        borderRadius: 20,
        padding: "10px 16px 12px",
        background:
          "linear-gradient(135deg, rgba(28,28,28,0.78) 0%, rgba(18,18,18,0.78) 55%, rgba(14,14,14,0.82) 100%)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 90 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#50C878",
              boxShadow: "0 0 8px #50C878",
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.04em", color: "#50C878" }}>
            ACTIVE
          </span>
        </div>
        <span style={{ fontSize: 20, fontWeight: 700, color: "#FFF", letterSpacing: "0.01em" }}>
          My Vehicle
        </span>
        <div style={{ minWidth: 90, display: "flex", justifyContent: "flex-end" }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: GOLD,
              border: `1.5px solid ${GOLD}`,
              borderRadius: 999,
              padding: "2px 14px",
              background: "rgba(20,16,4,0.6)",
              boxShadow: `0 0 10px ${GOLD}40`,
            }}
          >
            {statusLabel}
          </span>
        </div>
      </div>
      <div style={{ textAlign: "center", marginTop: 6, display: "flex", justifyContent: "center", gap: 10, alignItems: "baseline" }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: GOLD, letterSpacing: "0.02em" }}>
          {timeStr}
        </span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#FFF", letterSpacing: "0.02em" }}>
          {addressLine}
        </span>
      </div>
    </div>
  );
}