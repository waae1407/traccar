import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, ArrowRight } from "lucide-react";

/**
 * Engaging "post-it" style alert shown on the host dashboard when a
 * non-FleetOS host has not completed Stripe Connect onboarding.
 *
 * FleetOS Professional hosts use their own Stripe account, so they
 * don't need this nudge.
 */
export default function StripeConnectPostIt({ host }) {
  const { data: commerceProfiles = [] } = useQuery({
    queryKey: ["post-it-commerce", host?.id],
    queryFn: () => base44.entities.HostCommerceProfile.filter({ host_id: host.id }, "-updated_date", 1),
    enabled: !!host?.id,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["post-it-plan", host?.id],
    queryFn: () => base44.entities.OperatorPlanConfiguration.filter({ host_id: host.id }, "-updated_date", 1),
    enabled: !!host?.id,
  });

  if (!host || host.stripe_onboarding_complete) return null;

  const commerceProfile = commerceProfiles[0];
  const plan = plans[0];
  const planType = commerceProfile?.plan_type || plan?.selected_mode || plan?.active_mode || "";
  const isFleetOS = planType === "fleetos_professional";

  if (isFleetOS) return null;

  return (
    <div className="relative">
      {/* Tape strip */}
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 h-5 w-24 bg-yellow-200/60 rounded-sm shadow-sm z-10 rotate-[-2deg]" />

      <Link
        to="/host/payouts"
        className="block relative rotate-[-1deg] hover:rotate-0 transition-transform duration-300"
      >
        <div
          className="rounded-2xl p-5 shadow-lg border border-amber-300/50"
          style={{ background: "linear-gradient(135deg, #fef9c3 0%, #fde68a 60%, #fcd34d 100%)" }}
        >
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0 animate-pulse">
              <AlertTriangle className="h-5 w-5 text-amber-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-1">Action Required</p>
              <h3 className="text-base font-black text-amber-950 leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
                Your payouts are paused
              </h3>
              <p className="text-sm text-amber-900/80 mt-1 leading-snug">
                Connect your bank account to unlock automatic payouts. You won't get paid until Stripe is set up.
              </p>
              <div className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-black text-white bg-amber-600 hover:bg-amber-700 shadow-md">
                Connect Now <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}