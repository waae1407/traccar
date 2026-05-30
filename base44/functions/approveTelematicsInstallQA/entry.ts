import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const { install_record_id, approved = true, notes = '' } = await req.json();
    if (!install_record_id) return Response.json({ error: 'install_record_id is required' }, { status: 400 });

    const records = await base44.asServiceRole.entities.TelematicsInstallRecord.filter({ id: install_record_id });
    const record = records[0];
    if (!record) return Response.json({ error: 'Install record not found' }, { status: 404 });

    const now = new Date().toISOString();
    await base44.asServiceRole.entities.TelematicsInstallRecord.update(record.id, {
      qa_status: approved ? 'approved' : 'rejected',
      qa_approved_at: approved ? now : '',
      qa_approved_by: approved ? user.email : '',
      installer_access_status: approved ? 'submitted' : 'active',
      notes: notes || record.notes || ''
    });

    if (record.telematics_device_id) {
      await base44.asServiceRole.entities.TelematicsDevice.update(record.telematics_device_id, {
        lifecycle_status: approved ? 'approved' : 'qa_review',
        install_status: approved ? 'installed' : 'needs_review'
      });
    }

    await base44.asServiceRole.entities.TelematicsEvent.create({
      company_id: record.company_id || '', telematics_device_id: record.telematics_device_id || '', provider_key: '',
      vehicle_id: record.vehicle_id || '', event_type: approved ? 'installation_qa_approved' : 'installation_qa_rejected',
      source: 'system', raw_payload: { install_record_id, approved, admin: user.email, notes }, created_at: now
    });

    return Response.json({ ok: true, approved });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});