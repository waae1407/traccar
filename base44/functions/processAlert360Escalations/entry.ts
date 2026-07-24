import { createClientFromRequest } from 'npm:@base44/sdk@0.8.32';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Require admin, scheduler context, or external cron secret
    const user = await base44.auth.me().catch(() => null);
    const isCron = !!(Deno.env.get('CRON_SECRET') && req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET'));
    const isScheduled = req.headers.get('x-base44-scheduled-function') === 'true';
    if (!isCron && !isScheduled && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: cron-secret, scheduled, or admin required' }, { status: 403 });
    }

    const activeAlerts = await base44.asServiceRole.entities.TelematicsSafetyEvent.filter({
        is_active: true,
        severity: 'critical'
    });

    const now = Date.now();
    let escalatedCount = 0;

    for (const alert of activeAlerts) {
        if (alert.status === 'resolved' || alert.status === 'dismissed_false_positive') continue;

        const ageMs = now - new Date(alert.first_seen_at).getTime();
        const ageMinutes = ageMs / 60000;
        
        const currentLevel = alert.escalation_level || 0;
        let newLevel = currentLevel;

        if (ageMinutes >= 30 && currentLevel < 3) {
            newLevel = 3;
        } else if (ageMinutes >= 15 && currentLevel < 2) {
            newLevel = 2;
        } else if (ageMinutes >= 5 && currentLevel < 1) {
            newLevel = 1;
        }

        if (newLevel > currentLevel) {
            const timestamp = new Date().toISOString();
            let internal_notes = alert.internal_notes || '';
            internal_notes += `\n[${timestamp}] System: Escalation level ${newLevel} triggered.`;

            const updates = {
                escalation_level: newLevel,
                last_escalated_at: timestamp,
                internal_notes
            };

            if (newLevel === 3 && !alert.linked_incident_id) {
                // Create incident
                const incident = await base44.asServiceRole.entities.TelematicsIncident.create({
                    incident_type: 'escalated_alert',
                    incident_title: `Escalated: ${alert.alert_title}`,
                    incident_summary: `Alert unresolved for 30+ minutes.`,
                    related_event_ids: [alert.id],
                    primary_event_id: alert.id,
                    vehicle_id: alert.vehicle_id,
                    vin: alert.vin,
                    device_unique_id: alert.device_unique_id,
                    host_id: alert.host_id,
                    customer_id: alert.customer_id,
                    booking_id: alert.booking_id,
                    severity: 'critical',
                    status: 'open',
                    first_seen_at: timestamp,
                    last_seen_at: timestamp,
                    internal_notes: `Auto-created from escalated alert ${alert.id}`
                });
                updates.linked_incident_id = incident.id;
            }

            // Notification dispatch - DELEGATE TO CENTRAL ROUTER
            if (newLevel === 1) {
              try {
                await base44.asServiceRole.functions.invoke('routePlatformNotification', {
                  event_type: 'telematics_escalation_l1',
                  severity: 'warning',
                  category: 'telematics',
                  title: `Escalation L1: ${alert.alert_title}`,
                  message: `Alert unresolved for 5+ minutes. Host and admin notified.`,
                  alert360_event_id: alert.id,
                  vehicle_id: alert.vehicle_id,
                  host_id: alert.host_id,
                  notify_admin: true,
                  action_url: '/admin/alert360',
                });
              } catch(e) {
                updates.internal_notes += `\n[${timestamp}] System: Notification suppressed: ${e.message}`;
              }
            } else if (newLevel === 2) {
              try {
                await base44.asServiceRole.functions.invoke('routePlatformNotification', {
                  event_type: 'telematics_escalation_l2',
                  severity: 'critical',
                  category: 'telematics',
                  title: `Escalation L2: ${alert.alert_title} (15m+ unresolved)`,
                  message: `Critical telematics alert requires immediate admin attention.`,
                  alert360_event_id: alert.id,
                  vehicle_id: alert.vehicle_id,
                  notify_admin: true,
                  action_url: '/admin/alert360',
                });
              } catch(e) {
                updates.internal_notes += `\n[${timestamp}] System: Notification suppressed: ${e.message}`;
              }
            } else if (newLevel === 3) {
              try {
                await base44.asServiceRole.functions.invoke('routePlatformNotification', {
                  event_type: 'telematics_escalation_l3',
                  severity: 'critical',
                  category: 'telematics',
                  title: `Escalation L3: ${alert.alert_title} (30m+ unresolved). Incident created.`,
                  message: `CRITICAL: Telematics alert unresolved for 30+ minutes. Incident auto-created.`,
                  alert360_event_id: alert.id,
                  vehicle_id: alert.vehicle_id,
                  notify_admin: true,
                  action_url: '/admin/alert360',
                });
              } catch(e) {
                updates.internal_notes += `\n[${timestamp}] System: Notification suppressed: ${e.message}`;
              }
            }

            await base44.asServiceRole.entities.TelematicsSafetyEvent.update(alert.id, updates);
            escalatedCount++;
        }
    }

    return Response.json({ success: true, escalated: escalatedCount });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});