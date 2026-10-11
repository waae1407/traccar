import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, AlertTriangle, DollarSign, X } from "lucide-react";
import PaymentIssuesSheet from "./PaymentIssuesSheet";

// Admin-only audit alert types — internal data-integrity checks that a host
// cannot act on. These are excluded from the host-facing scorecard entirely.
const ADMIN_ONLY_TYPES = new Set([
  "paid_booking_missing_payment_log",
  "paid_booking_missing_host_payout",
  "paid_booking_duplicate_host_payout",
  "paid_booking_duplicate_payment_log",
  "booking_paid_no_stripe_pi",
  "orphan_host_payout",
  "cancelled_booking_paid_no_refund",
  "unknown_billing_context",
  "payment_retry_scheduled",
  "retry_successful",
  "payout_completed",
  "chargeback_won",
  "subscription_renewed",
  "dealer_membership_renewed",
  "alert_resolved",
  "refund_recorded",
  "payment_recovered",
]);

// Alert types that are critical (red) — host-actionable
const CRITICAL_TYPES = new Set([
  "chargeback_opened", "chargeback_lost",
  "rental_payment_failed", "weekly_billing_failed",
  "transfer_failed", "payout_reversal",
  "subscription_payment_failed", "contactless_gps_payment_failed",
  "bank_debit_reversal", "refund_failed",
  "payment_method_missing", "unknown_payment_failed",
  "failed_payouts_require_attention",
]);

// Alert types that are warnings (amber) — host-actionable
const WARNING_TYPES = new Set([
  "payout_delayed", "subscription_past_due",
  "dealer_membership_past_due", "contactless_gps_past_due",
  "stripe_connect_incomplete", "payment_method_expiring",
  "ach_verification_pending", "refund_pending",
  "payment_authentication_required", "stale_pending_payouts",
]);

// Only show alerts from the last 14 days — older ones are stale audit artifacts
const FRESHNESS_MS = 14 * 24 * 60 * 60 * 1000;

const RESOLVED_STATUSES = new Set(["resolved", "dismissed", "closed"]);
const OPEN_DISPUTE_STATUSES = new Set(["open", "under_review", "evidence_requested", "payout_held", "chargeback"]);

// Snooze durations (ms)
const SNOOZE_CRITICAL = 1 * 60 * 60 * 1000;  // 1 hour
const SNOOZE_WARNING = 4 * 60 * 60 * 1000;   // 4 hours

const SNOOZE_KEY = (hostId) => `paymentScorecard_snooze_${hostId}`;

