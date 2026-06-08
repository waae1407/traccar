import React from "react";
import { CreditCard, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OPERATIONAL_MODES } from "@/lib/operatorRecommendation";

const paidModes = new Set(["fleetos_professional", "hybrid_growth"]);
const activeStatuses = new Set(["active", "trialing"]);
const inactiveStatuses = new Set(["expired", "cancelled", "canceled", "unpaid", "incomplete_expired"]);

export default function PlatformBillingCard({ plan, subscription, loading, onStartBilling }) {
  if (!plan) return null;

  const mode = plan.selected_mode || plan.active_mode;
  const isPaidMode = paidModes.has(mode);
  const status = subscription?.subscription_status || subscription?.status || plan.status;
  const subscriptionActive = activeStatuses.has(status);
  const isPastDue = status === "past_due";
  const isInactive = inactiveStatuses.has(status);
  const monthlyAmount = Number(plan.monthly_subscription_amount || subscription?.monthly_amount || 0);
  const planLabel = OPERATIONAL_MODES[mode]?.label || "Selected package";
  const trialEndDate = subscription?.trial_end_date || subscription?.current_period_end;

  if (!isPaidMode) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-black text-emerald-950">uRide Platform Billing</p>
            <p className="text-sm text-emerald-700 mt-1">Marketplace Partner is free forever. No subscription or credit card is required; the existing 8% marketplace fee remains unchanged.</p>
          </div>
          <Badge className="bg-emerald-600 text-white">No subscription</Badge>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-5 ${subscriptionActive ? "border-emerald-200 bg-emerald-50" : isInactive ? "border-red-200 bg-red-50" : "border-yellow-200 bg-yellow-50"}`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {subscriptionActive ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className={`h-5 w-5 ${isInactive ? "text-red-700" : "text-yellow-700"}`} />}
            <p className="font-black text-gray-950">uRide Platform Subscription</p>
          </div>
          <p className="text-sm text-gray-700">
            {subscriptionActive && status === "trialing"
              ? `${planLabel} is unlocked during your free 14-day trial. Your card will be charged $${monthlyAmount.toFixed(2)}/month after the trial ends.`
              : isPastDue
              ? `Your free trial has ended. Update your payment method within 7 days to continue using ${planLabel}.`
              : isInactive
              ? "Your subscription is inactive. Reactivate your plan to continue operating your rental business."
              : `${planLabel} includes a free 14-day trial, then $${monthlyAmount.toFixed(2)}/month. A card is required, but there is no charge today.`}
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge className={subscriptionActive ? "bg-emerald-600 text-white" : isInactive ? "bg-red-600 text-white" : "bg-yellow-600 text-white"}>{status === "trialing" ? "Trialing" : subscriptionActive ? "Active" : isPastDue ? "Past due" : isInactive ? "Inactive" : "Trial setup required"}</Badge>
            <Badge variant="outline">Plan: {planLabel}</Badge>
            <Badge variant="outline">Payment: {plan.last_payment_status || subscription?.last_payment_status || "pending"}</Badge>
          </div>
        </div>
        {!subscriptionActive && (
          <Button onClick={onStartBilling} disabled={loading} className="rounded-xl bg-gray-900 hover:bg-gray-800 text-white shrink-0">
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {loading ? "Opening…" : isInactive ? "Reactivate Subscription" : "Start Free Trial"}
          </Button>
        )}
      </div>
      {trialEndDate && subscriptionActive && (
        <p className="text-xs text-emerald-700 mt-3">{status === "trialing" ? "Trial ends" : "Current billing period ends"} {new Date(trialEndDate).toLocaleDateString()}.</p>
      )}
    </div>
  );
}