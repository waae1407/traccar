import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const REQUIRED = 3;
const COMMAND_TESTS = ['lock_test', 'unlock_test', 'horn_test', 'lights_test', 'alarm_test', 'starter_disable_test', 'starter_restore_test'];

function norm(value) { return String(value || '').trim().toLowerCase(); }
function compact(value) { return norm(value).replace(/[^a-z0-9]+/g, ' ').trim(); }
function zipFrom(value) { return String(value || '').match(/\b\d{5}\b/)?.[0] || ''; }
function statusFor(successful, successRate, currentStatus) {
  if (currentStatus === 'suspended') return 'suspended';
  if (currentStatus === 'preferred') return 'preferred';
  if (successful >= 10 && successRate >= 95) return 'preferred';
  if (successful >= 3) return 'verified';
  if (successful === 2) return 'almost_verified';
  if (successful === 1) return 'in_progress';
  return currentStatus === 'listed' ? 'listed' : 'not_verified';
}
function hasRequiredPhotos(record) { return Array.isArray(record.install_photos) && record.install_photos.length >= 3; }
function supportedCommandsPassed(record) {
  return COMMAND_TESTS.every(key => ['pass', 'not_supported', undefined, ''].includes(record[key]));
}
function qualifies(record) {
  if (record.verification_excluded === true) return false;
  if (record.install_status !== 'completed') return false;
  if (record.vehicle_match_status !== 'matched' || !record.vehicle_id) return false;
  if (!record.device_unique_id && !record.telematics_device_id) return false;
  if (!hasRequiredPhotos(record)) return false;
  if (record.gps_signal_test !== 'pass' && record.gps_test_passed !== true) return false;
  if (Array.isArray(record.failed_tests) && record.failed_tests.length > 0) return false;
  return supportedCommandsPassed(record);
}
function matchesLead(record, lead) {
  if (lead.google_place_id && norm(record.google_place_id) === norm(lead.google_place_id)) return true;
  if (lead.installer_email && norm(record.installer_email || record.assigned_installer_email) === norm(lead.installer_email)) return true;
  if (lead.installer_phone && norm(record.installer_phone) === norm(lead.installer_phone)) return true;
  const recordBusiness = compact(record.installer_business_name || record.business_name || record.installer_name);
  const leadBusiness = compact(lead.business_name || lead.installer_name);
  const recordZip = zipFrom(record.installer_business_address || record.business_address || record.business_zip);
  const leadZip = lead.business_zip || zipFrom(lead.business_address);
  if (recordBusiness && leadBusiness && recordBusiness === leadBusiness && (!recordZip || !leadZip || recordZip === leadZip)) return true;
  if (compact(record.installer_business_address) && compact(record.installer_business_address) === compact(lead.business_address)) return true;
  if (norm(record.installer_name) && norm(record.installer_name) === norm(lead.installer_name)) return true;
  return false;
}
function dedupeKey(record) { return `${record.vehicle_id || record.vin || ''}:${record.telematics_device_id || record.device_unique_id || ''}`; }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    let leads = [];
    if (body.lead_id) leads = await base44.asServiceRole.entities.PreferredInstallerLead.filter({ id: body.lead_id });
    if (!leads[0] && body.installer_email) leads = await base44.asServiceRole.entities.PreferredInstallerLead.filter({ installer_email: body.installer_email });
    if (!leads[0] && body.installer_phone) leads = await base44.asServiceRole.entities.PreferredInstallerLead.filter({ installer_phone: body.installer_phone });
    if (!leads[0] && body.install_record_id) {
      const record = (await base44.asServiceRole.entities.TelematicsInstallRecord.filter({ id: body.install_record_id }))[0];
      if (record?.preferred_installer_lead_id) leads = await base44.asServiceRole.entities.PreferredInstallerLead.filter({ id: record.preferred_installer_lead_id });
      if (!leads[0] && record?.installer_email) leads = await base44.asServiceRole.entities.PreferredInstallerLead.filter({ installer_email: record.installer_email });
      if (!leads[0] && record) {
        const candidates = await base44.asServiceRole.entities.PreferredInstallerLead.list('-updated_at', 1000);
        leads = candidates.filter(lead => matchesLead(record, lead)).slice(0, 1);
      }
    }
    const lead = leads[0];
    if (!lead) return Response.json({ ok: true, updated: false, message: 'No preferred installer lead found yet.' });

    const records = await base44.asServiceRole.entities.TelematicsInstallRecord.list('-installation_completed_at', 500);
    const related = records.filter(record => matchesLead(record, lead));
    const failed = related.filter(record => ['failed', 'correction_needed'].includes(record.install_status) || (Array.isArray(record.failed_tests) && record.failed_tests.length > 0));
    const seen = new Set();
    const successful = [];
    for (const record of related.filter(qualifies)) {
      const key = dedupeKey(record);
      if (seen.has(key)) continue;
      seen.add(key);
      successful.push(record);
    }
    const successRate = related.length ? Math.round((successful.length / related.length) * 100) : 0;
    const payload = {
      successful_install_count: successful.length,
      failed_install_count: failed.length,
      success_rate: successRate,
      verification_progress_count: Math.min(successful.length, REQUIRED),
      verification_required_count: REQUIRED,
      installer_status: statusFor(successful.length, successRate, lead.installer_status),
      last_install_at: successful[0]?.installation_completed_at || lead.last_install_at || '',
      updated_at: new Date().toISOString()
    };
    const updated = await base44.asServiceRole.entities.PreferredInstallerLead.update(lead.id, payload);
    return Response.json({ ok: true, updated: true, lead: updated, qualifying_install_count: successful.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});