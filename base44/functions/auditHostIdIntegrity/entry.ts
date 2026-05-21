import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({}));
    const shouldFix = payload.fix === true;

    const bookings = await base44.asServiceRole.entities.BookingRequest.list('-created_date', 500);
    const vehicles = await base44.asServiceRole.entities.Vehicle.list('-created_date', 500);
    const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));

    const missingBookingHost = [];
    const fixedBookings = [];
    const unfixableBookings = [];

    for (const booking of bookings) {
      if (booking.host_id) continue;
      const vehicle = booking.vehicle_id ? vehicleMap.get(booking.vehicle_id) : null;
      missingBookingHost.push({
        id: booking.id,
        status: booking.booking_status || '',
        vehicle_id: booking.vehicle_id || '',
        vehicle_name: booking.vehicle_name || '',
        resolved_host_id: vehicle?.host_id || '',
      });

      if (shouldFix && vehicle?.host_id) {
        await base44.asServiceRole.entities.BookingRequest.update(booking.id, { host_id: vehicle.host_id });
        fixedBookings.push({ id: booking.id, host_id: vehicle.host_id });
      } else if (!vehicle?.host_id) {
        unfixableBookings.push({ id: booking.id, vehicle_id: booking.vehicle_id || '', reason: 'Vehicle missing host_id or vehicle not found' });
      }
    }

    const vehiclesMissingHost = vehicles
      .filter((vehicle) => !vehicle.host_id)
      .map((vehicle) => ({
        id: vehicle.id,
        name: `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim(),
        status: vehicle.status || '',
        city: vehicle.city || vehicle.current_city || '',
      }));

    const activeBookingsMissingHost = missingBookingHost.filter((b) =>
      ['pending_review', 'confirmed', 'active', 'approved', 'payment_due', 'grace_period', 'suspended'].includes(b.status)
    );

    return Response.json({
      ok: activeBookingsMissingHost.length === 0 && vehiclesMissingHost.length === 0 && unfixableBookings.length === 0,
      fix_applied: shouldFix,
      scanned: { bookings: bookings.length, vehicles: vehicles.length },
      missing_booking_host_count: missingBookingHost.length,
      active_booking_missing_host_count: activeBookingsMissingHost.length,
      fixed_booking_count: fixedBookings.length,
      vehicle_missing_host_count: vehiclesMissingHost.length,
      missing_booking_host: missingBookingHost,
      active_booking_missing_host: activeBookingsMissingHost,
      fixed_bookings: fixedBookings,
      vehicles_missing_host: vehiclesMissingHost,
      unfixable_bookings: unfixableBookings,
      safeguards: [
        'Checkout creation saves host_id from selected vehicle',
        'Vehicle validation blocks booking if host_id is missing',
        'Payment setup backfills booking host_id from vehicle and blocks if vehicle has no host',
        'Admin vehicle form requires host assignment before save',
        'Vehicle schema requires host_id for new records'
      ],
    });
  } catch (error) {
    console.error('[auditHostIdIntegrity]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});