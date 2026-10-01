import React from "react";
import { format } from "date-fns";
import { ChevronDown, Bell, SlidersHorizontal } from "lucide-react";
import SOSButton from "@/components/customer/sos/SOSButton";

function getSecurityInfo(device) {
  const breaches = [];
  if (device?.door_open) breaches.push("Door Open");
  if (device?.trunk_open) breaches.push("Trunk Open");
  if (device?.shock_alarm) breaches.push("Impact");
  if (device?.power_cut_alarm) breaches.push("Power Cut");
  if (device?.starter_disabled) breaches.push("Starter Disabled");
  if (breaches.length === 0) return { label: "Secure" };
  return { label: breaches.length === 1 ? breaches[0] : `${breaches.length} Alerts` };
}

export default function VehicleExpandedDrawer({
  booking,
  device,
  gps,
  battInfo,
  isOverdueRental,
  isReturnRequired,
  isBookingActive,
  dropoffInspectionComplete,
  remainingStr,
  onClose,
  onOpenDiagnostics,
  onEndRental,
}) {
  const secInfo = getSecurityInfo(device);
  const isOffline = device?.online_status === "offline";
  const isMoving = device?.movement_alarm === true;

  const healthParts = [
    isOffline ? "OFFLINE" : "ONLINE",
    secInfo.label === "Secure" ? "SECURE" : secInfo.label.toUpperCase(),
    battInfo?.pct > 0 ? `${battInfo.pct}%` : "N/A",
    isMoving ? "MOVING" : "PARKED",
  ];

  const paymentStatus =
    booking?.payment_status === "failed" ||
    booking?.payment_status === "overdue" ||
    booking?.booking_status === "payment_due"
      ? "ACTION NEEDED"
      : booking?.payment_status === "paid" || !booking
      ? "PAID"
      : "DUE";
  const paymentColor = paymentStatus === "ACTION NEEDED" ? "#FF4C4C" : "#39FF14";

  return (
    <div style={{ animation: "fade-in-up 0.3s ease-out" }}>
      {/* Close handle */}
      <button
        onClick={onClose}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          marginBottom: 14,
          padding: 0,
        }}
      >
        <ChevronDown size={18} color="#D4AF37" style={{ opacity: 0.7 }} />
      </button>

      {/* Rental info row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
          gap: 8,
        }}
      >
        <div style={{ flex: 1 }}>
          <p
            style={{
              fontSize: 9,
              color: "#8E8E93",
              fontWeight: 600,
              letterSpacing: "0.08em",
              margin: 0,
            }}
          >
            RENTAL ENDS
          </p>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: isOverdueRental ? "#FF4C4C" : "#FFF",
              margin: "2px 0 0",
              letterSpacing: "0.02em",
            }}
          >
            {booking?.end_date
              ? format(
                  new Date(`${booking.end_date}T23:59:59`),
                  "MMM d, yyyy"
                ).toUpperCase()
              : "N/A"}
          </p>
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <p
            style={{
              fontSize: 9,
              color: "#8E8E93",
              fontWeight: 600,
              letterSpacing: "0.08em",
              margin: 0,
            }}
          >
            REMAINING
          </p>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#FFF",
              margin: "2px 0 0",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {remainingStr}
          </p>
        </div>
        <div style={{ flex: 1, textAlign: "right" }}>
          <p
            style={{
              fontSize: 9,
              color: "#8E8E93",
              fontWeight: 600,
              letterSpacing: "0.08em",
              margin: 0,
            }}
          >
            PAYMENT
          </p>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: paymentColor,
              margin: "2px 0 0",
            }}
          >
            {paymentStatus}
          </p>
        </div>
      </div>

      {/* Vehicle health summary */}
      <div style={{ marginBottom: 14 }}>
        <p
          style={{
            fontSize: 9,
            color: "#8E8E93",
            fontWeight: 600,
            letterSpacing: "0.08em",
            margin: "0 0 4px",
          }}
        >
          VEHICLE HEALTH
        </p>
        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#39FF14",
            letterSpacing: "0.04em",
            margin: 0,
          }}
        >
          {healthParts.join(" • ")}
        </p>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Two side-by-side circular buttons: NOTIFY + PANIC/SOS */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            onClick={() => (window.location.href = "/notifications")}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
            className="control-tap"
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "rgba(10,10,12,0.8)",
                border: "2px solid rgba(212,175,55,0.55)",
                boxShadow:
                  "0 0 18px rgba(212,175,55,0.25), inset 0 0 12px rgba(212,175,55,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              <Bell size={22} color="#D4AF37" strokeWidth={2.2} />
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#D4AF37",
                letterSpacing: "0.1em",
              }}
            >
              NOTIFY
            </span>
          </button>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
            }}
          >
            <SOSButton booking={booking} device={device} inline />
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#FF4C4C",
                letterSpacing: "0.1em",
              }}
            >
              PANIC/SOS
            </span>
          </div>
        </div>

        {/* END YOUR RENTAL */}
        {!dropoffInspectionComplete && isBookingActive && (
          <button
            onClick={onEndRental}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 14,
              background: "rgba(255,76,76,0.05)",
              border: "1px solid rgba(255,76,76,0.5)",
              color: "#FF4C4C",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
            className="control-tap"
          >
            <span style={{ fontSize: 14 }}>Ø</span> END YOUR RENTAL
          </button>
        )}

        {/* VIEW FULL DIAGNOSTICS */}
        <button
          onClick={onOpenDiagnostics}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 14,
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.3)",
            color: "#FFF",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
          className="control-tap"
        >
          <SlidersHorizontal size={16} color="#FFF" /> VIEW FULL DIAGNOSTICS
        </button>
      </div>
    </div>
  );
}