import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TEST_DEFINITIONS = {
  device_online: { label: 'Device online', alwaysSupported: true },
  power_voltage_test: { label: 'Power / voltage', alwaysSupported: true },
  gps_signal_test: { label: 'GPS signal', provider: 'supports_location', device: 'gps_enabled', noran: true },
  ignition_acc_test: { label: 'Ignition / ACC', alwaysSupported: true },
  lock_test: { label: 'Lock', provider: 'supports_lock', device: 'lock_unlock_enabled', noran: true },
  unlock_test: { label: 'Unlock', provider: 'supports_unlock', device: 'lock_unlock_enabled', noran: true },
  horn_test: { label: 'Horn', provider: 'supports_horn', device: 'horn_light_enabled', noran: true },
  lights_test: { label: 'Lights', provider: 'supports_lights', device: 'horn_light_enabled', noran: true },
  alarm_test: { label: 'Alarm', provider: 'supports_horn', device: 'horn_light_enabled', noran: true },
  starter_disable_test: { label: 'Starter Disable', provider: 'supports_starter_disable', noran: true },
  starter_restore_test: { label: 'Starter Restore', provider: 'supports_starter_restore', noran: true }
};

const POWER_VOLTAGE_THRESHOLD = 11.5;
const VOLTAGE_RECENT_HOURS = 24;

function isNoranMt20(providerKey, device) {
  const model = String(device?.model || '').toLowerCase();
  return providerKey === 'traccar_noran_mt20' || (model.includes('noran') && model.includes('mt20'));
}

function isSupported(definition, providerConfig, device, providerKey) {
  if (definition.alwaysSupported) return true;
  if (definition.noran && isNoranMt20(providerKey, device)) return true;
  if (definition.provider && providerConfig?.[definition.provider] === true) return true;
  if (definition.device && device?.[definition.device] === true) return true;
  return false;
}

function isRecent(value, hours = 24) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && Date.now() - time <= hours * 60 * 60 * 1000;
}

function hexToBytes(value) {
  const clean = String(value || '').replace(/^0x/i, '').replace(/[^a-fA-F0-9]/g, '');
  if (clean.length < 4 || clean.length % 2 !== 0) return null;
  const bytes = [];
  for (let i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.slice(i, i + 2), 16));
  return bytes;
}

