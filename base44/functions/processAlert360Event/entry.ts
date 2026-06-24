import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function normalizeTelematicsAlert(parsed, device, body, booking, vehicle, host) {
  const alerts = [];
  
  if (!parsed) {
    alerts.push(buildAlert('telematics_parser_error', 'device_health', 'warning', 'Parser error or unrecognized packet', false, false, true, true, parsed, body, device, vehicle, booking, host));
  } else {
    // Smoke
    const smokeActive = parsed.status_bits?.smokeDetected === true;
    if (smokeActive || device.smoke_detected) {
      if (smokeActive !== device.smoke_detected) {
        alerts.push(buildAlert('cabin_smoke_detected', 'safety', 'critical', smokeActive ? 'Cabin smoke detected' : 'Cabin smoke cleared', true, true, true, smokeActive, parsed, body, device, vehicle, booking, host));
      }
    }

    // Door/Trunk
    const doorActive = parsed.status_bits?.doorOpen === true || parsed.status_bits?.trunkOpen === true;
    if (doorActive !== (device.door_open === true || device.trunk_open === true)) {
      alerts.push(buildAlert('door_or_trunk_open', 'security', 'info', doorActive ? 'Door or trunk opened' : 'Doors and trunk closed', !!booking, true, true, doorActive, parsed, body, device, vehicle, booking, host));
    }

    // Battery
    if (parsed.voltage) {
      const lowBattActive = parsed.voltage < 11.8;
      if (lowBattActive !== (device.low_battery_alarm === true)) {
        alerts.push(buildAlert('low_12v_battery', 'vehicle_health', 'warning', lowBattActive ? 'Vehicle battery voltage is low' : 'Vehicle battery voltage recovered', !!booking, true, true, lowBattActive, parsed, body, device, vehicle, booking, host));
      }
    }

    // Explicit alarms
    if (parsed.event_type) {
      if (parsed.alarm_type === 'shock_alarm') alerts.push(buildAlert('impact_detected', 'safety', 'critical', 'Impact / Shock detected on vehicle', true, true, true, true, parsed, body, device, vehicle, booking, host));
      if (parsed.alarm_type === 'power_alarm') alerts.push(buildAlert('tracker_power_cut', 'security', 'critical', 'Main power cut / Tracker tamper detected', false, true, true, true, parsed, body, device, vehicle, booking, host));
      if (parsed.alarm_type === 'overspeed_alarm') alerts.push(buildAlert('overspeed_violation', 'rental_compliance', 'warning', 'Overspeed violation detected', false, true, true, true, parsed, body, device, vehicle, booking, host));
      if (parsed.alarm_type === 'geofence_alarm') alerts.push(buildAlert('geofence_breach', 'rental_compliance', 'warning', 'Geofence breach detected', false, true, true, true, parsed, body, device, vehicle, booking, host));
      if (parsed.alarm_type === 'movement_alarm') alerts.push(buildAlert('unauthorized_movement', 'security', 'critical', 'Unauthorized movement detected', !!booking, true, true, true, parsed, body, device, vehicle, booking, host));
    }
  }

  // ACK failures (if passed in body from command processor)
  if (body._ack_failure) {
    alerts.push(buildAlert('command_ack_failure', 'device_health', 'warning', `Command ACK Failed: ${body._ack_command_type}`, false, false, true, true, parsed, body, device, vehicle, booking, host, {
      command_id: body._ack_command_id,
      command_type: body._ack_command_type,
      raw_ack_hex: body._ack_raw_hex,
      ack_status: 'failed',
      ack_match_confidence: body._ack_confidence
    }));
  }

  return alerts;
}

