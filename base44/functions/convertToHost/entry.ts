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

    // 1. Find the user's personal-mode device(s) — use asServiceRole for RLS safety
    const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({
      owner_user_id: user.id,
      device_mode: 'personal',
    }, '-created_date', 10);

    if (devices.length === 0) {
      return Response.json({
        error: 'No personal GPS device found. You need an active GPS subscription to convert to a host.',
      }, { status: 404 });
    }

    const device = devices[0];

    // ── BUG FIX: Block conversion if GPS subscription is cancelled and device not returned ──
    // A customer who cancelled their subscription but kept the device should not be
    // able to convert to host and get a free device for their rental business.
    const deviceSubs = await base44.asServiceRole.entities.GPSSubscription.filter({ device_id: device.id }, '-created_date', 5);
    const activeSub = deviceSubs.find(s => ['active', 'trialing', 'pending_activation'].includes(s.subscription_status));
    const cancelledSub = deviceSubs.find(s => s.subscription_status === 'cancelled');
    if (!activeSub && cancelledSub && !cancelledSub.device_returned_at) {
      return Response.json({
        error: 'Your GPS subscription was cancelled and the device was not returned. Please return the device or pay the device fee before converting to a host.',
        subscription_id: cancelledSub.id,
        device_fee_charged: !!cancelledSub.device_fee_charged_at,
      }, { status: 403 });
    }

    // Check if already a real (non-personal) host — use asServiceRole for RLS safety
    const existingHosts = await base44.asServiceRole.entities.Host.filter({ email: user.email }, '-created_date', 5);
    const realHost = existingHosts.find((h) => h.host_type !== 'personal');
    if (realHost && realHost.status === 'approved') {
      return Response.json({
        error: 'You are already an approved host. Go to your host dashboard to add this vehicle.',
        already_host: true,
        host_id: realHost.id,
      }, { status: 409 });
    }

    const now = new Date().toISOString();

    // 2. Create or upgrade Host record
    // ── BUG FIX: Auto-approve hosts converted from GPS customers. The customer
    //    already had an approved personal host (from ensurePrivateOwnerAccount or
    //    addPrivateVehicle). Setting status to 'pending' would lock them out of
    //    both the host dashboard (HostGuard requires 'approved') and the customer
    //    GPS dashboard (device is now rental mode). Auto-approve to avoid limbo.
    let host = existingHosts[0];
    if (host && host.host_type === 'personal') {
      // Upgrade personal host to a real host — auto-approved (was already approved as personal)
      host = await base44.asServiceRole.entities.Host.update(host.id, {
        host_type: 'single_host',
        status: 'approved',
        commission_rate: 0.08,
        approved_at: now,
        approved_by: 'convertToHost',
      });
    } else if (!host) {
      host = await base44.asServiceRole.entities.Host.create({
        user_id: user.id,
        full_name: user.full_name || user.email,
        email: user.email,
        status: 'approved',
        host_type: 'single_host',
        commission_rate: 0.08,
        city: '',
        state: '',
        approved_at: now,
        approved_by: 'convertToHost',
      });
    }

    // 3. Promote existing personal vehicle (from addPrivateVehicle), or create one
    let vehicle;
    if (device.vehicle_id) {
      const existingVehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: device.vehicle_id });
      vehicle = existingVehicles[0];
      if (vehicle) {
        vehicle = await base44.asServiceRole.entities.Vehicle.update(vehicle.id, {
          host_id: host.id,
          approval_status: 'approved',
          marketplace_visible: false,
          storefront_visible: false,
          make: vehicle_make || vehicle.make || 'Unknown',
          model: vehicle_model || vehicle.model || 'Unknown',
          year: vehicle_year || vehicle.year || new Date().getFullYear(),
          color: vehicle_color || vehicle.color || '',
          plate: vehicle_plate || vehicle.plate || '',
        });
      }
    }
    if (!vehicle) {
      vehicle = await base44.asServiceRole.entities.Vehicle.create({
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
        approval_status: 'approved',
        telematics_device_id: device.id,
        telematics_provider: device.provider_key || 'other',
        weekly_rate: 0,
        daily_rate: 0,
        monthly_rate: 0,
        minimum_rental_days: 7,
        rental_duration_type: 'weekly',
      });
    }

    // 4. Transition device from personal → rental — re-enable controls if they
    //    were disabled by a previous cancellation (the host subscription or
    //    booking payment enforcement now owns the starter).
    await base44.asServiceRole.entities.TelematicsDevice.update(device.id, {
      device_mode: 'rental',
      host_id: host.id,
      vehicle_id: vehicle.id,
      controls_enabled: true,
    });

    // 5. Link GPS subscription to the new host (if exists and active)
    const subs = await base44.asServiceRole.entities.GPSSubscription.filter({ device_id: device.id }, '-created_date', 1);
    if (subs[0] && ['active', 'trialing', 'pending_activation'].includes(subs[0].subscription_status)) {
      await base44.asServiceRole.entities.GPSSubscription.update(subs[0].id, {
        host_id: host.id,
      });
    }

    // 5b. Upgrade user role to host
    try {
      await base44.asServiceRole.functions.invoke('updateUserRole', { user_id: user.id, role: 'host' });
    } catch (e) {
      console.error('[convertToHost] role upgrade failed:', e.message);
    }

    // 6. Create audit event
    try {
      await base44.asServiceRole.entities.ActivityEvent.create({
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