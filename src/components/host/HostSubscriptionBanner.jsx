import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, CreditCard } from "lucide-react";

const paidModes = new Set(["fleetos_professional", "hybrid_growth"]);

function planLabel(mode) {
  return mode === "hybrid_growth" ? "Hybrid Growth" : "FleetOS";
}

export default function HostSubscriptionBanner({ host, plan }) {
  const qc = useQueryClient();
  const mode = plan?.selected_mode || plan?.active_mode;
  const isPaidMode = paidModes.has(mode);

  const { data: subscriptions = [] } = useQuery({
    queryKey: ["host-subscription-banner", host?.id],
    queryFn: () => base44.entities.HostPlatformSubscription.filter({ host_id: host.id }, "-updated_date", 1),
    enabled: !!host?.id && isPaidMode,
  });

  const subscription = subscriptions[0];
  const status = subscription?.subscription_status || subscription?.status || plan?.status;
  const isPastDue = status === "past_due";
  const isExpired = ["expired", "cancelled", "canceled", "unpaid", "incomplete_expired"].includes(status);

  const reactivate = useMutation({
    mutationFn: () => base44.functions.invoke("manageHostPlatformPlan", { host_id: host.id, plan_id: plan.id, mode }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["host-subscription-banner", host?.id] });
      if (res.data?.url) window.location.href = res.data.url;
    },
  });

  if (!isPaidMode || (!isPastDue && !isExpired)) return null;

  return (
    <div className={`rounded-2xl border p-4 ${isExpired ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className={`h-5 w-5 mt-0.5 ${isExpired ? "text-red-600" : "text-amber-600"}`} />
          <div>
            <p className={`font-black ${isExpired ? "text-red-950" : "text-amber-950"}`}>
              {isExpired ? "Your subscription is inactive." : "Your free trial has ended."}
            </p>
            <p className={`text-sm mt-1 ${isExpired ? "text-red-700" : "text-amber-700"}`}>
              {isExpired
                ? "Reactivate your plan to continue operating your rental business. Your storefront, vehicles, customers, contracts, and history remain intact."
                : `Update your payment method within 7 days to continue using ${planLabel(mode)}.`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => reactivate.mutate()}
          disabled={reactivate.isPending}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60"
        >
          <CreditCard className="h-4 w-4" /> {reactivate.isPending ? "Opening…" : "Reactivate Subscription"}
        </button>
      </div>
    </div>
  );
}