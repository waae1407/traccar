import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function lifecycleForInstall(status) {
  if (status === 'completed') return 'qa_review';
  if (status === 'in_progress') return 'installed';
  return 'installation_scheduled';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['installer', 'admin'].includes(user.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const deviceId = body.telematics_device_id;
    if (!deviceId) return Response.json({ error: 'telematics_device_id is required' }, { status: 400 });

    const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: deviceId });
    const device = devices[0];
    if (!device) return Response.json({ error: 'Device not found' }, { status: 404 });

    const now = new Date().toISOString();
    const status = body.submit_for_qa ? 'completed' : 'in_progress';
    const existing = await base44.asServiceRole.entities.TelematicsInstallRecord.filter({ telematics_device_id: deviceId });
    const payload = {
      company_id: device.company_id || '',
      host_id: device.host_id || '',
      vehicle_id: device.vehicle_id || '',
      telematics_device_id: deviceId,
      installer_id: user.id || user.email,
      assigned_installer_email: user.email,
      installer_name: user.full_name || user.email,
      install_status: status,
      qa_status: body.submit_for_qa ? 'pending' : 'not_submitted',
      installation_started_at: body.installation_started_at || existing[0]?.installation_started_at || now,
      installation_completed_at: body.submit_for_qa ? now : existing[0]?.installation_completed_at || '',
      installation_notes: body.installation_notes || '',
      install_photos: Array.isArray(body.install_photos) ? body.install_photos : [],
      voltage_verified: !!body.voltage_verified,
      gps_verified: !!body.gps_verified,
      ignition_verified: !!body.ignition_verified,
      lock_unlock_verified: !!body.lock_unlock_verified,
      tamper_check_verified: !!body.tamper_check_verified,
      gps_test_passed: !!body.gps_verified,
      ignition_test_passed: !!body.ignition_verified,
      lock_test_passed: !!body.lock_unlock_verified,
      unlock_test_passed: !!body.lock_unlock_verified,
      notes: body.installation_notes || ''
    };

    const record = existing[0]
      ? await base44.asServiceRole.entities.TelematicsInstallRecord.update(existing[0].id, payload)
      : await base44.asServiceRole.entities.TelematicsInstallRecord.create(payload);

    await base44.asServiceRole.entities.TelematicsDevice.update(deviceId, {
      install_status: body.submit_for_qa ? 'needs_review' : 'in_progress',
      lifecycle_status: lifecycleForInstall(status)
    });

    await base44.asServiceRole.entities.TelematicsEvent.create({
      company_id: device.company_id || '', telematics_device_id: deviceId, provider_key: device.provider_key,
      vehicle_id: device.vehicle_id || '', event_type: body.submit_for_qa ? 'installation_submitted_for_qa' : 'installation_updated',
      source: 'installer', raw_payload: { install_record_id: record.id, installer: user.email }, created_at: now
    });

    return Response.json({ ok: true, record });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});