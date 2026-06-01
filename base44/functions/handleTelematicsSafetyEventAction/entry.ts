import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ACTIVE_BOOKING_STATUSES = ['active', 'approved', 'confirmed'];

function isActivePaidRental(booking) {
  return booking && ACTIVE_BOOKING_STATUSES.includes(booking.booking_status) && booking.payment_status !== 'failed';
}

function eventTitle(event) {
  return event.event_type === 'possible_accident' ? 'Possible Accident Detected' : 'Vehicle Movement Detected';
}

async function getHostForUser(base44, user) {
  const byEmail = user?.email ? await base44.asServiceRole.entities.Host.filter({ email: user.email }) : [];
  if (byEmail[0]) return byEmail[0];
  const byUser = user?.id ? await base44.asServiceRole.entities.Host.filter({ user_id: user.id }) : [];
  return byUser[0] || null;
}

async function assertAccess(base44, user, event, action) {
  if (user.role === 'admin') return { actorRole: 'admin' };
  if (user.role === 'installer') throw new Error('Installers cannot access safety events.');
  if (user.role === 'host') {
    const host = await getHostForUser(base44, user);
    if (!host || host.id !== event.host_id) throw new Error('Host can only access safety events for assigned vehicles.');
    return { actorRole: 'host' };
  }
  const booking = event.booking_id ? (await base44.asServiceRole.entities.BookingRequest.filter({ id: event.booking_id }))[0] : null;
  const ownsBooking = booking && (booking.user_email === user.email || booking.user_id === user.id);
  const allowedCustomerActions = ['movement_expected', 'movement_investigate', 'accident_ok', 'accident_need_help'];
  if (!ownsBooking || !isActivePaidRental(booking) || !allowedCustomerActions.includes(action)) throw new Error('Customer safety event access requires an active paid rental.');
  return { actorRole: 'customer', booking };
}

async function sendEmailIfConfigured(to, subject, body) {
  const apiKey = String(Deno.env.get('RESEND_API_KEY') || '');
  if (!apiKey || !to) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'uRideHub <alerts@uridehub.com>', to, subject, text: body })
  }).catch(() => null);
}

