import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const event = payload.event;
    const current = payload.data;
    const old = payload.old_data;

    // Only process update events
    if (event.type !== 'update') return Response.json({ status: 'ignored' });

    // Look for status transitions we care about: Active (pickup) and Completed (dropoff)
    const justBecameActive = current.booking_status === 'active' && old.booking_status !== 'active';
    const justCompleted = current.booking_status === 'completed' && old.booking_status !== 'completed';

    if (!justBecameActive && !justCompleted) {
      return Response.json({ status: 'no_trigger' });
    }

    // Fetch the vehicle to get the current virtual odometer
    const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: current.vehicle_id });
    const vehicle = vehicles[0];
    
    if (!vehicle || vehicle.virtual_odometer === undefined) {
      return Response.json({ status: 'no_virtual_odometer' });
    }

    // Fetch the TelematicsDevice for raw Traccar distance
    const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ vehicle_id: current.vehicle_id });
    const device = devices[0];

    const snapshotType = justBecameActive ? 'rental_pickup' : 'rental_dropoff';

    await base44.asServiceRole.entities.OdometerSnapshot.create({
      vehicle_id: vehicle.id,
      booking_id: current.id,
      snapshot_type: snapshotType,
      virtual_odometer_miles: vehicle.virtual_odometer,
      traccar_raw_distance_meters: device?.traccar_total_distance_meters || 0,
      telematics_device_id: device?.id || '',
      captured_at: new Date().toISOString(),
      notes: `Automated ${snapshotType} snapshot taken upon booking status change.`
    });

    return Response.json({ status: 'success', snapshot_type: snapshotType, miles: vehicle.virtual_odometer });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});