import React, { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import RecommendedSetup from "@/components/operator/RecommendedSetup";
import { OPERATIONAL_MODES, planDefaults } from "@/lib/operatorRecommendation";
import PaymentOperationalAlertPanel from "@/components/payments/PaymentOperationalAlertPanel";

export default function HostBusinessOperations() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: hosts = [] } = useQuery({ queryKey: ["business-ops-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user.email }), enabled: !!user?.email });
  const host = hosts[0];
  const { data: profiles = [] } = useQuery({ queryKey: ["operator-profile", user?.id, host?.id], queryFn: () => base44.entities.OperatorProfile.filter(host?.id ? { host_id: host.id } : { user_id: user.id }), enabled: !!user?.id });
  const { data: plans = [] } = useQuery({ queryKey: ["operator-plan", host?.id], queryFn: () => base44.entities.OperatorPlanConfiguration.filter({ host_id: host.id }), enabled: !!host?.id });
  const profile = profiles[0];
  const plan = plans[0];
  const updatePlan = useMutation({
    mutationFn: async ({ id, mode }) => {
      const defaults = planDefaults(mode, profile || {}, plan?.recommended_mode || profile?.recommended_mode || mode);
      await base44.entities.OperatorPlanConfiguration.update(id, {
        ...defaults,
        selected_mode: mode,
        recommended_mode: plan?.recommended_mode || profile?.recommended_mode || mode,
        host_id: host?.id,
        user_id: user?.id,
        status_audit_log: [
          ...(plan?.status_audit_log || []),
          {
            from_status: plan?.status || "unknown",
            to_status: defaults.status,
            changed_by: user?.email || "host",
            changed_at: new Date().toISOString(),
            reason: "Host changed selected setup from Business Operations. Paid modes remain pending until billing activation.",
            source: "host_edit"
          }
        ]
      });
      await base44.entities.OperatorRecommendationHistory.create({ host_id: host?.id, user_id: user?.id, previous_mode: plan?.selected_mode || plan?.active_mode || "", new_mode: mode, reason: "Host changed selected setup from Business Operations.", changed_by: user?.email || "host", changed_at: new Date().toISOString(), source: "host_edit" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operator-plan", host?.id] })
  });
  const result = useMemo(() => profile ? { recommended_mode: profile.recommended_mode, recommendation_confidence: profile.recommendation_confidence, recommendation_reasoning: profile.recommendation_reasoning, recommended_addons: profile.recommended_addons } : null, [profile]);

  return <div className="space-y-5"><PaymentOperationalAlertPanel scope="host" hostId={host?.id} limit={3} /><div><h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>Business Operations</h1><p className="text-sm text-gray-500 mt-1">View your selected setup, active status, pricing, add-ons, and request safe changes.</p></div>{result && <RecommendedSetup result={result} compact selectedMode={plan?.selected_mode} />}{plan && <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-4"><div><p className="font-black text-gray-900">Current setup</p><p className="text-xs text-gray-500 mt-1">Selected: {OPERATIONAL_MODES[plan.selected_mode]?.label || "—"} · Active: {OPERATIONAL_MODES[plan.active_mode]?.label || plan.active_mode || "—"} · Status: {plan.status}</p></div><div className="grid grid-cols-2 gap-3 text-xs"><div className="rounded-xl bg-gray-50 p-3"><p className="text-gray-400">Monthly fee</p><p className="font-black text-gray-900">${Number(plan.monthly_subscription_amount || 0).toFixed(2)}</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-gray-400">Marketplace fee</p><p className="font-black text-gray-900">{Math.round(Number(plan.marketplace_fee_rate || 0) * 100)}%</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-gray-400">Dealer Network</p><p className="font-black text-gray-900 capitalize">{plan.dealer_network_membership_status || "pending_payment"}</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-gray-400">Add-ons</p><p className="font-black text-gray-900">{[plan.contactless_enabled && "Contactless", plan.gps_subscription_enabled && "GPS", plan.custom_domain_enabled && "Custom Domain"].filter(Boolean).join(", ") || "None"}</p></div></div><p className="font-black text-gray-900 text-sm">Change option / request edit</p>{Object.entries(OPERATIONAL_MODES).map(([key, item]) => <button key={key} onClick={() => updatePlan.mutate({ id: plan.id, mode: key })} className={`w-full text-left p-4 rounded-2xl border ${plan.selected_mode === key ? "border-pink-300 bg-pink-50" : "border-gray-100 bg-white"}`}><p className="font-bold text-gray-900 text-sm">{item.label}</p><p className="text-xs text-gray-500 mt-1">{item.price}</p></button>)}<p className="text-xs text-amber-600 bg-amber-50 rounded-xl p-3">This screen does not activate billing, Stripe holds, or payment-critical changes.</p></div>}{!profile && !plan && <div className="rounded-2xl bg-white border border-gray-100 p-5 text-gray-500">No smart setup profile found yet.</div>}</div>;
}