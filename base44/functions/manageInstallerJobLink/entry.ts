import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function makeToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function expiry(days = 14) {
  return new Date(Date.now() + Number(days || 14) * 24 * 60 * 60 * 1000).toISOString();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const body = await req.json();
    const action = body.action || 'generate';
    const now = new Date().toISOString();
    let record;

    if (body.install_record_id) {
      const records = await base44.asServiceRole.entities.TelematicsInstallRecord.filter({ id: body.install_record_id });
      record = records[0];
    }

    if (!record && body.telematics_device_id) {
      const records = await base44.asServiceRole.entities.TelematicsInstallRecord.filter({ telematics_device_id: body.telematics_device_id });
      record = records[0];
    }

    if (action === 'revoke') {
      if (!record) return Response.json({ error: 'Install record not found' }, { status: 404 });
      const updated = await base44.asServiceRole.entities.TelematicsInstallRecord.update(record.id, { installer_access_status: 'revoked' });
      return Response.json({ ok: true, record: updated });
    }

    if (action === 'reopen') {
      if (!record) return Response.json({ error: 'Install record not found' }, { status: 404 });
      const updated = await base44.asServiceRole.entities.TelematicsInstallRecord.update(record.id, {
        installer_access_status: 'active',
        qa_status: 'not_submitted',
        install_status: 'needs_review',
        install_token: makeToken(),
        install_token_expires_at: expiry(body.expires_in_days),
        install_token_used_at: ''
      });
      return Response.json({ ok: true, record: updated, install_link: `${body.origin || 'https://uridehub.com'}/install/${updated.install_token}` });
    }

    let device = null;
    if (body.telematics_device_id) {
      const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: body.telematics_device_id });
      device = devices[0];
    }
    if (!record && !device) return Response.json({ error: 'Device or install record is required' }, { status: 400 });

    const token = makeToken();
    const payload = {
      company_id: record?.company_id || device?.company_id || '',
      host_id: record?.host_id || device?.host_id || '',
      vehicle_id: record?.vehicle_id || device?.vehicle_id || '',
      telematics_device_id: record?.telematics_device_id || device?.id || '',
      assigned_installer_email: body.installer_email || record?.assigned_installer_email || device?.assigned_installer_email || '',
      installer_email: body.installer_email || record?.installer_email || record?.assigned_installer_email || device?.assigned_installer_email || '',
      installer_phone: body.installer_phone || record?.installer_phone || '',
      install_token: token,
      install_token_expires_at: expiry(body.expires_in_days),
      install_token_used_at: '',
      installer_access_status: 'active',
      install_status: record?.install_status || 'not_started',
      qa_status: 'not_submitted',
      installation_started_at: record?.installation_started_at || '',
      installation_scheduled_at: body.installation_scheduled_at || device?.installation_scheduled_at || '',
      notes: record?.notes || ''
    };

    const saved = record
      ? await base44.asServiceRole.entities.TelematicsInstallRecord.update(record.id, payload)
      : await base44.asServiceRole.entities.TelematicsInstallRecord.create(payload);

    if (device?.id) {
      await base44.asServiceRole.entities.TelematicsDevice.update(device.id, {
        assigned_installer_email: payload.installer_email,
        installation_scheduled_at: body.installation_scheduled_at || device.installation_scheduled_at || '',
        lifecycle_status: 'installation_scheduled',
        assigned_status: 'assigned'
      });
    }

    const link = `${body.origin || 'https://uridehub.com'}/install/${token}`;
    if (body.send_email && payload.installer_email) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: payload.installer_email,
        subject: 'uRide telematics installation link',
        body: `Open this secure installation link to complete the assigned job: ${link}`
      });
    }

    await base44.asServiceRole.entities.TelematicsEvent.create({
      company_id: payload.company_id,
      telematics_device_id: payload.telematics_device_id,
      provider_key: device?.provider_key || '',
      vehicle_id: payload.vehicle_id,
      event_type: 'installer_job_link_generated',
      source: 'system',
      raw_payload: { install_record_id: saved.id, installer_email: payload.installer_email, admin: user.email },
      created_at: now
    });

    return Response.json({ ok: true, record: saved, install_link: link });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});