import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

/**
 * convertToHost — Converts a GPS-only customer into a host partner.
 *
 * Flow:
 *   1. Verify the user has a personal-mode GPS device
 *   2. Create a Host record (status: pending)
 *   3. Create a Vehicle record from the device's existing info (or a minimal placeholder)
 *   4. Transition the TelematicsDevice from personal → rental mode
 *   5. Keep the GPSSubscription active (no service gap)
 *   6. Return the new host + vehicle IDs for redirect to the host onboarding wizard
 *
 * The frontend then redirects to /host/vehicles/setup?vehicle_id=<new_vehicle_id>
 * so the host can complete compliance, pricing, and marketplace listing.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { vehicle_make, vehicle_model, vehicle_year, vehicle_color, vehicle_plate, vehicle_vin } = await req.json().catch(() => ({}));

    // 1. Find the user's personal-mode device(s)
    const devices = await base44.entities.TelematicsDevice.filter({
      owner_user_id: user.id,
      device_mode: 'personal',
    }, '-created_date', 10);

    if (devices.length === 0) {
      return Response.json({
        error: 'No personal GPS device found. You need an active GPS subscription to convert to a host.',
      }, { status: 404 });
    }

    const device = devices[0];

    // Check if already a host
    const existingHosts = await base44.entities.Host.filter({ email: user.email }, '-created_date', 1);
    if (existingHosts[0] && existingHosts[0].status === 'approved') {
      return Response.json({
        error: 'You are already an approved host. Go to your host dashboard to add this vehicle.',
        already_host: true,
        host_id: existingHosts[0].id,
      }, { status: 409 });
    }

    const now = new Date().toISOString();

    // 2. Create or update Host record
    let host = existingHosts[0];
    if (!host) {
      host = await base44.entities.Host.create({
        user_id: user.id,
        full_name: user.full_name || user.email,
        email: user.email,
        status: 'pending',
        host_type: 'single_host',
        commission_rate: 0.08,
        city: '',
        state: '',
      });
    }

    // 3. Create Vehicle record
    const vehicle = await base44.entities.Vehicle.create({
      host_id: host.id,
      make: vehicle_make || 'Unknown',
      model: vehicle_model || 'Unknown',
      year: vehicle_year || new Date().getFullYear(),
      color: vehicle_color || '',
      plate: vehicle_plate || '',
      vin: vehicle_vin || device.vin || '',
      mileage: 0,
      smoking_allowed: false,
      status: 'Available',
      marketplace_visible: false,
      storefront_visible: false,
      approval_status: 'pending',
      telematics_device_id: device.id,
      telematics_provider: 'other',
      weekly_rate: 0,
      daily_rate: 0,
      monthly_rate: 0,
      minimum_rental_days: 7,
      rental_duration_type: 'weekly',
    });

    // 4. Transition device from personal → rental
    await base44.entities.TelematicsDevice.update(device.id, {
      device_mode: 'rental',
      host_id: host.id,
      vehicle_id: vehicle.id,
    });

    // 5. Link GPS subscription to the new host (if exists)
    const subs = await base44.entities.GPSSubscription.filter({ device_id: device.id }, '-created_date', 1);
    if (subs[0]) {
      await base44.entities.GPSSubscription.update(subs[0].id, {
        host_id: host.id,
      });
    }

    // 6. Create audit event
    try {
      await base44.entities.ActivityEvent.create({
        event_type: 'host.doc_uploaded',
        actor_email: user.email,
        actor_role: 'customer',
        target_entity: 'Host',
        target_id: host.id,
        target_label: 'GPS Customer → Host Conversion',
        host_id: host.id,
        summary: `Converted from GPS-only customer to host. Vehicle ${vehicle.make} ${vehicle.model} created.`,
        source: 'customer_app',
        event_status: 'success',
        metadata: { conversion: true, device_id: device.id, vehicle_id: vehicle.id, host_id: host.id },
      });
    } catch (e) {
      console.error('[convertToHost] ActivityEvent failed:', e.message);
    }

    // 7. Notify admin of new host conversion
    try {
      await base44.asServiceRole.functions.invoke('routePlatformNotification', {
        event_type: 'host_conversion',
        severity: 'info',
        category: 'system',
        title: 'GPS customer converted to host',
        message: `${user.full_name || user.email} converted from GPS-only to host. New vehicle: ${vehicle.make} ${vehicle.model}. Host pending approval.`,
        action_url: '/admin/hosts',
        metadata: { host_id: host.id, vehicle_id: vehicle.id, device_id: device.id },
        source_function: 'convertToHost',
      });
    } catch (e) {
      console.error('[convertToHost] Admin notification failed:', e.message);
    }

    return Response.json({
      ok: true,
      host_id: host.id,
      vehicle_id: vehicle.id,
      redirect_url: `/host/vehicles/setup?vehicle_id=${vehicle.id}`,
      message: 'Your host account has been created. Complete your vehicle setup to start earning.',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});