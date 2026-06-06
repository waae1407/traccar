import React, { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import RecommendedSetup from "@/components/operator/RecommendedSetup";
import { OPERATIONAL_MODES, buildAddonPayload } from "@/lib/operatorRecommendation";
import PaymentOperationalAlertPanel from "@/components/payments/PaymentOperationalAlertPanel";
import PaymentSetupBuilder from "@/components/host/PaymentSetupBuilder";
import PlatformBillingCard from "@/components/host/PlatformBillingCard";
import CommerceProfileCard from "@/components/host/CommerceProfileCard";

export default function HostBusinessOperations() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: hosts = [] } = useQuery({ queryKey: ["business-ops-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user.email }), enabled: !!user?.email });
  const host = hosts[0];

  const { data: profiles = [] } = useQuery({
    queryKey: ["operator-profile", user?.id, host?.id],
    queryFn: async () => {
      const hostProfiles = host?.id ? await base44.entities.OperatorProfile.filter({ host_id: host.id }, "-updated_date", 10) : [];
      return hostProfiles.length ? hostProfiles : base44.entities.OperatorProfile.filter({ user_id: user.id }, "-updated_date", 10);
    },
    enabled: !!user?.id
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["operator-plan", host?.id, user?.id],
    queryFn: async () => {
      const hostPlans = host?.id ? await base44.entities.OperatorPlanConfiguration.filter({ host_id: host.id }, "-updated_date", 10) : [];
      return hostPlans.length ? hostPlans : base44.entities.OperatorPlanConfiguration.filter({ user_id: user.id }, "-updated_date", 10);
    },
    enabled: !!user?.id
  });

  const { data: paymentSettings = [] } = useQuery({
    queryKey: ["host-payment-settings", host?.id],
    queryFn: () => base44.entities.HostPaymentSettings.filter({ host_id: host.id }, "-updated_date", 1),
    enabled: !!host?.id
  });

  const { data: platformSubscriptions = [] } = useQuery({
    queryKey: ["host-platform-subscription", host?.id],
    queryFn: () => base44.entities.HostPlatformSubscription.filter({ host_id: host.id }, "-updated_date", 5),
    enabled: !!host?.id
  });

  const { data: commerceProfiles = [] } = useQuery({
    queryKey: ["host-commerce-profile", host?.id],
    queryFn: () => base44.entities.HostCommerceProfile.filter({ host_id: host.id }, "-updated_date", 1),
    enabled: !!host?.id
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
  const settings = paymentSettings[0];
  const platformSubscription = platformSubscriptions[0];
  const commerceProfile = commerceProfiles[0];

  const updatePlan = useMutation({
    mutationFn: (mode) => base44.functions.invoke("manageHostPlatformPlan", { host_id: host.id, plan_id: plan.id, mode }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["operator-plan"] });
      qc.invalidateQueries({ queryKey: ["host-platform-subscription", host?.id] });
      qc.invalidateQueries({ queryKey: ["host-commerce-profile", host?.id] });
      if (res.data?.url) window.location.href = res.data.url;
    }
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
        const aliasPayload = buildAddonPayload(key, { hostId: host?.id || existing?.host_id || "", userId: user?.id || existing?.user_id || "", recommended: existing?.recommended || recommendedAddons.includes(key), selected: isSelected, source: "business_operations", actor: user?.email || "host" });
        if (existing) {
          await base44.entities.OperatorAddonConfiguration.update(existing.id, { ...aliasPayload, selected: isSelected, status: isSelected ? "selected" : "removed", interest_status: isSelected ? "selected" : "removed", activation_status: isSelected ? "not_activated" : "cancelled", selected_at: isSelected ? (existing.selected_at || now) : existing.selected_at, removed_at: isSelected ? undefined : now, last_updated_at: now, audit_log: [...(existing.audit_log || []), { action: isSelected ? "selected" : "removed", status: isSelected ? "selected" : "removed", changed_by: user?.email || "host", changed_at: now, note: "Changed from Business Operations. No billing or external action activated." }] });
        } else {
          await base44.entities.OperatorAddonConfiguration.create(aliasPayload);
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operator-addons"] })
  });

  const savePaymentSettings = useMutation({
    mutationFn: async (data) => {
      const payload = { ...data, host_id: host.id, user_id: user?.id || "", payment_mode: data.payment_mode || plan?.payment_mode || "own_payments", uride_payments_enabled: !!settings?.uride_payments_enabled, last_updated_at: new Date().toISOString() };
      if (settings?.id) return base44.entities.HostPaymentSettings.update(settings.id, payload);
      return base44.entities.HostPaymentSettings.create(payload);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["host-payment-settings", host?.id] })
  });

  const enableUridePayments = useMutation({
    mutationFn: () => base44.functions.invoke("enableUridePayments", { host_id: host.id }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["operator-plan"] });
      qc.invalidateQueries({ queryKey: ["host-payment-settings", host?.id] });
      qc.invalidateQueries({ queryKey: ["host-commerce-profile", host?.id] });
      if (res.data?.url) window.location.href = res.data.url;
    }
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returned = params.get("uride_payments_return");
    if (!returned || !host?.id || !plan?.id) return;

    base44.functions.invoke("getStripeConnectStatus", { host_id: host.id }).then(async (res) => {
      if (!res.data?.charges_enabled && !res.data?.onboarding_complete) return;
      const now = new Date().toISOString();
      await base44.entities.Host.update(host.id, { stripe_onboarding_complete: true });
      const isFleetOS = commerceProfile?.plan_type === "fleetos_professional" || plan.selected_mode === "fleetos_professional";
      await base44.entities.OperatorPlanConfiguration.update(plan.id, {
        payment_mode: isFleetOS ? "own_payments" : "uride_payments",
        uses_uride_payments: !isFleetOS,
        uses_own_payments: isFleetOS,
        uride_payments_enabled_at: isFleetOS ? plan.uride_payments_enabled_at : now,
        own_payments_enabled_at: isFleetOS ? now : plan.own_payments_enabled_at,
        customer_payment_routing: isFleetOS ? "host_external" : "uride_checkout",
        stripe_connect_required: false,
        stripe_connect_optional: true,
        last_updated_at: now
      });
      if (commerceProfile?.id) {
        await base44.entities.HostCommerceProfile.update(commerceProfile.id, {
          stripe_account_id: host.stripe_account_id,
          online_payments_enabled: commerceProfile.plan_type === "fleetos_professional" ? true : commerceProfile.online_payments_enabled,
          host_checkout_enabled: commerceProfile.plan_type === "fleetos_professional",
          payment_processor: commerceProfile.plan_type === "fleetos_professional" ? "host_stripe" : "uride_stripe"
        });
      }
      if (settings?.id) {
        await base44.entities.HostPaymentSettings.update(settings.id, { payment_mode: isFleetOS ? "own_payments" : "uride_payments", uride_payments_enabled: !isFleetOS, uride_payments_enabled_at: isFleetOS ? settings.uride_payments_enabled_at : now, last_updated_at: now });
      } else {
        await base44.entities.HostPaymentSettings.create({ host_id: host.id, user_id: user?.id || "", payment_mode: isFleetOS ? "own_payments" : "uride_payments", uride_payments_enabled: !isFleetOS, uride_payments_enabled_at: isFleetOS ? undefined : now, last_updated_at: now });
      }
      qc.invalidateQueries({ queryKey: ["operator-plan"] });
      qc.invalidateQueries({ queryKey: ["host-payment-settings", host?.id] });
      qc.invalidateQueries({ queryKey: ["host-commerce-profile", host?.id] });
      window.history.replaceState({}, "", window.location.pathname);
    });
  }, [host?.id, plan?.id]); // eslint-disable-line

  return (
    <div className="space-y-5">
      <PaymentOperationalAlertPanel scope="host" hostId={host?.id} limit={3} />
      <div>
        <h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>Business Operations</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your package, fee acknowledgement, add-ons, and customer payment routing.</p>
      </div>

      {result && <RecommendedSetup result={result} compact selectedMode={plan?.selected_mode} selectedAddons={selectedAddons} onAddonsChange={(next) => updateAddons.mutate(next)} />}

      {commerceProfile && <CommerceProfileCard commerceProfile={commerceProfile} />}

      {plan && <PlatformBillingCard plan={plan} subscription={platformSubscription} loading={updatePlan.isPending} onStartBilling={() => updatePlan.mutate(plan.selected_mode || plan.active_mode)} />}

      {plan && (
        <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-4">
          <div>
            <p className="font-black text-gray-900">Current setup</p>
            <p className="text-xs text-gray-500 mt-1">Selected: {OPERATIONAL_MODES[plan.selected_mode]?.label || "—"} · Active: {OPERATIONAL_MODES[plan.active_mode]?.label || plan.active_mode || "—"} · Status: {plan.status}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-gray-50 p-3"><p className="text-gray-400">Monthly fee</p><p className="font-black text-gray-900">${Number(plan.monthly_subscription_amount || 0).toFixed(2)}</p></div>
            <div className="rounded-xl bg-gray-50 p-3"><p className="text-gray-400">Marketplace fee</p><p className="font-black text-gray-900">{Math.round(Number(plan.marketplace_fee_rate || 0) * 100)}%</p></div>
            <div className="rounded-xl bg-gray-50 p-3"><p className="text-gray-400">Payment mode</p><p className="font-black text-gray-900">{plan.uses_uride_payments ? "uRideHub checkout" : plan.payment_mode === "hybrid" ? "Own now / uRide later" : "Own processor"}</p></div>
            <div className="rounded-xl bg-gray-50 p-3"><p className="text-gray-400">Fee acknowledged</p><p className="font-black text-gray-900">{plan.fee_structure_acknowledged ? "Yes" : "No"}</p></div>
          </div>
          <p className="text-xs text-emerald-700 bg-emerald-50 rounded-xl p-3">Package fees are platform billing. Customer payments are routed separately by the Payment Setup below.</p>
          <p className="font-black text-gray-900 text-sm">Change package</p>
          {Object.entries(OPERATIONAL_MODES).map(([key, item]) => (
            <button key={key} onClick={() => updatePlan.mutate(key)} disabled={updatePlan.isPending} className={`w-full text-left p-4 rounded-2xl border disabled:opacity-60 ${plan.selected_mode === key ? "border-pink-300 bg-pink-50" : "border-gray-100 bg-white"}`}>
              <p className="font-bold text-gray-900 text-sm">{item.label}</p>
              <p className="text-xs text-gray-500 mt-1">{item.price}</p>
            </button>
          ))}
        </div>
      )}

      {plan && host && <PaymentSetupBuilder plan={plan} settings={settings} saving={savePaymentSettings.isPending} enabling={enableUridePayments.isPending} onSave={(data) => savePaymentSettings.mutate(data)} onEnableUridePayments={() => enableUridePayments.mutate()} />}
      {!profile && !plan && <div className="rounded-2xl bg-white border border-gray-100 p-5 text-gray-500">No smart setup profile found yet.</div>}
    </div>
  );
}