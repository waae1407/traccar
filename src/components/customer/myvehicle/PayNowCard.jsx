import React, { useState } from "react";
import { AlertTriangle, CreditCard, Loader2, CheckCircle2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

const LABEL_FONT = "'Barlow Condensed', sans-serif";

/**
 * PayNowCard — red alert card shown above the action dock when a booking has
 * a failed weekly payment. Renders ONLY when payment_status === "failed" and
 * booking_status is "payment_due" or "suspended". On successful charge, the
 * booking flips to active/paid and the card vanishes automatically (parent
 * refetches booking data).
 */
export default function PayNowCard({ booking, onPaymentSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Only render for failed payments
  if (!booking) return null;
  if (!["payment_due", "suspended"].includes(booking.booking_status)) return null;
  if (booking.payment_status !== "failed") return null;

  const amount = booking.weekly_rate || 0;
  const weekNum = booking.billing_week_number || 1;
  const grossedAmount = Math.round(((amount + 0.30) / (1 - 0.029)) * 100) / 100;

  const handlePayNow = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await base44.functions.invoke("retryBookingPayment", { booking_id: booking.id });
      if (res?.success) {
        setSuccess(true);
        // Brief success flash, then notify parent to refetch
        setTimeout(() => {
          if (onPaymentSuccess) onPaymentSuccess(res);
        }, 1200);
      } else {
        setError(res?.error || "Payment was declined. Please try again or update your payment method.");
      }
    } catch (e) {
      setError(e?.message || "Payment failed. Please try again or contact support.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{
        margin: "0 0 8px 0",
        padding: "14px 16px",
        borderRadius: 14,
        background: "rgba(34,197,94,0.15)",
        border: "1px solid rgba(34,197,94,0.4)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        pointerEvents: "auto",
      }}>
        <CheckCircle2 size={20} color="#22C55E" />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#22C55E", margin: 0, fontFamily: LABEL_FONT, letterSpacing: "0.02em" }}>
            PAYMENT SUCCESSFUL
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", margin: "2px 0 0 0" }}>
            Your rental is active again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      margin: "0 0 8px 0",
      padding: "14px 16px",
      borderRadius: 14,
      background: "rgba(239,68,68,0.12)",
      border: "1px solid rgba(239,68,68,0.4)",
      boxShadow: "0 0 16px rgba(239,68,68,0.15)",
      pointerEvents: "auto",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <AlertTriangle size={20} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: "#EF4444", margin: 0, fontFamily: LABEL_FONT, letterSpacing: "0.02em", textTransform: "uppercase", lineHeight: 1.1 }}>
            Payment Failed — Week {weekNum}
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", margin: "3px 0 0 0", lineHeight: 1.3 }}>
            {booking.payment_failure_reason
              ? `Card declined: ${booking.payment_failure_reason}`
              : "Your card was declined. Tap Pay Now to retry."}
          </p>
        </div>
        <span style={{ fontSize: 16, fontWeight: 800, color: "#EF4444", fontFamily: LABEL_FONT, flexShrink: 0 }}>
          ${grossedAmount.toFixed(2)}
        </span>
      </div>

      {error && (
        <div style={{
          marginBottom: 8,
          padding: "8px 10px",
          borderRadius: 8,
          background: "rgba(239,68,68,0.1)",
          border: "1px solid rgba(239,68,68,0.25)",
          fontSize: 11,
          color: "#FCA5A5",
          lineHeight: 1.3,
        }}>
          {error}
        </div>
      )}

      <button
        onClick={handlePayNow}
        disabled={loading}
        className="control-tap"
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: 10,
          background: loading ? "rgba(239,68,68,0.3)" : "#EF4444",
          border: "none",
          color: "#FFFFFF",
          fontSize: 14,
          fontWeight: 800,
          fontFamily: LABEL_FONT,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          cursor: loading ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          transition: "all 0.2s",
        }}
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <CreditCard size={16} />
            Pay Now — ${grossedAmount.toFixed(2)}
          </>
        )}
      </button>
    </div>
  );
}