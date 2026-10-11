import React from "react";
import { useNavigate } from "react-router-dom";
import { X, AlertTriangle, ShieldAlert, DollarSign, Clock, ChevronRight } from "lucide-react";

const LABEL_FONT = "'Barlow Condensed', sans-serif";

const SEVERITY_CONFIG = {
  critical: {
    bg: "rgba(239,68,68,0.12)",
    border: "rgba(239,68,68,0.3)",
    icon: ShieldAlert,
    iconColor: "#EF4444",
    label: "Critical",
    labelColor: "#EF4444",
  },
  warning: {
    bg: "rgba(255,159,10,0.10)",
    border: "rgba(255,159,10,0.25)",
    icon: AlertTriangle,
    iconColor: "#FF9F0A",
    label: "Warning",
    labelColor: "#FF9F0A",
  },
};

const TYPE_LABELS = {
  // Customer payment issues
  rental_payment_failed: "Customer Payment Failed",
  weekly_billing_failed: "Weekly Billing Failed",
  payment_authentication_required: "Payment Verification Needed",
  payment_method_missing: "No Payment Method on File",
  payment_method_expiring: "Card Expiring Soon",
  unknown_payment_failed: "Payment Failed",
  // Chargebacks & reversals
  chargeback_opened: "Chargeback Opened",
  chargeback_lost: "Chargeback Lost",
  bank_debit_reversal: "Bank Reversal",
  payout_reversal: "Payout Reversed",
  // Payout issues
  transfer_failed: "Payout Transfer Failed",
  payout_delayed: "Payout Delayed",
  failed_payouts_require_attention: "Payout Failed",
  stale_pending_payouts: "Payout Overdue",
  // Subscription / GPS
  subscription_payment_failed: "Subscription Payment Failed",
  subscription_past_due: "Subscription Past Due",
  contactless_gps_payment_failed: "GPS Payment Failed",
  contactless_gps_past_due: "GPS Subscription Past Due",
  dealer_membership_past_due: "Membership Past Due",
  dealer_membership_payment_failed: "Membership Payment Failed",
  // Stripe Connect
  stripe_connect_incomplete: "Stripe Account Not Connected",
  ach_verification_pending: "Bank Account Verifying",
  // Refunds
  refund_failed: "Refund Failed",
  refund_pending: "Refund Processing",
  // Booking-derived
  dispute: "Dispute Opened",
  payout: "Payout Issue",
  booking_payment: "Payment Issue",
  grace: "Grace Period",
  payment_failed: "Payment Failed",
  grace_period_expired: "Grace Period Expired",
  rental_overdue: "Rental Overdue",
  payout_retry_exhausted: "Payout Retry Exhausted",
  payment_failed_vehicle_disabled: "Vehicle Access Disabled",
  rental_payment_failed: "Rental Payment Failed",
  gps_offline_72h: "GPS Device Offline",
  stripe_account_restricted: "Stripe Account Restricted",
};

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function PaymentIssuesSheet({ issues, vehicles, onClose, onVehicleFocus }) {
  const navigate = useNavigate();

  if (!issues || issues.length === 0) return null;

  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const totalImpact = issues.reduce((s, i) => s + (i.amount || 0), 0);

  const handleIssueClick = (issue) => {
    // If vehicle-linked and callback provided → focus on map
    if (issue.vehicle_id && onVehicleFocus) {
      onVehicleFocus(issue.vehicle_id);
      return;
    }
    // Otherwise navigate to the href
    if (issue.href) navigate(issue.href);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 430, background: "#17181C",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "20px 20px 0 0",
        padding: "16px 16px 24px",
        zIndex: 91,
        maxHeight: "80vh", overflowY: "auto",
        animation: "slideUp 0.3s ease-out",
      }}>
        <style>{`@keyframes slideUp { from { transform: translateX(-50%) translateY(100%); } to { transform: translateX(-50%) translateY(0); } }`}</style>

        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 12px" }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <p style={{ fontSize: 17, fontWeight: 800, color: "#F5F5F7", margin: 0 }}>
              Payment Monitor
            </p>
            <p style={{ fontSize: 12, color: "#8E8E93", margin: "2px 0 0" }}>
              {criticalCount > 0 && <span style={{ color: "#EF4444", fontWeight: 600 }}>{criticalCount} critical</span>}
              {criticalCount > 0 && warningCount > 0 && <span> · </span>}
              {warningCount > 0 && <span style={{ color: "#FF9F0A", fontWeight: 600 }}>{warningCount} warning{warningCount > 1 ? "s" : ""}</span>}
              {criticalCount === 0 && warningCount === 0 && <span>All clear</span>}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.06)", border: "none",
              width: 30, height: 30, borderRadius: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "#8E8E93",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Financial impact summary */}
        {totalImpact > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(239,68,68,0.08)", borderRadius: 12,
            padding: "10px 14px", marginBottom: 14,
            border: "1px solid rgba(239,68,68,0.15)",
          }}>
            <DollarSign size={16} color="#EF4444" />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#F5F5F7" }}>
              ${totalImpact.toLocaleString()} at risk across {issues.length} {issues.length === 1 ? "issue" : "issues"}
            </span>
          </div>
        )}

        {/* Issue list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {issues.map((issue) => {
            const cfg = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.warning;
            const Icon = cfg.icon;
            const hasVehicle = !!issue.vehicle_id;

            return (
              <button
                key={issue.id}
                onClick={() => handleIssueClick(issue)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  background: cfg.bg, border: `1px solid ${cfg.border}`,
                  borderRadius: 14, padding: "12px 14px",
                  cursor: "pointer", textAlign: "left", width: "100%",
                  transition: "all 0.15s",
                }}
              >
                {/* Severity icon */}
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: "rgba(0,0,0,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <Icon size={18} color={cfg.iconColor} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: 0.5, color: cfg.labelColor,
                      fontFamily: LABEL_FONT,
                    }}>
                      {cfg.label}
                    </span>
                    <span style={{ fontSize: 10, color: "#8E8E93" }}>·</span>
                    <span style={{ fontSize: 10, color: "#8E8E93", fontWeight: 500 }}>
                      {TYPE_LABELS[issue.type] || issue.type}
                    </span>
                  </div>
                  <p style={{
                    fontSize: 14, fontWeight: 600, color: "#F5F5F7",
                    margin: 0, overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {issue.vehicle_name}
                  </p>
                  <p style={{
                    fontSize: 12, color: "#8E8E93", margin: "2px 0 0",
                    overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {issue.title}
                    {issue.description && ` — ${issue.description}`}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    {issue.amount > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: cfg.iconColor }}>
                        ${issue.amount.toLocaleString()}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: "#6B6B70", display: "flex", alignItems: "center", gap: 3 }}>
                      <Clock size={9} /> {timeAgo(issue.created_at)}
                    </span>
                    {issue.due_by && (
                      <span style={{ fontSize: 10, color: "#EF4444", fontWeight: 600 }}>
                        due {new Date(issue.due_by).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action arrow */}
                <ChevronRight size={16} color="#8E8E93" style={{ flexShrink: 0, marginTop: 10 }} />
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <p style={{
          fontSize: 11, color: "#6B6B70", textAlign: "center",
          marginTop: 14, fontWeight: 500,
        }}>
          {criticalCount > 0
            ? "Critical issues re-alert in 1 hour if unresolved"
            : "Warnings re-alert in 4 hours if unresolved"}
        </p>
      </div>
    </>
  );
}