export default function PaymentMonitorScorecard({ host, vehicles = [], bookings = [], onVehicleFocus }) {
  const [showSheet, setShowSheet] = useState(false);
  const [snoozeUntil, setSnoozeUntil] = useState(null);
  const [reAlertPulse, setReAlertPulse] = useState(false);

  // Load snooze from localStorage
  useEffect(() => {
    if (!host?.id) return;
    try {
      const raw = localStorage.getItem(SNOOZE_KEY(host.id));
      if (raw) setSnoozeUntil(new Date(raw));
    } catch (_) {}
  }, [host?.id]);

  // ── Payment alerts ──
  const { data: alerts = [] } = useQuery({
    queryKey: ["payment-scorecard-alerts", host?.id],
    queryFn: () => base44.entities.PaymentOperationalAlert.filter(
      { host_id: host.id, status: { $nin: ["resolved", "dismissed", "closed"] } },
      "-created_date", 50
    ),
    enabled: !!host?.id,
    refetchInterval: 30_000,
  });

  // ── Open disputes ──
  const { data: disputes = [] } = useQuery({
    queryKey: ["payment-scorecard-disputes", host?.id],
    queryFn: () => base44.entities.Dispute.filter(
      { host_id: host.id, status: { $in: ["open", "under_review", "evidence_requested", "payout_held", "chargeback"] } },
      "-created_date", 50
    ),
    enabled: !!host?.id,
    refetchInterval: 30_000,
  });

  // ── Held/failed payouts ──
  const { data: payouts = [] } = useQuery({
    queryKey: ["payment-scorecard-payouts", host?.id],
    queryFn: () => base44.entities.HostPayout.filter(
      { host_id: host.id, status: { $in: ["held", "failed", "on_hold_stripe_balance"] } },
      "-created_date", 50
    ),
    enabled: !!host?.id,
    refetchInterval: 30_000,
  });

  // ── Classify issues ──
  const issues = useMemo(() => {
    const vehicleName = (vid) => {
      const v = vehicles.find((v) => v.id === vid);
      return v ? (v.display_name || [v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle") : "Unknown vehicle";
    };

    const items = [];

    // From alerts
    const freshnessCutoff = Date.now() - FRESHNESS_MS;
    for (const a of alerts) {
      if (RESOLVED_STATUSES.has(a.status)) continue;
      // Skip admin-only audit types — hosts can't act on data-integrity issues
      if (ADMIN_ONLY_TYPES.has(a.alert_type)) continue;
      // Skip stale alerts older than 14 days
      const alertDate = a.created_date || a.first_seen_at;
      if (alertDate && new Date(alertDate).getTime() < freshnessCutoff) continue;
      const isCritical = a.severity === "critical" || CRITICAL_TYPES.has(a.alert_type);
      const isWarning = a.severity === "high" || a.severity === "warning" || WARNING_TYPES.has(a.alert_type);
      if (!isCritical && !isWarning) continue;

      items.push({
        id: a.id,
        vehicle_id: a.vehicle_id || a.related_entity_id,
        vehicle_name: a.vehicle_id ? vehicleName(a.vehicle_id) : (a.title || "Fleet-wide"),
        title: a.title || a.alert_type,
        description: a.message || "",
        severity: isCritical ? "critical" : "warning",
        amount: a.financial_impact_amount || 0,
        type: a.alert_type,
        source: "alert",
        created_at: a.created_date || a.first_seen_at,
        href: a.action_url || "/admin/payment-alerts",
      });
    }

    // From disputes (if not already covered by an alert)
    const alertDisputeIds = new Set(alerts.filter((a) => a.stripe_dispute_id).map((a) => a.stripe_dispute_id));
    for (const d of disputes) {
      if (alertDisputeIds.has(d.stripe_dispute_id)) continue;
      items.push({
        id: d.id,
        vehicle_id: d.vehicle_id,
        vehicle_name: d.vehicle_name || (d.vehicle_id ? vehicleName(d.vehicle_id) : "Unknown vehicle"),
        title: `Dispute: ${d.dispute_type || "chargeback"}`,
        description: d.description || "",
        severity: "critical",
        amount: d.stripe_dispute_amount || 0,
        type: "dispute",
        source: "dispute",
        created_at: d.created_date,
        due_by: d.due_by,
        href: "/admin/disputes",
      });
    }

    // From held/failed payouts
    for (const p of payouts) {
      const isCompliance = p.hold_reason === "compliance" || p.hold_reason === "stripe_balance_insufficient";
      items.push({
        id: p.id,
        vehicle_id: null,
        vehicle_name: p.vehicle_name || "Payout",
        title: `Payout ${p.status === "failed" ? "failed" : "held"}`,
        description: p.hold_notes || p.hold_reason || "",
        severity: p.status === "failed" ? "critical" : "warning",
        amount: p.net_host_payout || p.net_payout || 0,
        type: "payout",
        source: "payout",
        created_at: p.created_date,
        href: "/host/payouts",
      });
    }

    // From bookings with payment issues
    for (const b of bookings) {
      if (!b.vehicle_id) continue;
      if (b.booking_status === "payment_due" || b.payment_status === "failed" || b.payment_status === "overdue") {
        items.push({
          id: `booking-${b.id}`,
          vehicle_id: b.vehicle_id,
          vehicle_name: b.vehicle_name || vehicleName(b.vehicle_id),
          title: b.payment_status === "overdue" ? "Payment overdue" : "Payment failed",
          description: `${b.customer_full_name || b.user_email || "Customer"} · Week ${b.billing_week_number || 1}`,
          severity: b.payment_status === "overdue" ? "critical" : "warning",
          amount: b.first_payment_amount || b.weekly_rate || 0,
          type: "booking_payment",
          source: "booking",
          created_at: b.last_payment_failure_at || b.created_date,
          href: `/host/booking-360?id=${b.id}`,
        });
      } else if (b.booking_status === "grace_period") {
        items.push({
          id: `booking-${b.id}`,
          vehicle_id: b.vehicle_id,
          vehicle_name: b.vehicle_name || vehicleName(b.vehicle_id),
          title: "Grace period",
          description: `${b.customer_full_name || b.user_email || "Customer"} · Payment recovery window`,
          severity: "warning",
          amount: b.first_payment_amount || b.weekly_rate || 0,
          type: "grace",
          source: "booking",
          created_at: b.grace_period_started_at || b.created_date,
          href: `/host/booking-360?id=${b.id}`,
        });
      }
    }

    // Sort: critical first, then by date
    items.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    return items;
  }, [alerts, disputes, payouts, bookings, vehicles]);

  // ── Aggregate state ──
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  const hasIssues = issues.length > 0;
  const isSnoozed = snoozeUntil && new Date() < snoozeUntil;

  // Determine display state
  let displayState = "green";
  if (hasIssues && !isSnoozed) {
    displayState = criticalCount > 0 ? "red" : "amber";
  }

  // ── Re-alert detection: issue still exists after snooze expired ──
  useEffect(() => {
    if (!snoozeUntil || !hasIssues) return;
    if (new Date() >= snoozeUntil) {
      // Snooze expired and issues still exist → re-alert
      setReAlertPulse(true);
      // Clear the expired snooze
      try { localStorage.removeItem(SNOOZE_KEY(host.id)); } catch (_) {}
      setSnoozeUntil(null);
    }
  }, [snoozeUntil, hasIssues, host?.id]);

  // ── Handle tap: open sheet + snooze ──
  const handleTap = () => {
    if (!hasIssues) return;
    setShowSheet(true);

    // Set snooze
    const snoozeMs = criticalCount > 0 ? SNOOZE_CRITICAL : SNOOZE_WARNING;
    const newSnoozeUntil = new Date(Date.now() + snoozeMs);
    setSnoozeUntil(newSnoozeUntil);
    setReAlertPulse(false);
    try { localStorage.setItem(SNOOZE_KEY(host.id), newSnoozeUntil.toISOString()); } catch (_) {}
  };

  // ── Handle vehicle focus from sheet ──
  const handleVehicleFocus = (vehicleId) => {
    setShowSheet(false);
    if (onVehicleFocus) onVehicleFocus(vehicleId);
  };

  // Don't render if no host or green with no issues
  if (!host?.id) return null;

  // ── Visual config ──
  const config = {
    green: {
      bg: "rgba(23,24,28,0.92)",
      border: "rgba(34,197,94,0.25)",
      icon: ShieldCheck,
      iconColor: "#22C55E",
      label: "Payments OK",
      textColor: "#22C55E",
      pulse: false,
    },
    amber: {
      bg: "rgba(255,159,10,0.15)",
      border: "rgba(255,159,10,0.4)",
      icon: AlertTriangle,
      iconColor: "#FF9F0A",
      label: `${warningCount} ${warningCount === 1 ? "payment warning" : "payment warnings"}`,
      textColor: "#FF9F0A",
      pulse: false,
    },
    red: {
      bg: "rgba(239,68,68,0.18)",
      border: "rgba(239,68,68,0.5)",
      icon: AlertTriangle,
      iconColor: "#EF4444",
      label: `${criticalCount} ${criticalCount === 1 ? "critical issue" : "critical issues"}`,
      textColor: "#EF4444",
      pulse: true,
    },
  };

  const cfg = config[displayState];
  const Icon = cfg.icon;

  return (
    <>
      <style>{`
        @keyframes paymentPulse {
          0%, 100% { box-shadow: 0 0 0 0 ${cfg.iconColor}40; }
          50% { box-shadow: 0 0 0 6px ${cfg.iconColor}15; }
        }
        @keyframes reAlertShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
      `}</style>
      <button
        onClick={handleTap}
        disabled={displayState === "green"}
        style={{
          position: "fixed",
          top: 108,
          left: 14,
          zIndex: 35,
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "7px 14px",
          borderRadius: 999,
          background: cfg.bg,
          border: `1px solid ${cfg.border}`,
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          cursor: displayState === "green" ? "default" : "pointer",
          transition: "all 0.2s",
          animation: cfg.pulse
            ? (reAlertPulse ? "reAlertShake 0.4s ease 3" : "paymentPulse 2s infinite")
            : "none",
          maxWidth: 200,
        }}
      >
        <Icon size={15} color={cfg.iconColor} style={{ flexShrink: 0 }} />
        <span style={{
          fontSize: 12,
          fontWeight: 700,
          color: cfg.textColor,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {cfg.label}
        </span>
        {hasIssues && !isSnoozed && (
          <span style={{
            fontSize: 11,
            fontWeight: 800,
            color: "#fff",
            background: cfg.iconColor,
            borderRadius: 999,
            minWidth: 18,
            height: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 5px",
            flexShrink: 0,
          }}>
            {issues.length}
          </span>
        )}
        {isSnoozed && hasIssues && (
          <span style={{ fontSize: 10, fontWeight: 600, color: "#8E8E93", flexShrink: 0 }}>
            snoozed
          </span>
        )}
      </button>

      {showSheet && (
        <PaymentIssuesSheet
          issues={issues}
          vehicles={vehicles}
          onClose={() => setShowSheet(false)}
          onVehicleFocus={handleVehicleFocus}
        />
      )}
    </>
  );
}