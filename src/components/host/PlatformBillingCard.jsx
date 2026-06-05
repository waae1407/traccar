import React from "react";
import { CreditCard, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OPERATIONAL_MODES } from "@/lib/operatorRecommendation";

const paidModes = new Set(["fleetos_professional", "hybrid_growth"]);
const activeStatuses = new Set(["active", "trialing"]);

export default function PlatformBillingCard({ plan, subscription, loading, onStartBilling }) {
  if (!plan) return null;

  const mode = plan.selected_mode || plan.active_mode;
  const isPaidMode = paidModes.has(mode);
  const subscriptionActive = activeStatuses.has(subscription?.status);
  const monthlyAmount = Number(plan.monthly_subscription_amount || subscription?.monthly_amount || 0);
  const planLabel = OPERATIONAL_MODES[mode]?.label || "Selected package";

  if (!isPaidMode) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-black text-emerald-950">uRide Platform Billing</p>
            <p className="text-sm text-emerald-700 mt-1">Marketplace Partner has no monthly subscription. uRide earns from completed marketplace bookings.</p>
          </div>
          <Badge className="bg-emerald-600 text-white">No subscription</Badge>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-5 ${subscriptionActive ? "border-emerald-200 bg-emerald-50" : "border-yellow-200 bg-yellow-50"}`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {subscriptionActive ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-yellow-700" />}
            <p className="font-black text-gray-950">uRide Platform Subscription</p>
          </div>
          <p className="text-sm text-gray-700">
            {planLabel} requires a separate uRide subscription of <span className="font-black">${monthlyAmount.toFixed(2)}/month</span>. This is separate from renter payments and does not require Stripe Connect.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge className={subscriptionActive ? "bg-emerald-600 text-white" : "bg-yellow-600 text-white"}>{subscriptionActive ? "Active" : "Setup required"}</Badge>
            <Badge variant="outline">Plan: {planLabel}</Badge>
            <Badge variant="outline">Payment: {plan.last_payment_status || subscription?.last_payment_status || "pending"}</Badge>
          </div>
        </div>
        {!subscriptionActive && (
          <Button onClick={onStartBilling} disabled={loading} className="rounded-xl bg-gray-900 hover:bg-gray-800 text-white shrink-0">
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {loading ? "Opening…" : "Set Up Subscription"}
          </Button>
        )}
      </div>
      {subscription?.current_period_end && subscriptionActive && (
        <p className="text-xs text-emerald-700 mt-3">Current billing period ends {new Date(subscription.current_period_end).toLocaleDateString()}.</p>
      )}
    </div>
  );
}