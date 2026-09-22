import React from "react";
import { AlertTriangle, CreditCard } from "lucide-react";

/**
 * SubscriptionPastDueBanner — Shows tiered warning based on subscription status.
 *   past_due: yellow banner, controls still work
 *   control_disabled: red banner, controls disabled
 *   deactivated: dark red banner, tracking stopped
 */
export default function SubscriptionPastDueBanner({ subscription, onUpdatePayment }) {
  if (!subscription) return null;

  const status = subscription.subscription_status;
  if (status === "active" || status === "trialing" || status === "paused") return null;

  const config = {
    past_due: {
      bg: "rgba(255,159,10,0.1)",
      border: "rgba(255,159,10,0.3)",
      iconColor: "#FF9F0A",
      title: "Subscription Payment Past Due",
      message: "Update your payment method to keep your remote controls active. Tracking is still working.",
    },
    control_disabled: {
      bg: "rgba(255,69,58,0.1)",
      border: "rgba(255,69,58,0.3)",
      iconColor: "#FF453A",
      title: "Remote Controls Disabled",
      message: "Your GPS subscription is past due. Controls are disabled but tracking is still active. Update payment to restore.",
    },
    deactivated: {
      bg: "rgba(255,69,58,0.15)",
      border: "rgba(255,69,58,0.4)",
      iconColor: "#FF453A",
      title: "GPS Device Deactivated",
      message: "Your subscription has been past due for 30+ days. Tracking and controls are disabled. Update payment and contact support to reactivate.",
    },
    unpaid: {
      bg: "rgba(255,69,58,0.1)",
      border: "rgba(255,69,58,0.3)",
      iconColor: "#FF453A",
      title: "Payment Required",
      message: "Your subscription payment failed. Please update your payment method.",
    },
  };

  const c = config[status] || config.past_due;

  return (
    <div
      className="rounded-2xl border p-4 flex items-center gap-3"
      style={{ background: c.bg, borderColor: c.border }}
    >
      <AlertTriangle size={20} color={c.iconColor} className="flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-bold" style={{ color: c.iconColor }}>{c.title}</p>
        <p className="text-xs text-white/60 mt-0.5">{c.message}</p>
      </div>
      <button
        onClick={onUpdatePayment}
        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white flex-shrink-0"
        style={{ background: c.iconColor }}
      >
        <CreditCard size={14} /> Update
      </button>
    </div>
  );
}