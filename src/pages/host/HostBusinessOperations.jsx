import React, { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import RecommendedSetup from "@/components/operator/RecommendedSetup";
import { OPERATIONAL_MODES } from "@/lib/operatorRecommendation";

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
    mutationFn: ({ id, data, currentStatus }) => base44.entities.OperatorPlanConfiguration.update(id, {
      ...data,
      status: data.active_mode === "marketplace_partner" ? "active" : "pending_payment",
      activation_source: data.active_mode === "marketplace_partner" ? "host_approval" : "subscription_payment",
      payment_required: data.active_mode !== "marketplace_partner",
      billing_activation_pending: data.active_mode !== "marketplace_partner",
      last_payment_status: data.active_mode === "marketplace_partner" ? "not_required" : "pending",
      status_audit_log: [
        ...(plan?.status_audit_log || []),
        {
          from_status: currentStatus || plan?.status || "unknown",
          to_status: data.active_mode === "marketplace_partner" ? "active" : "pending_payment",
          changed_by: user?.email || "host",
          changed_at: new Date().toISOString(),
          reason: "Host requested plan mode change. Paid plans remain pending until subscription payment is enabled and succeeds.",
          source: "host_request"
        }
      ]
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operator-plan", host?.id] })
  });
  const result = useMemo(() => profile ? { recommended_mode: profile.recommended_mode, recommendation_confidence: profile.recommendation_confidence, recommendation_reasoning: profile.recommendation_reasoning, recommended_addons: profile.recommended_addons } : null, [profile]);

  return <div className="space-y-5"><div><h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>Business Operations</h1><p className="text-sm text-gray-500 mt-1">Plans are self-service and payment-driven. Paid modes stay pending until billing is enabled and payment succeeds.</p></div>{result && <RecommendedSetup result={result} compact />}{plan && <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-3"><p className="font-black text-gray-900">Operating setup</p>{Object.entries(OPERATIONAL_MODES).map(([key, item]) => <button key={key} onClick={() => updatePlan.mutate({ id: plan.id, currentStatus: plan.status, data: { active_mode: key } })} className={`w-full text-left p-4 rounded-2xl border ${plan.active_mode === key ? "border-pink-300 bg-pink-50" : "border-gray-100 bg-white"}`}><p className="font-bold text-gray-900 text-sm">{item.label}</p><p className="text-xs text-gray-500 mt-1">{item.price}</p></button>)}<p className="text-xs text-amber-600 bg-amber-50 rounded-xl p-3">Status: {plan.status}. This screen does not activate billing, Stripe holds, or payment-critical changes.</p></div>}{!profile && <div className="rounded-2xl bg-white border border-gray-100 p-5 text-gray-500">No smart setup profile found yet.</div>}</div>;
}