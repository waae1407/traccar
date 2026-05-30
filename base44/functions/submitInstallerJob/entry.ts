import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const token = body.install_token;
    if (!token || String(token).length < 32) return Response.json({ error: 'Invalid installation link' }, { status: 400 });

    const records = await base44.asServiceRole.entities.TelematicsInstallRecord.filter({ install_token: token });
    const record = records[0];
    if (!record) return Response.json({ error: 'Invalid installation link' }, { status: 404 });

    const now = new Date().toISOString();
    const expiresAt = record.install_token_expires_at ? new Date(record.install_token_expires_at).getTime() : 0;
    if (record.installer_access_status === 'revoked') return Response.json({ error: 'This installation link has been revoked' }, { status: 403 });
    if (record.installer_access_status === 'submitted' || record.qa_status === 'pending' || record.qa_status === 'approved') return Response.json({ error: 'This installation has already been submitted' }, { status: 403 });
    if (expiresAt && expiresAt < Date.now()) {
      await base44.asServiceRole.entities.TelematicsInstallRecord.update(record.id, { installer_access_status: 'expired' });
      return Response.json({ error: 'This installation link has expired' }, { status: 403 });
    }

    const photos = Array.isArray(body.install_photos) ? body.install_photos.filter(Boolean).slice(0, 20) : [];
    if (!photos.length) return Response.json({ error: 'At least one installation photo is required' }, { status: 400 });
    if (!body.installer_signature_name) return Response.json({ error: 'Installer signature name is required' }, { status: 400 });

    const payload = {
      install_status: 'completed',
      qa_status: 'pending',
      installer_access_status: 'submitted',
      install_token_used_at: now,
      installation_started_at: record.installation_started_at || now,
      installation_completed_at: now,
      installation_notes: String(body.installation_notes || ''),
      installer_signature_name: String(body.installer_signature_name || ''),
      install_photos: photos,
      voltage_verified: !!body.voltage_verified,
      gps_verified: !!body.gps_verified,
      ignition_verified: !!body.ignition_verified,
      lock_unlock_verified: !!body.lock_unlock_verified,
      tamper_check_verified: !!body.tamper_check_verified,
      gps_test_passed: !!body.gps_verified,
      ignition_test_passed: !!body.ignition_verified,
      lock_test_passed: !!body.lock_unlock_verified,
      unlock_test_passed: !!body.lock_unlock_verified,
      notes: String(body.installation_notes || '')
    };

    const updated = await base44.asServiceRole.entities.TelematicsInstallRecord.update(record.id, payload);
    if (record.telematics_device_id) {
      await base44.asServiceRole.entities.TelematicsDevice.update(record.telematics_device_id, {
        install_status: 'needs_review',
        lifecycle_status: 'qa_review'
      });
    }

    await base44.asServiceRole.entities.TelematicsEvent.create({
      company_id: record.company_id || '',
      telematics_device_id: record.telematics_device_id || '',
      provider_key: '',
      vehicle_id: record.vehicle_id || '',
      event_type: 'public_installation_submitted_for_qa',
      source: 'installer',
      raw_payload: { install_record_id: record.id, installer_email: record.installer_email || record.assigned_installer_email || '' },
      created_at: now
    });

    return Response.json({ ok: true, record: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});