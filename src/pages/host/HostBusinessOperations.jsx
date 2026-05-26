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
  const updatePlan = useMutation({ mutationFn: ({ id, data }) => base44.entities.OperatorPlanConfiguration.update(id, { ...data, status: "pending_review" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["operator-plan", host?.id] }) });
  const result = useMemo(() => profile ? { recommended_mode: profile.recommended_mode, recommendation_confidence: profile.recommendation_confidence, recommendation_reasoning: profile.recommendation_reasoning, recommended_addons: profile.recommended_addons } : null, [profile]);

  return <div className="space-y-5"><div><h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>Business Operations</h1><p className="text-sm text-gray-500 mt-1">Edit operating setup safely. Changes affecting payments, marketplace exposure, or billing are marked pending review.</p></div>{result && <RecommendedSetup result={result} compact />}{plan && <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-3"><p className="font-black text-gray-900">Operating setup</p>{Object.entries(OPERATIONAL_MODES).map(([key, item]) => <button key={key} onClick={() => updatePlan.mutate({ id: plan.id, data: { active_mode: key } })} className={`w-full text-left p-4 rounded-2xl border ${plan.active_mode === key ? "border-pink-300 bg-pink-50" : "border-gray-100 bg-white"}`}><p className="font-bold text-gray-900 text-sm">{item.label}</p><p className="text-xs text-gray-500 mt-1">{item.price}</p></button>)}<p className="text-xs text-amber-600 bg-amber-50 rounded-xl p-3">Status: {plan.status}. Billing/payment-related changes are not activated automatically.</p></div>}{!profile && <div className="rounded-2xl bg-white border border-gray-100 p-5 text-gray-500">No smart setup profile found yet.</div>}</div>;
}