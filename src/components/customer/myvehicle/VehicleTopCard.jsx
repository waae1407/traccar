import React from "react";

export default function VehicleTopCard({ addressLine, statusLabel = "PARKED" }) {
  return (
    <div
      style={{
        borderRadius: 20,
        padding: "10px 16px 12px",
        background:
          "linear-gradient(135deg, rgba(22,70,40,0.72) 0%, rgba(14,18,16,0.72) 55%, rgba(12,14,14,0.78) 100%)",
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
              color: "#E6C45A",
              border: "1.5px solid rgba(212,175,55,0.85)",
              borderRadius: 999,
              padding: "2px 14px",
              background: "rgba(20,16,4,0.6)",
              boxShadow: "0 0 10px rgba(212,175,55,0.25)",
            }}
          >
            {statusLabel}
          </span>
        </div>
      </div>
      <div style={{ textAlign: "center", marginTop: 6 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#FFF", letterSpacing: "0.02em" }}>
          {addressLine}
        </span>
      </div>
    </div>
  );
}