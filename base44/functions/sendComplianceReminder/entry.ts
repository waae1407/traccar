import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Backend function: sendComplianceReminder
 *
 * Sends a compliance document renewal reminder to the host.
 * Logs ActivityEvent: compliance.reminder_sent for audit trail.
 *
 * Callable from: AdminComplianceQueue UI (admin only), or automation.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Verify admin
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const {
      host_id,
      vehicle_id,
      doc_id,
      doc_type,
      vehicle_name,
      expiry_date,
      doc_status,
    } = await req.json();

    if (!host_id) return Response.json({ error: 'host_id is required' }, { status: 400 });

    // Fetch host for email address
    const hosts = await base44.asServiceRole.entities.Host.filter({ id: host_id });
    const host = hosts[0];
    if (!host?.email) {
      return Response.json({ error: 'Host not found or has no email' }, { status: 404 });
    }

    const DOC_LABELS = { insurance: 'Insurance', registration: 'Registration', inspection: 'Inspection', title: 'Title' };
    const docLabel = DOC_LABELS[doc_type] || doc_type || 'Document';
    const isExpired = doc_status === 'expired';
    const statusText = isExpired ? 'has expired' : `expires on ${expiry_date}`;

    // Send reminder email
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: host.email,
      subject: `⚠️ Action Required: ${docLabel} for ${vehicle_name || 'your vehicle'}`,
      body: `Hi ${host.full_name || host.business_name || ''},\n\nThis is a reminder that your ${docLabel} for ${vehicle_name || 'your vehicle'} ${statusText}.\n\n${isExpired ? '🚨 Your vehicle is currently on Compliance Hold.' : '⚠️ Your vehicle will be placed on Compliance Hold if not renewed before the expiry date.'}\n\nTo resolve:\n1. Renew your ${docLabel}\n2. Upload the new document at: https://uridehub.com/host/compliance\n3. Our team will verify and reinstate your vehicle automatically\n\nIf you have already uploaded a renewal, please allow 24 hours for verification.\n\nuRide Compliance Team`,
      from_name: 'uRide Compliance',
    });

    // Send in-app notification to host
    await base44.asServiceRole.entities.Notification.create({
      user_email: host.email,
      title: `⚠️ Compliance Reminder: ${docLabel} — ${vehicle_name}`,
      body: isExpired
        ? `${docLabel} has expired. Upload renewal to lift Compliance Hold.`
        : `${docLabel} expires ${expiry_date}. Please renew soon.`,
      type: 'alert',
    });

    // Audit trail: ActivityEvent
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'compliance.reminder_sent',
      actor_id: user.id || user.email,
      actor_email: user.email,
      actor_role: 'admin',
      target_entity: 'HostVehicleCompliance',
      target_id: doc_id || vehicle_id || '',
      target_label: `${docLabel} — ${vehicle_name}`,
      host_id: host_id || '',
      vehicle_id: vehicle_id || '',
      summary: `Compliance reminder sent to ${host.email}: ${docLabel} for ${vehicle_name} ${statusText}`,
      metadata: {
        host_email: host.email,
        host_name: host.full_name || host.business_name,
        doc_type,
        doc_label: docLabel,
        vehicle_name,
        expiry_date,
        doc_status,
        sent_by: user.email,
      },
      source: 'admin_panel',
      user_email: host.email,
      event_status: 'success',
    });

    console.log(`[ComplianceReminder] Sent to ${host.email} — ${docLabel} for ${vehicle_name}`);
    return Response.json({
      ok: true,
      sent_to: host.email,
      doc_type,
      vehicle_name,
    });
  } catch (error) {
    console.error('[ComplianceReminder] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});