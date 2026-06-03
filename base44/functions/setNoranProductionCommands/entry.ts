import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SCOPES = ['non_starter_only', 'all_supported_commands'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const deviceId = String(body.device_id || '').trim();
    const enabled = body.enabled === true;
    const scope = SCOPES.includes(body.production_command_scope) ? body.production_command_scope : 'non_starter_only';

    if (!deviceId) return Response.json({ error: 'Device ID is required.' }, { status: 400 });
    if (enabled && body.confirmation_text !== 'ENABLE LIVE COMMANDS') {
      return Response.json({ error: 'Typed confirmation is required.' }, { status: 400 });
    }
    if (enabled && body.understood !== true) {
      return Response.json({ error: 'Live-command acknowledgement is required.' }, { status: 400 });
    }
    if (enabled && scope === 'all_supported_commands' && body.starter_confirmation !== true) {
      return Response.json({ error: 'Starter-control confirmation is required.' }, { status: 400 });
    }

    const device = (await base44.asServiceRole.entities.TelematicsDevice.filter({ id: deviceId }))[0];
    if (!device) return Response.json({ error: 'Telematics device not found.' }, { status: 404 });
    if (device.provider_key !== 'traccar_noran_mt20') {
      return Response.json({ error: 'Production activation is currently limited to Noran MT20 Traccar devices.' }, { status: 400 });
    }
    if (device.host_starter_control_approval_locked === true && (!enabled || scope !== 'all_supported_commands') && body.owner_approval_text !== 'APPROVED STARTER CHANGE') {
      return Response.json({ error: 'Starter control is approval-locked and cannot be downgraded without owner approval.' }, { status: 403 });
    }
    if (enabled && !device.traccar_device_id) {
      return Response.json({ error: 'Traccar numeric device ID is required before production activation.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const update = enabled
      ? {
          production_commands_enabled: true,
          production_command_scope: scope,
          production_enabled_at: now,
          production_enabled_by: user.email,
          host_starter_control_enabled: scope === 'all_supported_commands' ? true : device.host_starter_control_enabled,
          lifecycle_status: device.lifecycle_status === 'live_ready' ? 'live_enabled' : device.lifecycle_status
        }
      : {
          production_commands_enabled: false,
          production_command_scope: 'non_starter_only'
        };

    const updated = await base44.asServiceRole.entities.TelematicsDevice.update(device.id, update);
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'gps.command_sent',
      actor_id: user.id || '',
      actor_email: user.email,
      actor_role: 'admin',
      target_entity: 'TelematicsDevice',
      target_id: device.id,
      summary: `${enabled ? 'Enabled' : 'Disabled'} Noran production commands for ${device.unique_id}`,
      metadata: { production_commands_enabled: enabled, production_command_scope: update.production_command_scope, traccar_device_id: device.traccar_device_id },
      source: 'admin_panel',
      event_status: 'success'
    });

    return Response.json({ ok: true, device: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});