async function sendSmsIfConfigured(to, body) {
  const sid = String(Deno.env.get('TWILIO_ACCOUNT_SID') || '');
  const token = String(Deno.env.get('TWILIO_AUTH_TOKEN') || '');
  const from = String(Deno.env.get('TWILIO_PHONE_NUMBER') || '');
  if (!sid || !token || !from || !to) return;
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${sid}:${token}`), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  }).catch(() => null);
}

async function notifyStakeholders(base44, event, message, options = {}) {
  const now = new Date().toISOString();
  const booking = event.booking_id ? (await base44.asServiceRole.entities.BookingRequest.filter({ id: event.booking_id }))[0] : null;
  const host = event.host_id ? (await base44.asServiceRole.entities.Host.filter({ id: event.host_id }))[0] : null;
  const title = eventTitle(event);
  const notifications = [
    { recipient_role: 'admin', title, body: message, message, domain: 'telematics', severity: options.severity || event.severity || 'warning', type: 'telematics', source_entity_type: 'TelematicsSafetyEvent', source_entity_id: event.id, action_url: '/admin/telematics-operations' }
  ];
  if (host?.email) notifications.push({ recipient_role: 'host', recipient_email: host.email, title, body: message, message, domain: 'telematics', severity: options.severity || event.severity || 'warning', type: 'telematics', source_entity_type: 'TelematicsSafetyEvent', source_entity_id: event.id, action_url: '/host/telematics' });
  if (booking?.user_email && options.includeCustomer) notifications.push({ recipient_role: 'customer', recipient_email: booking.user_email, user_email: booking.user_email, user_id: booking.user_id || '', title, body: message, message, domain: 'telematics', severity: options.severity || event.severity || 'warning', type: 'telematics', source_entity_type: 'TelematicsSafetyEvent', source_entity_id: event.id, action_url: '/my-bookings' });
  for (const notification of notifications) await base44.asServiceRole.entities.Notification.create({ ...notification, delivery_channels: ['in_app', 'email', 'sms'], delivery_status: 'pending', created_at: now });
  await sendEmailIfConfigured(host?.email, title, message);
  await sendSmsIfConfigured(host?.phone, message);
  if (options.includeCustomer && booking) {
    await sendEmailIfConfigured(booking.user_email, title, message);
    await sendSmsIfConfigured(booking.customer_phone, message);
  }
}

async function createIncident(base44, event, reason) {
  return await base44.asServiceRole.entities.OperationalAlert.create({
    alert_type: event.event_type === 'possible_accident' ? 'command_failed' : 'device_offline',
    severity: 'critical',
    status: 'new',
    title: `${eventTitle(event)} - Incident`,
    message: `${reason}. Last known location: ${event.last_known_location || 'unknown'}`,
    recommended_action: 'Review location, contact customer/host, and dispatch help if needed.',
    assigned_role: 'admin',
    source_entity_type: 'TelematicsSafetyEvent',
    source_entity_id: event.id,
    domain: 'telematics',
    action_url: '/admin/telematics-operations',
    provider_key: event.provider_key,
    telematics_device_id: event.telematics_device_id,
    vehicle_id: event.vehicle_id,
    host_id: event.host_id,
    dedupe_key: `safety_incident:${event.id}:${reason}`,
    metadata: { safety_event_id: event.id, event_type: event.event_type, last_known_location: event.last_known_location }
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    let event = null;
    if (body.event_id) {
      try {
        event = (await base44.asServiceRole.entities.TelematicsSafetyEvent.filter({ id: body.event_id }))[0] || null;
      } catch {
        event = null;
      }
    }
    if (!event) return Response.json({ error: 'Safety event not found.' }, { status: 404 });
    const action = String(body.action || '');
    const access = await assertAccess(base44, user, event, action);
    const now = new Date().toISOString();
    let update = {};
    let message = '';

    if (action === 'movement_expected') {
      update = { status: 'false_alarm', severity: 'info', customer_response: 'expected', resolved_at: now };
      message = 'Customer confirmed vehicle movement was expected.';
    } else if (action === 'movement_investigate') {
      update = { status: 'escalated', severity: 'critical', customer_response: 'investigate' };
      message = 'Customer requested investigation for unexpected parked vehicle movement.';
      await createIncident(base44, event, message);
    } else if (action === 'accident_ok') {
      update = { status: 'customer_confirmed_safe', customer_response: 'safe', severity: 'info' };
      message = 'Customer confirmed they are OK after a possible accident alert.';
    } else if (action === 'accident_need_help') {
      update = { status: 'escalated', severity: 'critical', customer_response: 'need_help' };
      message = `Customer requested help after possible accident. Location: ${event.last_known_location || 'unknown'}`;
      await createIncident(base44, event, message);
    } else if (action === 'mark_false_alarm' && ['admin', 'host'].includes(access.actorRole)) {
      update = { status: 'false_alarm', severity: 'info', [`${access.actorRole}_response`]: 'false_alarm', resolved_at: now };
      message = `${access.actorRole} marked safety event as false alarm.`;
    } else if (action === 'create_incident' && ['admin', 'host'].includes(access.actorRole)) {
      update = { status: 'escalated', severity: 'critical', [`${access.actorRole}_response`]: 'create_incident' };
      message = `${access.actorRole} created an incident from the safety event.`;
      await createIncident(base44, event, message);
    } else if (action === 'resolve_event' && ['admin', 'host'].includes(access.actorRole)) {
      update = { status: 'resolved', [`${access.actorRole}_response`]: 'resolved', resolved_at: now };
      message = `${access.actorRole} resolved the safety event.`;
    } else {
      return Response.json({ error: 'Action not allowed.' }, { status: 403 });
    }

    const updated = await base44.asServiceRole.entities.TelematicsSafetyEvent.update(event.id, update);
    await notifyStakeholders(base44, { ...event, ...updated }, message, { severity: update.severity || event.severity, includeCustomer: false });
    return Response.json({ ok: true, event: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});