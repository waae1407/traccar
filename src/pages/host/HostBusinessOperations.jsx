import React, { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import RecommendedSetup from "@/components/operator/RecommendedSetup";
import { OPERATIONAL_MODES, planDefaults, buildAddonPayload } from "@/lib/operatorRecommendation";
import PaymentOperationalAlertPanel from "@/components/payments/PaymentOperationalAlertPanel";
import AddonSelectionCards from "@/components/operator/AddonSelectionCards";

export default function HostBusinessOperations() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: hosts = [] } = useQuery({ queryKey: ["business-ops-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user.email }), enabled: !!user?.email });
  const host = hosts[0];
  const { data: profiles = [] } = useQuery({
    queryKey: ["operator-profile", user?.id, host?.id],
    queryFn: async () => {
      const hostProfiles = host?.id ? await base44.entities.OperatorProfile.filter({ host_id: host.id }) : [];
      return hostProfiles.length ? hostProfiles : base44.entities.OperatorProfile.filter({ user_id: user.id });
    },
    enabled: !!user?.id
  });
  const { data: plans = [] } = useQuery({
    queryKey: ["operator-plan", host?.id, user?.id],
    queryFn: async () => {
      const hostPlans = host?.id ? await base44.entities.OperatorPlanConfiguration.filter({ host_id: host.id }) : [];
      return hostPlans.length ? hostPlans : base44.entities.OperatorPlanConfiguration.filter({ user_id: user.id });
    },
    enabled: !!user?.id
  });
  const { data: addonConfigs = [] } = useQuery({
    queryKey: ["operator-addons", host?.id, user?.id],
    queryFn: async () => {
      const records = host?.id
        ? [...(await base44.entities.OperatorAddonConfiguration.filter({ host_id: host.id })), ...(await base44.entities.OperatorAddonConfiguration.filter({ user_id: user.id }))]
        : await base44.entities.OperatorAddonConfiguration.filter({ user_id: user.id });
      return Object.values(records.reduce((map, record) => {
        const key = record.addon_type || record.addon_key;
        if (!map[key] || record.host_id === host?.id) map[key] = record;
        return map;
      }, {}));
    },
    enabled: !!user?.id
  });
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
  const selectedAddons = addonConfigs.filter(a => a.selected && !["removed", "cancelled"].includes(a.status)).map(a => a.addon_key);
  const recommendedAddons = [...new Set([...(result?.recommended_addons || []), ...addonConfigs.filter(a => a.recommended).map(a => a.addon_key)])];
  const updateAddons = useMutation({
    mutationFn: async (nextSelected) => {
      const now = new Date().toISOString();
      const allKeys = [...new Set([...recommendedAddons, ...selectedAddons, ...addonConfigs.map(a => a.addon_key), ...nextSelected])];
      for (const key of allKeys) {
        const existing = addonConfigs.find(a => a.addon_key === key);
        const isSelected = nextSelected.includes(key);
        if (existing) {
          const aliasPayload = buildAddonPayload(key, { hostId: host?.id || existing.host_id || "", userId: user?.id || existing.user_id || "", recommended: existing.recommended || recommendedAddons.includes(key), selected: isSelected, source: "business_operations", actor: user?.email || "host" });
          await base44.entities.OperatorAddonConfiguration.update(existing.id, { ...aliasPayload, selected: isSelected, status: isSelected ? "selected" : "removed", interest_status: isSelected ? "selected" : "removed", activation_status: isSelected ? "not_activated" : "cancelled", billing_status: aliasPayload.billing_status, selected_at: isSelected ? (existing.selected_at || now) : existing.selected_at, removed_at: isSelected ? undefined : now, last_updated_at: now, audit_log: [...(existing.audit_log || []), { action: isSelected ? "selected" : "removed", status: isSelected ? "selected" : "removed", changed_by: user?.email || "host", changed_at: now, note: "Changed from Business Operations. No billing or external action activated." }] });
        } else {
          await base44.entities.OperatorAddonConfiguration.create(buildAddonPayload(key, { hostId: host?.id || "", userId: user?.id || "", recommended: recommendedAddons.includes(key), selected: isSelected, source: "business_operations", actor: user?.email || "host" }));
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operator-addons"] })
  });

  return <div className="space-y-5"><PaymentOperationalAlertPanel scope="host" hostId={host?.id} limit={3} /><div><h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>Business Operations</h1><p className="text-sm text-gray-500 mt-1">View your selected setup, active status, pricing, add-ons, and request safe changes.</p></div>{result && <RecommendedSetup result={result} compact selectedMode={plan?.selected_mode} selectedAddons={selectedAddons} onAddonsChange={(next) => updateAddons.mutate(next)} />}{plan && <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-4"><div><p className="font-black text-gray-900">Current setup</p><p className="text-xs text-gray-500 mt-1">Selected: {OPERATIONAL_MODES[plan.selected_mode]?.label || "—"} · Active: {OPERATIONAL_MODES[plan.active_mode]?.label || plan.active_mode || "—"} · Status: {plan.status}</p></div><div className="grid grid-cols-2 gap-3 text-xs"><div className="rounded-xl bg-gray-50 p-3"><p className="text-gray-400">Monthly fee</p><p className="font-black text-gray-900">${Number(plan.monthly_subscription_amount || 0).toFixed(2)}</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-gray-400">Marketplace fee</p><p className="font-black text-gray-900">{Math.round(Number(plan.marketplace_fee_rate || 0) * 100)}%</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-gray-400">Dealer Network</p><p className="font-black text-gray-900 capitalize">{plan.dealer_network_membership_status || "pending_payment"}</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-gray-400">Add-ons</p><p className="font-black text-gray-900">{[plan.contactless_enabled && "Contactless", plan.gps_subscription_enabled && "GPS", plan.custom_domain_enabled && "Custom Domain"].filter(Boolean).join(", ") || "None"}</p></div></div><p className="font-black text-gray-900 text-sm">Change option / request edit</p>{Object.entries(OPERATIONAL_MODES).map(([key, item]) => <button key={key} onClick={() => updatePlan.mutate({ id: plan.id, mode: key })} className={`w-full text-left p-4 rounded-2xl border ${plan.selected_mode === key ? "border-pink-300 bg-pink-50" : "border-gray-100 bg-white"}`}><p className="font-bold text-gray-900 text-sm">{item.label}</p><p className="text-xs text-gray-500 mt-1">{item.price}</p></button>)}<p className="text-xs text-amber-600 bg-amber-50 rounded-xl p-3">This screen does not activate billing, Stripe holds, or payment-critical changes.</p></div>}{!profile && !plan && <div className="rounded-2xl bg-white border border-gray-100 p-5 text-gray-500">No smart setup profile found yet.</div>}</div>;
}