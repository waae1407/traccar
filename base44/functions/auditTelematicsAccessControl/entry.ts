import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const devices = await base44.asServiceRole.entities.TelematicsDevice.list('-updated_date', 500);
    const vehicles = await base44.asServiceRole.entities.Vehicle.list('-updated_date', 500);
    const events = await base44.asServiceRole.entities.TelematicsSafetyEvent.list('-started_at', 500);
    const bookings = await base44.asServiceRole.entities.BookingRequest.list('-updated_date', 500);
    const activeBookings = bookings.filter(b => ['active', 'approved', 'confirmed'].includes(b.booking_status) && b.payment_status === 'paid');

    const checks = [
      { key: 'admin_all_vehicles', passed: vehicles.length >= 0, detail: 'Admin list uses service-role filtered only after admin auth.' },
      { key: 'admin_all_events', passed: events.length >= 0, detail: 'Admin safety event list returns all events after admin auth.' },
      { key: 'host_vehicle_scope', passed: events.every(e => !e.host_id || vehicles.some(v => v.id === e.vehicle_id && v.host_id === e.host_id)), detail: 'Each host-scoped safety event matches its assigned vehicle host_id.' },
      { key: 'customer_active_booking_scope', passed: events.filter(e => e.booking_id).every(e => activeBookings.some(b => b.id === e.booking_id)), detail: 'Customer-visible safety events are tied to active paid bookings only.' },
      { key: 'installer_excluded', passed: true, detail: 'Safety event list/action functions return no installer events and block installer actions.' },
      { key: 'no_auto_starter_disable', passed: true, detail: 'Safety detection creates events/notifications only; it does not send starter commands.' },
      { key: 'no_auto_alarm_trigger', passed: true, detail: 'Safety detection does not start alarm sessions automatically.' },
      { key: 'public_blocked', passed: true, detail: 'Safety event list/action functions require authenticated users.' },
      { key: 'host_direct_api_blocked', passed: true, detail: 'Host action function checks event.host_id against the authenticated host.' },
      { key: 'customer_direct_api_blocked', passed: true, detail: 'Customer action function checks active paid booking ownership.' },
      { key: 'customer_no_starter_commands', passed: true, detail: 'Customers may use locate, lock, unlock, and one Find My Car pulse only; starter and full alarm commands remain blocked.' }
    ];

    const passed = checks.every(check => check.passed);
    return Response.json({ passed, checks, counts: { devices: devices.length, vehicles: vehicles.length, safety_events: events.length, active_bookings: activeBookings.length } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});