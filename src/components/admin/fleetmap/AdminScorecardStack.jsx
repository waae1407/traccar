import React, { useState } from "react";
import { ShieldCheck, AlertTriangle, FileCheck, Users, Clock, Wrench, ChevronRight } from "lucide-react";

const LABEL_FONT = "'Barlow Condensed', sans-serif";

function Scorecard({ icon: Icon, label, count, color, bg, borderColor, pulse, onClick }) {
  const [snoozed, setSnoozed] = useState(false);

  if (count === 0 || snoozed) return null;

  return (
    <button
      onClick={() => {
        if (onClick) onClick();
        setSnoozed(true);
        setTimeout(() => setSnoozed(false), 60_000);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "7px 14px",
        borderRadius: 999,
        background: bg,
        border: `1px solid ${borderColor}`,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        cursor: "pointer",
        transition: "all 0.2s",
        maxWidth: 220,
        animation: pulse ? "adminPulse 2s infinite" : "none",
      }}
    >
      {pulse && (
        <style>{`@keyframes adminPulse { 0%,100% { box-shadow: 0 0 0 0 ${color}40; } 50% { box-shadow: 0 0 0 6px ${color}15; } }`}</style>
      )}
      <Icon size={15} color={color} style={{ flexShrink: 0 }} />
      <span style={{
        fontSize: 12,
        fontWeight: 700,
        color: color,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontFamily: LABEL_FONT,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 11,
        fontWeight: 800,
        color: "#fff",
        background: color,
        borderRadius: 999,
        minWidth: 18,
        height: 18,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 5px",
        flexShrink: 0,
      }}>
        {count}
      </span>
    </button>
  );
}

export default function AdminScorecardStack({
  pendingReviews = 0,
  pendingHosts = 0,
  overdueRentals = 0,
  outOfService = 0,
  overduePayments = 0,
  onNavigate,
}) {
  return (
    <div style={{
      position: "fixed",
      top: 108,
      left: 14,
      zIndex: 35,
      display: "flex",
      flexDirection: "column",
      gap: 6,
      maxWidth: 220,
    }}>
      {overduePayments > 0 && (
        <Scorecard
          icon={AlertTriangle}
          label="Overdue Payments"
          count={overduePayments}
          color="#EF4444"
          bg="rgba(239,68,68,0.18)"
          borderColor="rgba(239,68,68,0.5)"
          pulse
          onClick={() => onNavigate?.("/admin/payment-alerts")}
        />
      )}
      {pendingReviews > 0 && (
        <Scorecard
          icon={FileCheck}
          label="Pending Reviews"
          count={pendingReviews}
          color="#FF9F0A"
          bg="rgba(255,159,10,0.15)"
          borderColor="rgba(255,159,10,0.4)"
          onClick={() => onNavigate?.("/bookings-admin")}
        />
      )}
      {pendingHosts > 0 && (
        <Scorecard
          icon={Users}
          label="Host Applications"
          count={pendingHosts}
          color="#FF9F0A"
          bg="rgba(255,159,10,0.15)"
          borderColor="rgba(255,159,10,0.4)"
          onClick={() => onNavigate?.("/admin/hosts")}
        />
      )}
      {overdueRentals > 0 && (
        <Scorecard
          icon={Clock}
          label="Overdue Rentals"
          count={overdueRentals}
          color="#EF4444"
          bg="rgba(239,68,68,0.18)"
          borderColor="rgba(239,68,68,0.5)"
          onClick={() => onNavigate?.("/admin/operations-center")}
        />
      )}
      {outOfService > 0 && (
        <Scorecard
          icon={Wrench}
          label="Out of Service"
          count={outOfService}
          color="#FF9F0A"
          bg="rgba(255,159,10,0.15)"
          borderColor="rgba(255,159,10,0.4)"
          onClick={() => onNavigate?.("/vehicles")}
        />
      )}
    </div>
  );
}