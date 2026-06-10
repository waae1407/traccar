import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Returns platform-wide settings. Admin can also write.
 * GET payload: {} → returns all settings
 * POST payload: { key, value_boolean, label, description } → upserts (admin only)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action, key, value_boolean, label, description } = body;

    // WRITE path — admin only
    if (action === 'set') {
      if (user.role !== 'admin') return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
      if (!key) return Response.json({ error: 'key is required' }, { status: 400 });

      const existing = await base44.asServiceRole.entities.PlatformSetting.filter({ key }, '-updated_date', 1);
      const now = new Date().toISOString();

      if (existing[0]) {
        const updated = await base44.asServiceRole.entities.PlatformSetting.update(existing[0].id, {
          value_boolean,
          label,
          description,
          updated_by: user.email,
          updated_at: now,
        });
        return Response.json({ ok: true, setting: updated });
      } else {
        const created = await base44.asServiceRole.entities.PlatformSetting.create({
          key,
          value_boolean,
          label,
          description,
          updated_by: user.email,
          updated_at: now,
        });
        return Response.json({ ok: true, setting: created });
      }
    }

    // READ path — any authenticated user
    const settings = await base44.asServiceRole.entities.PlatformSetting.list();
    const map = {};
    settings.forEach(s => { map[s.key] = s; });

    // Return compliance enforcement setting (default true if not set)
    const complianceSetting = map['compliance_enforcement_enabled'];
    const complianceEnforcementEnabled = complianceSetting ? complianceSetting.value_boolean !== false : true;

    return Response.json({
      settings: map,
      compliance_enforcement_enabled: complianceEnforcementEnabled,
    });
  } catch (error) {
    console.error('[getPlatformSettings]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});