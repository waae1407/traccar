import React from "react";
import { format } from "date-fns";
import { ChevronDown, Bell, SlidersHorizontal, Ban } from "lucide-react";
import SOSButton from "@/components/customer/sos/SOSButton";

const GOLD_BORDER = "2px solid rgba(212,175,55,0.75)";

function getSecurityLabel(device) {
  const breaches = [];
  if (device?.door_open) breaches.push("Door Open");
  if (device?.trunk_open) breaches.push("Trunk Open");
  if (device?.shock_alarm) breaches.push("Impact");
  if (device?.power_cut_alarm) breaches.push("Power Cut");
  if (device?.starter_disabled) breaches.push("Starter Disabled");
  if (breaches.length === 0) return "SECURE";
  return (breaches.length === 1 ? breaches[0] : `${breaches.length} Alerts`).toUpperCase();
}

const pillBase = {
  flex: 1,
  height: 56,
  borderRadius: 999,
  background: "rgba(20,20,20,0.55)",
  border: GOLD_BORDER,
  boxShadow: "0 0 14px rgba(212,175,55,0.25)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

export default function VehicleExpandedDrawer({
  booking,
  device,
  battInfo,
  isOverdueRental,
  isBookingActive,
  dropoffInspectionComplete,
  remainingStr,
  onClose,
  onOpenDiagnostics,
  onEndRental,
}) {
  const isOffline = device?.online_status === "offline";
  const isMoving = device?.movement_alarm === true;
  const healthText = [
    isOffline ? "OFFLINE" : "ONLINE",
    getSecurityLabel(device),
    battInfo?.pct > 0 ? `${battInfo.pct}%` : "N/A",
    isMoving ? "MOVING" : "PARKED",
  ].join(", ");

  const paymentStatus =
    booking?.payment_status === "failed" ||
    booking?.payment_status === "overdue" ||
    booking?.booking_status === "payment_due"
      ? "ACTION NEEDED"
      : booking?.payment_status === "paid" || !booking
      ? "PAID"
      : "DUE";
  const endText = booking?.end_date
    ? format(new Date(`${booking.end_date}T23:59:59`), "MMM d, yyyy").toUpperCase()
    : "N/A";

  return (
    <div style={{ animation: "fade-in-up 0.3s ease-out" }}>
      <button
        onClick={onClose}
        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "center", marginBottom: 8, padding: 0 }}
      >
        <ChevronDown size={20} color="#E6C45A" />
      </button>

      <p style={{ fontSize: 17, fontWeight: 600, color: isOverdueRental ? "#FF4C4C" : "#F5F5F7", margin: 0, lineHeight: 1.25, letterSpacing: "0.01em" }}>
        RENTAL ENDS {endText} • REMAINING {remainingStr} •{" "}
        <span style={{ color: paymentStatus === "ACTION NEEDED" ? "#FF4C4C" : "#F5F5F7" }}>PAYMENT {paymentStatus}</span>
      </p>
      <div style={{ height: 1, background: "rgba(255,255,255,0.14)", margin: "12px 0" }} />

      <p style={{ fontSize: 17, fontWeight: 600, color: "#F5F5F7", margin: 0 }}>VEHICLE HEALTH</p>
      <p style={{ fontSize: 17, fontWeight: 600, color: "#50C878", margin: "2px 0 14px", letterSpacing: "0.02em" }}>
        {healthText}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={() => (window.location.href = "/notifications")} style={pillBase} className="control-tap" aria-label="Notifications">
            <Bell size={26} color="#E6C45A" strokeWidth={2} />
          </button>
          <div style={{ flex: 1, display: "flex" }}>
            <SOSButton booking={booking} device={device} variant="pill" />
          </div>
        </div>

        {!dropoffInspectionComplete && isBookingActive && (
          <button
            onClick={onEndRental}
            className="control-tap"
            style={{
              width: "100%", height: 54, borderRadius: 14,
              background: "rgba(255,76,76,0.12)", border: "2px solid rgba(255,90,80,0.75)",
              color: "#FF5A50", fontSize: 18, fontWeight: 700, letterSpacing: "0.03em",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            }}
          >
            <Ban size={22} color="#FF5A50" /> END YOUR RENTAL
          </button>
        )}

        <button
          onClick={onOpenDiagnostics}
          className="control-tap"
          style={{
            width: "100%", height: 54, borderRadius: 14,
            background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(255,255,255,0.3)",
            color: "#FFF", fontSize: 18, fontWeight: 700, letterSpacing: "0.03em",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          }}
        >
          <SlidersHorizontal size={22} color="#FFF" /> VIEW FULL DIAGNOSTICS
        </button>
      </div>
    </div>
  );
}