function buildAlert(type, category, severity, message, visCust, visHost, visAdmin, active, parsed, body, device, vehicle, booking, host, extra = {}) {
  const customer_severity = visCust ? severity : 'none';
  const host_severity = visHost ? severity : 'none';
  const admin_severity = visAdmin ? severity : 'none';
  
  return {
    alert_type: type,
    alert_title: type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    alert_message: message,
    category,
    severity: admin_severity,
    customer_severity,
    host_severity,
    admin_severity,
    vehicle_id: vehicle?.id || '',
    vehicle_display_name: vehicle?.display_name || `${vehicle?.year || ''} ${vehicle?.make || ''} ${vehicle?.model || ''}`.trim(),
    vin: vehicle?.vin || '',
    device_id: device?.id || '',
    device_unique_id: device?.unique_id || '',
    provider_key: device?.provider_key || 'traccar_noran_mt20',
    host_id: vehicle?.host_id || device?.host_id || '',
    host_name: host?.full_name || host?.business_name || '',
    customer_id: booking?.user_id || '',
    customer_name: booking?.customer_full_name || '',
    booking_id: booking?.id || '',
    lat: parsed?.latitude,
    lon: parsed?.longitude,
    speed: parsed?.speed,
    battery_voltage: parsed?.voltage,
    raw_packet_hex: parsed?.raw_packet_hex || body?.raw_packet_hex || '',
    raw_packet_hex_latest: parsed?.raw_packet_hex || body?.raw_packet_hex || '',
    packet_type: parsed?.packet_type || 'unknown',
    packet_type_name: parsed?.message_type || 'unknown',
    parsed_payload_json: parsed || {},
    source: 'webhook',
    is_active: active,
    visible_to_customer: visCust,
    visible_to_host: visHost,
    visible_to_admin: visAdmin,
    ...extra
  };
}

async function resolveTelematicsAlertIfCleared(base44, alert, now) {
  const existing = await base44.asServiceRole.entities.TelematicsSafetyEvent.filter({
    vehicle_id: alert.vehicle_id,
    alert_type: alert.alert_type,
    is_active: true
  });
  
  for (const oldEv of existing) {
    await base44.asServiceRole.entities.TelematicsSafetyEvent.update(oldEv.id, {
      is_active: false,
      status: 'resolved',
      resolved_at: now,
      resolution_notes: 'Auto-resolved because device state returned normal'
    });
  }
}

async function upsertTelematicsSafetyEvent(base44, alert, now) {
  const existing = await base44.asServiceRole.entities.TelematicsSafetyEvent.filter({
    vehicle_id: alert.vehicle_id,
    alert_type: alert.alert_type,
    is_active: true
  });

  if (existing.length > 0) {
    const ev = existing[0];
    
    // Check suppression window for deduplication storms
    if (ev.suppress_until && new Date(ev.suppress_until) > new Date(now)) {
      return { event: ev, isNew: false, suppressed: true };
    }

    const updated = await base44.asServiceRole.entities.TelematicsSafetyEvent.update(ev.id, {
      occurrence_count: (ev.occurrence_count || 1) + 1,
      last_seen_at: now,
      raw_packet_hex_latest: alert.raw_packet_hex,
      parsed_payload_json: alert.parsed_payload_json,
      lat: alert.lat || ev.lat,
      lon: alert.lon || ev.lon,
      battery_voltage: alert.battery_voltage || ev.battery_voltage,
      speed: alert.speed || ev.speed
    });
    return { event: updated, isNew: false, suppressed: false };
  } else {
    alert.status = 'new';
    alert.first_seen_at = now;
    alert.last_seen_at = now;
    
    // Suppression windows
    let suppressMin = 0;
    if (alert.alert_type === 'impact_detected') suppressMin = 10;
    if (alert.alert_type === 'overspeed_violation') suppressMin = 5;
    if (alert.alert_type === 'geofence_breach') suppressMin = 60;
    if (alert.alert_type === 'telematics_parser_error') suppressMin = 10;
    if (alert.alert_type === 'command_ack_failure') suppressMin = 10;
    
    if (suppressMin > 0) {
      alert.suppress_until = new Date(Date.now() + suppressMin * 60000).toISOString();
    }
    
    const created = await base44.asServiceRole.entities.TelematicsSafetyEvent.create(alert);
    return { event: created, isNew: true, suppressed: false };
  }
}

