import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

/**
 * addPrivateVehicle — The "Add Vehicle to Map" handler for private GPS owners.
 *
 * Flow:
 *   1. Ensure a personal Host record exists for the owner
 *   2. Create a Vehicle record (owned by the personal host, not for rent)
 *   3. Find a matching completed TelematicsInstallRecord by VIN
 *   4. If found + provider live + subscription active → go live (production enabled)
 *   5. Resolve the "VIN not found" installer alert
 *
 * This is the personal go-live path — no rental host required. The VIN match
 * between installer entry and owner entry is the security link.
 */
function normalizeVin(vin) { return String(vin || '').trim().toUpperCase(); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { vin } = await req.json();
    const normalizedVin = normalizeVin(vin);
    if (!normalizedVin || normalizedVin.length < 11) {
      return Response.json({ error: 'A valid VIN is required.' }, { status: 400 });
    }

    const email = (user.email || '').toLowerCase().trim();

    // ── 1. Ensure personal host ──
    const existingHosts = await base44.asServiceRole.entities.Host.filter({ email }, '-created_date', 5);
    let host = existingHosts.find((h) => h.email === email || h.user_id === user.id);
    if (host && host.host_type !== 'personal') {
      return Response.json({ error: 'You are already a host. Add vehicles from your host dashboard.', already_host: true }, { status: 409 });
    }
    if (!host) {
      const now0 = new Date().toISOString();
      host = await base44.asServiceRole.entities.Host.create({
        user_id: user.id, full_name: user.full_name || email, email,
        status: 'approved', host_type: 'personal', commission_rate: 0,
        approved_at: now0, approved_by: 'system',
      });
    }

    // ── 2. Idempotent: vehicle with this VIN already exists for this host? ──
    const existingVehicles = await base44.asServiceRole.entities.Vehicle.filter({ vin: normalizedVin });
    const existingVehicle = existingVehicles.find((v) => v.host_id === host.id);
    if (existingVehicle) {
      return Response.json({ ok: true, vehicle_id: existingVehicle.id, already_exists: true, vehicle: existingVehicle });
    }

    // ── 3. Decode VIN for make/model/year (best-effort) ──
    let make = 'Unknown', model = 'Unknown', year = new Date().getFullYear();
    try {
      const decode = await base44.asServiceRole.functions.invoke('decodeVIN', { vin: normalizedVin });
      if (decode?.data?.make) make = decode.data.make;
      if (decode?.data?.model) model = decode.data.model;
      if (decode?.data?.year) year = Number(decode.data.year) || year;
    } catch (_) { /* non-critical */ }

    // ── 4. Create the personal vehicle ──
    const now = new Date().toISOString();
    const vehicle = await base44.asServiceRole.entities.Vehicle.create({
      host_id: host.id, vin: normalizedVin, make, model, year, mileage: 0, smoking_allowed: false,
      status: 'Available', marketplace_visible: false, storefront_visible: false,
      approval_status: 'approved', listing_type: 'rental', telematics_provider: 'none',
      weekly_rate: 0, daily_rate: 0, monthly_rate: 0, minimum_rental_days: 7, rental_duration_type: 'weekly',
    });

    // ── 5. Find matching completed install by VIN ──
    const installRecords = await base44.asServiceRole.entities.TelematicsInstallRecord.filter({ vin_entered: normalizedVin }, '-updated_date', 10);
    const matchedInstall = installRecords.find((r) => r.install_status === 'completed' || r.vehicle_match_status === 'pending_vehicle_link');
    let linkedDevice = null;
    let wentLive = false;

    if (matchedInstall?.telematics_device_id) {
      const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: matchedInstall.telematics_device_id });
      linkedDevice = devices[0];
      if (linkedDevice) {
        const providerConfigs = await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: linkedDevice.provider_key });
        const providerConfig = providerConfigs[0] || null;
        const providerLive = providerConfig?.execution_mode === 'production' && providerConfig?.allow_live_commands === true;

        // Subscription must be active or trialing for go-live
        const subs = await base44.asServiceRole.entities.GPSSubscription.filter({ device_id: linkedDevice.id }, '-created_date', 3);
        const activeSub = subs.find((s) => ['active', 'trialing'].includes(s.subscription_status));
        const subActive = !!activeSub;

        const shouldGoLive = matchedInstall.install_status === 'completed' && providerLive && subActive;

        await base44.asServiceRole.entities.TelematicsDevice.update(linkedDevice.id, {
          vehicle_id: vehicle.id, host_id: host.id, owner_user_id: user.id, owner_email: email,
          device_mode: 'personal', assigned_status: 'assigned',
          lifecycle_status: shouldGoLive ? 'live_enabled' : 'installation_completed',
          production_commands_enabled: shouldGoLive ? true : linkedDevice.production_commands_enabled,
          production_command_scope: shouldGoLive ? 'all_supported_commands' : linkedDevice.production_command_scope,
          production_enabled_at: shouldGoLive ? now : linkedDevice.production_enabled_at || '',
          production_enabled_by: shouldGoLive ? 'addPrivateVehicle' : linkedDevice.production_enabled_by || '',
          live_enabled_at: shouldGoLive ? now : linkedDevice.live_enabled_at || '',
        });

        if (shouldGoLive) {
          wentLive = true;
          await base44.asServiceRole.entities.Vehicle.update(vehicle.id, {
            telematics_provider: linkedDevice.provider_key || 'traccar_noran_mt20',
            telematics_device_id: linkedDevice.id,
            remote_unlock_capable: providerConfig?.supports_unlock === true || linkedDevice.lock_unlock_enabled === true,
          });
        }

        // Mark install record as matched
        await base44.asServiceRole.entities.TelematicsInstallRecord.update(matchedInstall.id, {
          vehicle_id: vehicle.id, host_id: host.id, vehicle_match_status: 'matched',
        });

        // Resolve the "VIN not found" installer alert
        const alerts = await base44.asServiceRole.entities.OperationalAlert.filter({ dedupe_key: `installer_vin_not_found:${normalizedVin}` });
        if (alerts[0]) {
          await base44.asServiceRole.entities.OperationalAlert.update(alerts[0].id, {
            status: 'resolved', resolved_at: now, resolved_by: 'addPrivateVehicle',
            resolution_notes: `Matched to vehicle ${vehicle.id} by owner.`, vehicle_id: vehicle.id, host_id: host.id,
          });
        }
      }
    } else {
      // No install record — check if a device already has this VIN linked
      const devicesByVin = await base44.asServiceRole.entities.TelematicsDevice.filter({ vin: normalizedVin });
      linkedDevice = devicesByVin.find((d) => d.owner_user_id === user.id || d.device_mode === 'personal');
      if (linkedDevice) {
        await base44.asServiceRole.entities.TelematicsDevice.update(linkedDevice.id, { vehicle_id: vehicle.id, host_id: host.id });
      }
    }

    // ── 6. Audit ──
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'vehicle.created', actor_id: user.id, actor_email: email, actor_role: 'customer',
      target_entity: 'Vehicle', target_id: vehicle.id, target_label: `${make} ${model}`,
      host_id: host.id, summary: `Private owner added vehicle VIN ${normalizedVin}${linkedDevice ? ' and linked to installed device' : ''}.`,
      source: 'customer_app', event_status: 'success',
      metadata: { vehicle_id: vehicle.id, vin: normalizedVin, linked_device_id: linkedDevice?.id || null, went_live: wentLive },
    }).catch(() => {});

    return Response.json({
      ok: true, vehicle_id: vehicle.id, vehicle,
      linked_device_id: linkedDevice?.id || null,
      went_live: wentLive,
      message: linkedDevice
        ? (wentLive ? 'Vehicle linked and controls activated!' : 'Vehicle linked. Controls will activate once installation is completed.')
        : 'Vehicle added. No installed device found for this VIN yet — ask your installer to complete installation first.',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});