import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ADMIN_EMAIL = 'admin@uridehub.com';

function normalizeVin(vin) {
  return String(vin || '').trim().toUpperCase();
}

function vehicleName(vehicle) {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vin || vehicle.id;
}

async function safeSendEmail(base44, payload) {
  try {
    await base44.asServiceRole.functions.invoke('sendEmail', payload);
  } catch (error) {
    console.error('[reconcile-unlinked-installs] email failed:', error.message);
  }
}

async function resolveAlert(base44, vin, vehicle, record) {
  const alerts = await base44.asServiceRole.entities.OperationalAlert.filter({ dedupe_key: `installer_vin_not_found:${vin}` });
  if (!alerts[0]) return;
  await base44.asServiceRole.entities.OperationalAlert.update(alerts[0].id, {
    status: 'resolved',
    resolved_at: new Date().toISOString(),
    resolved_by: 'reconcileUnlinkedTelematicsInstalls',
    resolution_notes: `Matched to vehicle ${vehicle.id}.`,
    vehicle_id: vehicle.id,
    host_id: vehicle.host_id || '',
    install_record_id: record.id
  });
}

function providerAllowsProduction(providerConfig) {
  return providerConfig?.execution_mode === 'production' && providerConfig?.allow_live_commands === true;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const pending = await base44.asServiceRole.entities.TelematicsInstallRecord.filter({ vehicle_match_status: 'pending_vehicle_link' }, '-updated_date', 50);
    const linked = [];

    for (const record of pending) {
      const vin = normalizeVin(record.vin_entered || record.vin);
      if (!vin) continue;

      const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ vin });
      const vehicle = vehicles[0];
      if (!vehicle) continue;

      let host = null;
      if (vehicle.host_id) {
        const hosts = await base44.asServiceRole.entities.Host.filter({ id: vehicle.host_id });
        host = hosts[0] || null;
      }

      await base44.asServiceRole.entities.TelematicsInstallRecord.update(record.id, {
        vehicle_id: vehicle.id,
        host_id: vehicle.host_id || '',
        vehicle_match_status: 'matched'
      });

      if (record.telematics_device_id) {
        const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: record.telematics_device_id });
        const device = devices[0];
        const now = new Date().toISOString();

        // If the install passed its command tests and the provider is live,
        // complete the deferred go-live that submitTelematicsInstallation
        // could not perform (no vehicle existed at install time).
        const providerConfigs = device ? await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: device.provider_key }) : [];
        const providerConfig = providerConfigs[0] || null;

        // Personal go-live: no rental host required — just an active/trialing
        // GPS subscription on the device. The VIN match between installer and
        // owner is the security link.
        let personalSubActive = false;
        if (!host && device?.device_mode === 'personal') {
          const subs = await base44.asServiceRole.entities.GPSSubscription.filter({ device_id: device.id }, '-created_date', 3);
          personalSubActive = subs.some((s) => ['active', 'trialing'].includes(s.subscription_status));
        }

        const shouldGoLive = record.install_status === 'completed' && providerAllowsProduction(providerConfig) && (!!host || personalSubActive);

        const deviceUpdate = {
          vehicle_id: vehicle.id,
          host_id: vehicle.host_id || '',
          assigned_status: 'assigned',
          lifecycle_status: shouldGoLive ? 'live_enabled' : 'installation_completed',
          production_commands_enabled: shouldGoLive ? true : device?.production_commands_enabled,
          production_command_scope: shouldGoLive ? 'all_supported_commands' : device?.production_command_scope,
          production_enabled_at: shouldGoLive ? now : device?.production_enabled_at || '',
          production_enabled_by: shouldGoLive ? 'reconcileUnlinkedTelematicsInstalls' : device?.production_enabled_by || '',
          live_enabled_at: shouldGoLive ? now : device?.live_enabled_at || ''
        };
        await base44.asServiceRole.entities.TelematicsDevice.update(record.telematics_device_id, deviceUpdate);

        if (shouldGoLive) {
          await base44.asServiceRole.entities.Vehicle.update(vehicle.id, {
            telematics_provider: device?.provider_key || 'traccar_noran_mt20',
            telematics_device_id: record.telematics_device_id,
            remote_unlock_capable: providerConfig?.supports_unlock === true || device?.lock_unlock_enabled === true
          });
        }
      }

      await resolveAlert(base44, vin, vehicle, record);

      const wentLive = record.install_status === 'completed' && (!!host || (device?.device_mode === 'personal'));
      const subject = 'Pending telematics install linked to vehicle';
      const body = `<p>Device ${record.device_unique_id || record.telematics_device_id} has been linked to ${vehicleName(vehicle)} after VIN ${vin} was added.${wentLive ? ' Production commands are now enabled and the device is live.' : ''}</p>`;
      await safeSendEmail(base44, { to: ADMIN_EMAIL, subject, body });
      if (host?.email) await safeSendEmail(base44, { to: host.email, subject, body });

      linked.push({ install_record_id: record.id, vehicle_id: vehicle.id, host_id: vehicle.host_id || '', vin, went_live: wentLive });
    }

    return Response.json({ ok: true, checked: pending.length, linked });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});