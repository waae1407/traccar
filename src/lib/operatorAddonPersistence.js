import { OPERATOR_ADDONS, buildAddonPayload, normalizeAddonKey } from "@/lib/operatorRecommendation";

const VALID_ADDON_KEYS = new Set(Object.keys(OPERATOR_ADDONS));

export function getValidAddonKeys(keys = []) {
  return [...new Set(keys.map(normalizeAddonKey).filter((key) => VALID_ADDON_KEYS.has(key)))];
}

export async function upsertOperatorAddonSelections(base44, {
  userId = "",
  hostId = "",
  selectedAddons = [],
  recommendedAddons = [],
  selectedMode = "",
  actor = "system",
  source = "questionnaire",
} = {}) {
  const selectedKeys = getValidAddonKeys(selectedAddons);
  const recommendedKeys = getValidAddonKeys(recommendedAddons);
  const allKeys = [...new Set([...recommendedKeys, ...selectedKeys])];
  if (allKeys.length === 0 || (!userId && !hostId)) return [];

  const records = hostId
    ? [
        ...(await base44.entities.OperatorAddonConfiguration.filter({ host_id: hostId })),
        ...(userId ? await base44.entities.OperatorAddonConfiguration.filter({ user_id: userId }) : []),
      ]
    : await base44.entities.OperatorAddonConfiguration.filter({ user_id: userId });

  const now = new Date().toISOString();
  const saved = [];

  for (const key of allKeys) {
    // Prioritize host-scoped record if it exists; fall back to user-scoped for linking
    const existing = records.find((record) => (record.addon_type || record.addon_key) === key && record.host_id && record.host_id === hostId) ||
                     records.find((record) => (record.addon_type || record.addon_key) === key);
    const isSelected = selectedKeys.includes(key);
    const payload = buildAddonPayload(key, {
      hostId,
      userId,
      recommended: recommendedKeys.includes(key),
      selected: isSelected,
      source,
      actor,
    });

    const data = {
      ...payload,
      ...(selectedMode ? { selected_plan: selectedMode } : {}),
      interest_status: isSelected ? "selected" : "recommended",
      activation_status: isSelected ? "not_activated" : payload.activation_status,
      billing_status: isSelected ? "pending_billing_activation" : payload.billing_status,
      setup_status: "not_started",
      selected_at: isSelected ? (existing?.selected_at || now) : existing?.selected_at,
      last_updated_at: now,
      audit_log: [
        ...(existing?.audit_log || []),
        {
          action: isSelected ? "selected" : "recommended",
          status: isSelected ? "selected" : "recommended",
          changed_by: actor,
          changed_at: now,
          note: hostId ? "Onboarding add-on linked to host without activating billing." : "Onboarding add-on saved before host creation without activating billing."
        }
      ]
    };

    if (existing) {
      saved.push(await base44.entities.OperatorAddonConfiguration.update(existing.id, data));
    } else {
      saved.push(await base44.entities.OperatorAddonConfiguration.create(data));
    }
  }

  return saved;
}