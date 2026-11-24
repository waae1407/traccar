import React from "react";
import { AlertTriangle } from "lucide-react";
import ScreenChrome, { ScreenRow } from "./ScreenChrome";

/** Mirrors the live PayNowCard state a renter sees when a week's charge fails. */
export default function PaymentGuardScreen() {
  return (
    <ScreenChrome title="My Vehicle">
      <div
        style={{
          borderRadius: 14,
          background: "rgba(239,68,68,0.12)",
          border: "1px solid rgba(239,68,68,0.45)",
          padding: "12px 13px",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <AlertTriangle size={16} color="#EF4444" style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 10.5,
                fontWeight: 800,
                color: "#EF4444",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Payment Failed — Week 3
            </p>
            <p style={{ margin: "5px 0 0", fontSize: 26, fontWeight: 800, letterSpacing: "-0.6px" }}>
              $285.00
            </p>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 10.5,
                color: "rgba(255,255,255,0.62)",
                lineHeight: 1.45,
              }}
            >
              Vehicle start is restricted until this week is settled.
            </p>
          </div>
        </div>
        <div
          style={{
            marginTop: 11,
            height: 34,
            borderRadius: 10,
            background: "#f50079",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.08em",
          }}
        >
          PAY NOW
        </div>
      </div>

      <ScreenRow label="Payment method" value="Visa •••• 4242" />
      <ScreenRow label="Next auto retry" value="in 1h 58m" />
      <ScreenRow label="Vehicle" value="2021 Toyota Camry" />

      <div
        style={{
          marginTop: "auto",
          fontSize: 9.5,
          color: "#8E8E93",
          lineHeight: 1.5,
          paddingLeft: 2,
        }}
      >
        Start restores automatically the moment payment clears.
      </div>
    </ScreenChrome>
  );
}