function readUInt16LE(bytes, offset) {
  if (offset + 1 >= bytes.length) return null;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function parseRawMt20Voltage(value) {
  const bytes = hexToBytes(value);
  if (!bytes) return null;
  for (let i = 0; i < bytes.length - 5; i++) {
    const packetType = readUInt16LE(bytes, i + 2);
    if (packetType !== 0x0032 && packetType !== 0x0008) continue;
    const voltageByte = bytes[i + 5];
    if (!Number.isFinite(voltageByte) || voltageByte <= 0 || voltageByte > 250) continue;
    return {
      value: voltageByte / 10,
      source_field: packetType === 0x0032 ? 'raw_mt20_0032_nBAT' : 'raw_mt20_0008_vBAT'
    };
  }
  return null;
}

function findRawMt20Voltage(input, depth = 0) {
  if (!input || depth > 6) return null;
  if (typeof input === 'string') return parseRawMt20Voltage(input);
  if (typeof input !== 'object') return null;
  for (const value of Object.values(input)) {
    const parsed = findRawMt20Voltage(value, depth + 1);
    if (parsed) return parsed;
  }
  return null;
}

function pickVoltageDetails(...sources) {
  for (const source of sources) {
    const payload = source?.payload || {};
    const rawVoltage = findRawMt20Voltage(payload);
    if (rawVoltage) {
      return {
        value: rawVoltage.value,
        source_entity: source.entity,
        source_field: rawVoltage.source_field,
        source_timestamp: source.timestamp || payload.voltage_last_seen_at || payload.location_updated_at || payload.last_seen_at || payload.created_at || payload.created_date || null
      };
    }
    const candidates = [
      ['power_voltage', payload?.power_voltage],
      ['battery_voltage', payload?.battery_voltage],
      ['external_voltage', payload?.external_voltage],
      ['voltage', payload?.voltage],
      ['noran_mt20.power_voltage', payload?.noran_mt20?.power_voltage],
      ['noran_mt20.battery_voltage', payload?.noran_mt20?.battery_voltage],
      ['noran_mt20_8009.battery_voltage', payload?.noran_mt20_8009?.battery_voltage],
      ['raw_payload.noran_mt20.power_voltage', payload?.raw_payload?.noran_mt20?.power_voltage],
      ['raw_payload.noran_mt20.battery_voltage', payload?.raw_payload?.noran_mt20?.battery_voltage],
      ['raw_payload.noran_mt20_8009.battery_voltage', payload?.raw_payload?.noran_mt20_8009?.battery_voltage],
      ['batteryVoltage', payload?.batteryVoltage],
      ['attributes.power_voltage', payload?.attributes?.power_voltage],
      ['attributes.external_voltage', payload?.attributes?.external_voltage],
      ['attributes.battery_voltage', payload?.attributes?.battery_voltage],
      ['attributes.voltage', payload?.attributes?.voltage],
      ['position.attributes.power_voltage', payload?.position?.attributes?.power_voltage],
      ['position.attributes.external_voltage', payload?.position?.attributes?.external_voltage],
      ['position.attributes.battery_voltage', payload?.position?.attributes?.battery_voltage],
      ['position.attributes.voltage', payload?.position?.attributes?.voltage]
    ];
    for (const [field, value] of candidates) {
      const number = Number(value);
      if (Number.isFinite(number) && number > 0) {
        const normalized = /nbat|vbat/i.test(field) && number > 40 && number <= 250 ? number / 10 : number;
        return {
          value: normalized,
          source_entity: source.entity,
          source_field: field,
          source_timestamp: source.timestamp || payload.voltage_last_seen_at || payload.location_updated_at || payload.last_seen_at || payload.created_at || payload.created_date || null
        };
      }
    }
  }
  return { value: null, source_entity: '', source_field: '', source_timestamp: null };
}

async function buildAutoChecks(base44, device) {
  const events = device?.id ? await base44.asServiceRole.entities.TelematicsEvent.filter({ telematics_device_id: device.id }) : [];
  const recentEvents = events.filter(event => isRecent(event.created_at || event.created_date, 24));
  const recentGps = isRecent(device.location_updated_at || device.last_seen_at, 24) && Number.isFinite(Number(device.last_latitude)) && Number.isFinite(Number(device.last_longitude));
  const ignitionKnown = device.ignition_status && device.ignition_status !== 'unknown';
  const recentIgnition = recentEvents.some(event => typeof event.ignition === 'boolean' || ['ignition_on', 'ignition_off'].includes(event.event_type));
  const online = isRecent(device.last_seen_at || device.location_updated_at, 24) || recentEvents.length > 0;
  const voltage = pickVoltageDetails(
    { entity: 'TelematicsDevice', payload: device, timestamp: device.voltage_last_seen_at || device.location_updated_at || device.last_seen_at },
    ...recentEvents.map(event => ({ entity: 'TelematicsEvent.raw_payload', payload: event.raw_payload, timestamp: event.created_at || event.created_date }))
  );
  const voltageRecent = isRecent(voltage.source_timestamp, VOLTAGE_RECENT_HOURS);
  const numericVoltage = Number(voltage.value);
  const voltageConfirmed = Number.isFinite(numericVoltage) && numericVoltage > 0 && !String(voltage.source_field || '').includes('attributes.fuel');
  const voltageLow = voltageConfirmed && numericVoltage < POWER_VOLTAGE_THRESHOLD;
  const voltagePass = voltageConfirmed && online && numericVoltage > 0 && voltageRecent;
  const voltagePendingReason = 'No voltage detected yet. GPS and ignition checks can continue while voltage telemetry is pending.';
  const voltageFailReason = !voltageConfirmed
    ? voltagePendingReason
    : !voltageRecent
      ? `${numericVoltage.toFixed(1)}V detected but voltage reading is stale. Check current power reporting.`
      : 'Device must be online before power can pass.';
  const voltagePassMessage = voltageLow
    ? `${numericVoltage.toFixed(1)}V reported — low voltage warning for monitoring, not an installer test failure.`
    : `${numericVoltage.toFixed(1)}V reported`;

  return {
    device_online: { status: online ? 'pass' : 'fail', tip: 'Device must be online first. Check power, SIM, and antenna signal.' },
    power_voltage_test: {
      status: voltagePass ? 'pass' : !voltageConfirmed ? 'pending' : 'fail',
      value: voltageConfirmed ? voltage.value : null,
      threshold: POWER_VOLTAGE_THRESHOLD,
      low_voltage_warning: voltageLow,
      installer_exception: voltagePass && voltageLow,
      source_entity: voltage.source_entity,
      source_field: voltage.source_field,
      voltage_last_seen_at: voltage.source_timestamp,
      message: voltagePass ? voltagePassMessage : voltageFailReason,
      tip: 'No voltage reported. Check constant power, fuse, and ground.'
    },
    gps_signal_test: { status: recentGps ? 'pass' : 'fail', tip: 'Move vehicle/device where antenna has sky visibility.' },
    ignition_acc_test: { status: ignitionKnown || recentIgnition ? 'pass' : 'fail', tip: 'Turn ignition ON. Check ACC/ignition wire.' },
    audit: {
      power_voltage: {
        source_entity: voltage.source_entity,
        source_field: voltage.source_field,
        expected_value: `Any positive voltage reported within ${VOLTAGE_RECENT_HOURS} hours while device is online`,
        actual_value: voltage.value,
        monitoring_low_voltage_threshold: POWER_VOLTAGE_THRESHOLD,
        low_voltage_warning: voltageLow,
        voltage_last_seen_at: voltage.source_timestamp,
        currently_fails_because: voltagePass ? '' : voltageFailReason
      }
    }
  };
}

async function findDeviceByIdentifier(base44, identifier, providerKey) {
  const fields = ['unique_id', 'device_imei', 'provider_device_id', 'traccar_device_id', 'moovetrax_device_id'];
  for (const field of fields) {
    const query = providerKey ? { provider_key: providerKey, [field]: identifier } : { [field]: identifier };
    const matches = await base44.asServiceRole.entities.TelematicsDevice.filter(query);
    if (matches[0]) return matches[0];
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    let providerKey = String(body.provider_key || '').trim();
    const deviceId = String(body.device_id || '').trim();
    if (!deviceId) return Response.json({ error: 'device_id is required' }, { status: 400 });

    let device = await findDeviceByIdentifier(base44, deviceId, providerKey);
    if (!device) {
      device = await base44.asServiceRole.entities.TelematicsDevice.create({
        provider_key: providerKey || 'unknown',
        unique_id: deviceId,
        lifecycle_status: 'inventory',
        assigned_status: 'unassigned',
        install_status: 'not_started',
        online_status: 'unknown',
        created_at: new Date().toISOString()
      });
    }

    providerKey = device.provider_key || providerKey || 'unknown';
    const configs = await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: providerKey });
    const config = configs[0] || {};
    const tests = {};
    const labels = {};
    for (const [test, definition] of Object.entries(TEST_DEFINITIONS)) {
      tests[test] = isSupported(definition, config, device, providerKey);
      labels[test] = definition.label;
    }
    const auto_checks = await buildAutoChecks(base44, device);

    return Response.json({ ok: true, provider_key: providerKey, device_id: deviceId, model: device.model || '', device, tests, labels, auto_checks, created_pending_device: device.created_at ? false : false });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});