async function upsertTelematicsIncident(base44, event, now) {
  if ((event.occurrence_count || 1) < 3) return null; // Only rollup if repeated 3+ times for now

  const incidents = await base44.asServiceRole.entities.TelematicsIncident.filter({ primary_event_id: event.id });
  if (incidents.length > 0) {
    return await base44.asServiceRole.entities.TelematicsIncident.update(incidents[0].id, {
      occurrence_count: event.occurrence_count,
      last_seen_at: now
    });
  } else {
    return await base44.asServiceRole.entities.TelematicsIncident.create({
      incident_type: 'repeated_alert',
      incident_title: `Repeated ${event.alert_title}`,
      incident_summary: `${event.alert_title} detected ${event.occurrence_count} times`,
      related_event_ids: [event.id],
      primary_event_id: event.id,
      vehicle_id: event.vehicle_id,
      vin: event.vin,
      device_unique_id: event.device_unique_id,
      host_id: event.host_id,
      customer_id: event.customer_id,
      booking_id: event.booking_id,
      severity: event.severity,
      status: 'open',
      first_seen_at: event.first_seen_at,
      last_seen_at: now,
      occurrence_count: event.occurrence_count
    });
  }
}

async function dispatchTelematicsAlertNotifications(base44, event, booking, host) {
  // Only send notifications for NEW alerts - DELEGATE TO CENTRAL ROUTER
  if (event.visible_to_customer && event.customer_id && ['cabin_smoke_detected', 'impact_detected', 'low_12v_battery', 'door_or_trunk_open'].includes(event.alert_type)) {
    await base44.asServiceRole.functions.invoke('routePlatformNotification', {
      event_type: event.alert_type,
      severity: event.customer_severity,
      category: 'telematics',
      title: event.alert_title,
      message: event.alert_message,
      booking_id: event.booking_id,
      customer_id: event.customer_id,
      vehicle_id: event.vehicle_id,
      alert360_event_id: event.id,
      action_url: '/my-bookings',
    }).catch(() => {});
  }

  if (event.visible_to_host && event.host_id && host?.email) {
    const isCritical = event.host_severity === 'critical';
    if (isCritical || ['cabin_smoke_detected', 'tracker_power_cut', 'geofence_breach', 'overspeed_violation'].includes(event.alert_type)) {
      await base44.asServiceRole.functions.invoke('routePlatformNotification', {
        event_type: event.alert_type,
        severity: event.host_severity,
        category: 'telematics',
        title: event.alert_title,
        message: event.alert_message,
        booking_id: event.booking_id,
        host_id: event.host_id,
        vehicle_id: event.vehicle_id,
        alert360_event_id: event.id,
        action_url: '/host/telematics',
        notify_admin: isCritical,
      }).catch(() => {});
    }
  }
}

Deno.serve(async (req) => {
  try {
    const { body, parsed, device, timestamp, booking, vehicle, host } = await req.json();
    const base44 = createClientFromRequest(req);
    const now = new Date().toISOString();

    const alerts = normalizeTelematicsAlert(parsed, device, body, booking, vehicle, host);

    for (const alert of alerts) {
      if (!alert.is_active) {
        await resolveTelematicsAlertIfCleared(base44, alert, now);
      } else {
        const { event, isNew, suppressed } = await upsertTelematicsSafetyEvent(base44, alert, now);
        
        if (!suppressed) {
          await upsertTelematicsIncident(base44, event, now);
        }

        if (isNew) {
          await dispatchTelematicsAlertNotifications(base44, event, booking, host);
        }
      }
    }

    return Response.json({ ok: true, processed: alerts.length });
  } catch (error) {
    console.error('Alert360 engine error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});