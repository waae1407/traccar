import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ACTIVE_BOOKING_STATUSES = ['active', 'approved', 'confirmed'];

function isActivePaidRental(booking) {
  return booking && ACTIVE_BOOKING_STATUSES.includes(booking.booking_status) && booking.payment_status !== 'failed';
}

async function getHostForUser(base44, user) {
  const byEmail = user?.email ? await base44.asServiceRole.entities.Host.filter({ email: user.email }) : [];
  if (byEmail[0]) return byEmail[0];
  const byUser = user?.id ? await base44.asServiceRole.entities.Host.filter({ user_id: user.id }) : [];
  return byUser[0] || null;
}

async function decorateEvents(base44, events) {
  const vehicleIds = [...new Set(events.map(e => e.vehicle_id).filter(Boolean))];
  const hostIds = [...new Set(events.map(e => e.host_id).filter(Boolean))];
  const bookingIds = [...new Set(events.map(e => e.booking_id).filter(Boolean))];
  const vehicles = [];
  const hosts = [];
  const bookings = [];
  for (const id of vehicleIds) {
    const record = (await base44.asServiceRole.entities.Vehicle.filter({ id }))[0];
    if (record) vehicles.push(record);
  }
  for (const id of hostIds) {
    const record = (await base44.asServiceRole.entities.Host.filter({ id }))[0];
    if (record) hosts.push(record);
  }
  for (const id of bookingIds) {
    const record = (await base44.asServiceRole.entities.BookingRequest.filter({ id }))[0];
    if (record) bookings.push(record);
  }
  return events.map(event => {
    const vehicle = vehicles.find(v => v.id === event.vehicle_id);
    const host = hosts.find(h => h.id === event.host_id);
    const booking = bookings.find(b => b.id === event.booking_id);
    return {
      ...event,
      vehicle_label: vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : event.vehicle_id,
      host_label: host?.business_name || host?.full_name || '',
      host_phone: host?.phone || '',
      customer_label: booking?.customer_full_name || booking?.user_email || '',
      customer_phone: booking?.customer_phone || '',
      booking_status: booking?.booking_status || '',
      payment_status: booking?.payment_status || ''
    };
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    let events = [];

    if (user.role === 'admin') {
      events = await base44.asServiceRole.entities.TelematicsSafetyEvent.list('-started_at', Number(body.limit || 100));
    } else if (user.role === 'host') {
      const host = await getHostForUser(base44, user);
      if (!host) return Response.json({ events: [] });
      events = await base44.asServiceRole.entities.TelematicsSafetyEvent.filter({ host_id: host.id });
    } else if (user.role === 'customer' || !user.role || user.role === 'user') {
      const byEmail = user.email ? await base44.asServiceRole.entities.BookingRequest.filter({ user_email: user.email }) : [];
      const byUser = user.id ? await base44.asServiceRole.entities.BookingRequest.filter({ user_id: user.id }) : [];
      const activeBookingIds = [...byEmail, ...byUser].filter(isActivePaidRental).map(b => b.id);
      for (const bookingId of [...new Set(activeBookingIds)]) {
        const bookingEvents = await base44.asServiceRole.entities.TelematicsSafetyEvent.filter({ booking_id: bookingId });
        events.push(...bookingEvents);
      }
    } else {
      return Response.json({ events: [] });
    }

    if (body.status && body.status !== 'all') events = events.filter(e => e.status === body.status);
    if (body.event_type && body.event_type !== 'all') events = events.filter(e => e.event_type === body.event_type);
    if (body.vehicle_id) events = events.filter(e => e.vehicle_id === body.vehicle_id);
    if (body.booking_id) events = events.filter(e => e.booking_id === body.booking_id);
    events = events.sort((a, b) => new Date(b.started_at || b.created_date || 0) - new Date(a.started_at || a.created_date || 0)).slice(0, Number(body.limit || 100));

    return Response.json({ events: await decorateEvents(base44, events) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});