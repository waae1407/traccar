import React, { useState } from "react";
import { Zap, Clock, AlertCircle } from "lucide-react";
import ActivationPaymentSheet from "./ActivationPaymentSheet";

/**
 * TrialActivationBanner — Smart in-context activation prompt.
 *
 * Shows progressive urgency based on trial status:
 *   Days 4-7: Green banner "Trial active — X days left"
 *   Days 1-3: Yellow banner "Trial ending soon"
 *   Day 0:    Red banner "Last day!"
 *   No trial: Green banner "Start Free Trial"
 *
 * Props:
 *   device: TelematicsDevice record
 *   subscription: GPSSubscription record (optional)
 *   onActivated: callback after successful activation
 *   theme: "dark" (default) | "light" — for host vs customer pages
 */
export default function TrialActivationBanner({ device, subscription, onActivated, theme = "dark" }) {
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!device) return null;

  const status = subscription?.subscription_status || device?.subscription_status || "none";

  // Don't show if already active
  if (status === "active") return null;

  // Don't show for past_due/control_disabled/deactivated — handled by SubscriptionPastDueBanner
  if (["past_due", "control_disabled", "deactivated", "unpaid", "cancelled", "paused"].includes(status)) return null;

  const isDark = theme === "dark";
  const msgClass = isDark ? "text-white/60" : "text-gray-600";

  let config;

  if (status === "trialing" && subscription?.current_period_end) {
    const periodEnd = new Date(subscription.current_period_end);
    const daysRemaining = Math.ceil((periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    if (daysRemaining <= 0) return null; // Will be converted by cron

    if (daysRemaining <= 1) {
      config = {
        bg: "rgba(255,69,58,0.1)",
        border: "rgba(255,69,58,0.35)",
        icon: AlertCircle,
        iconColor: "#FF453A",
        title: "Last Day of Free Trial!",
        message: "Your trial ends today. Activate now to keep your GPS controls working.",
        buttonLabel: "Activate Now",
        buttonColor: "#FF453A",
      };
    } else if (daysRemaining <= 3) {
      config = {
        bg: "rgba(255,159,10,0.1)",
        border: "rgba(255,159,10,0.3)",
        icon: Clock,
        iconColor: "#FF9F0A",
        title: `Free Trial — ${daysRemaining} days left`,
        message: "Activate your subscription now to avoid interruption to GPS controls.",
        buttonLabel: "Activate",
        buttonColor: "#FF9F0A",
      };
    } else {
      config = {
        bg: "rgba(48,209,88,0.08)",
        border: "rgba(48,209,88,0.25)",
        icon: Zap,
        iconColor: "#30D158",
        title: `7-Day Free Trial Active — ${daysRemaining} days left`,
        message: "You have full access to all GPS features. Activate your $14.99/mo subscription to continue after the trial.",
        buttonLabel: "Activate",
        buttonColor: "#30D158",
      };
    }
  } else {
    // No subscription at all — offer to start
    config = {
      bg: "rgba(48,209,88,0.08)",
      border: "rgba(48,209,88,0.25)",
      icon: Zap,
      iconColor: "#30D158",
      title: "Activate Your GPS Subscription",
      message: "Start your 7-day free trial with full access to GPS tracking, remote controls, and alerts. $14.99/mo after trial.",
      buttonLabel: "Start Free Trial",
      buttonColor: "#30D158",
    };
  }

  const Icon = config.icon;

  return (
    <>
      <div
        className="rounded-2xl border p-4 flex items-center gap-3"
        style={{ background: config.bg, borderColor: config.border }}
      >
        <Icon size={20} color={config.iconColor} className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: config.iconColor }}>{config.title}</p>
          <p className={`text-xs mt-0.5 ${msgClass}`}>{config.message}</p>
        </div>
        <button
          onClick={() => setSheetOpen(true)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white flex-shrink-0 whitespace-nowrap"
          style={{ background: config.buttonColor }}
        >
          <Zap size={14} /> {config.buttonLabel}
        </button>
      </div>

      {sheetOpen && (
        <ActivationPaymentSheet
          deviceId={device.id}
          onClose={() => setSheetOpen(false)}
          onSuccess={() => {
            setSheetOpen(false);
            onActivated?.();
          }}
        />
      )}
    </>
  );
}