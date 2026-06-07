import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Compatibility-only wrapper for legacy MooveTrax callers.
// Canonical vehicle command execution now routes through sendTelematicsCommand.
const MOOVETRAX_BASE = "https://www.moovetrax.com/api";
const COMMAND_ALIASES = {
  location: 'locate',
  panic: 'alarm_pulse',
  find_my_car: 'alarm_pulse',
  kill: 'disable_starter',
  unkill: 'restore_starter',
  lock: 'lock',
  unlock: 'unlock',
};
const LEGACY_DATA_COMMANDS = ['mileage', 'speed'];

async function logLegacyGpsEvent(base44, { vehicle, bookingId, deviceKey, command, user, responseStatus, payload, notes }) {
  const eventMap = {
    disable_starter: responseStatus === 'failed' ? 'kill_failed' : 'kill_sent',
    restore_starter: responseStatus === 'failed' ? 'reinstate_failed' : 'reinstate_sent',
    unlock: responseStatus === 'failed' ? 'unlock_failed' : 'unlock_sent',
  };
  await base44.asServiceRole.entities.GPSEvent.create({
    vehicle_id: vehicle?.id || '',
    booking_request_id: bookingId || '',
    device_id: deviceKey || '',
    event_type: eventMap[command] || (responseStatus === 'failed' ? 'command_failed' : 'command_sent'),
    command_sent_by: user.email,
    command_sent_at: new Date().toISOString(),
    response_status: responseStatus,
    response_payload: payload || {},
    notes: notes || 'Legacy MooveTrax compatibility event. Canonical history is TelematicsCommand.',
  });
}

async function callMoovetraxData(command, deviceKey, extraParams = {}) {
  const partnerApiKey = Deno.env.get("MOOVETRAX_PARTNER_API_KEY") || "";
  const params = new URLSearchParams({ key: deviceKey, ...(partnerApiKey && { partner_api_key: partnerApiKey }), ...extraParams });
  const res = await fetch(`${MOOVETRAX_BASE}/${command}?${params.toString()}`);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`MooveTrax ${command} failed (${res.status}): ${text}`);
  return data;
}

async function resolveVehicle(base44, { vehicle_id, booking_id }) {
  if (vehicle_id) return (await base44.asServiceRole.entities.Vehicle.filter({ id: vehicle_id }))[0] || null;
  if (!booking_id) return null;
  const booking = (await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_id }))[0];
  if (!booking?.vehicle_id) return null;
  return (await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id }))[0] || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const legacyCommand = String(body.command || body.command_type || '').trim();
    const command = COMMAND_ALIASES[legacyCommand] || legacyCommand;
    const { booking_id, vehicle_id, value } = body;

    const vehicle = await resolveVehicle(base44, { vehicle_id, booking_id });
    if (!vehicle) return Response.json({ error: "Vehicle not found" }, { status: 404 });
    if (!vehicle.moovetrax_device_id) return Response.json({ error: "This vehicle does not have a MooveTrax device configured" }, { status: 400 });

    if (vehicle_id && user.role !== 'admin') {
      const host = vehicle.host_id ? (await base44.asServiceRole.entities.Host.filter({ id: vehicle.host_id }))[0] : null;
      if (!(host?.email === user.email || host?.user_id === user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (LEGACY_DATA_COMMANDS.includes(command)) {
      if (['speed'].includes(command) && user.role !== 'admin') return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
      const result = await callMoovetraxData(command, vehicle.moovetrax_device_id, command === 'speed' && value ? { speed: String(value) } : {});
      await logLegacyGpsEvent(base44, { vehicle, bookingId: booking_id, deviceKey: vehicle.moovetrax_device_id, command, user, responseStatus: 'confirmed', payload: result, notes: `Legacy MooveTrax ${command} data request. Canonical command execution remains sendTelematicsCommand.` });
      if (command === 'mileage' && booking_id && result.mileage) await base44.asServiceRole.entities.BookingRequest.update(booking_id, { return_mileage: result.mileage });
      return Response.json({ ok: true, command, result, compatibility_only: true });
    }

    if (!COMMAND_ALIASES[legacyCommand] && !['locate', 'status', 'lock', 'unlock', 'horn', 'lights', 'horn_lights', 'alarm_pulse', 'disable_starter', 'restore_starter'].includes(command)) {
      return Response.json({ error: "Invalid command" }, { status: 400 });
    }

    const starter = command === 'disable_starter' || command === 'restore_starter';
    const canonical = await base44.functions.invoke('sendTelematicsCommand', {
      vehicle_id: vehicle.id,
      booking_id: booking_id || '',
      command_type: command,
      source: 'legacy_moovetrax_compatibility',
      reason: body.reason || (starter ? `Legacy MooveTrax ${legacyCommand} compatibility command` : ''),
      confirm_starter_command: starter || body.confirm_starter_command === true,
    });

    if (starter && booking_id) {
      await base44.asServiceRole.entities.BookingRequest.update(booking_id, {
        moovetrax_kill_active: command === 'disable_starter',
        starter_disabled: command === 'disable_starter',
      });
    }

    await logLegacyGpsEvent(base44, { vehicle, bookingId: booking_id, deviceKey: vehicle.moovetrax_device_id, command, user, responseStatus: 'confirmed', payload: canonical.data || {}, notes: 'Compatibility GPSEvent only. Canonical command history is TelematicsCommand.' });
    return Response.json({ ok: true, command, legacy_command: legacyCommand, result: canonical.data?.result || canonical.data, command_id: canonical.data?.command_id, compatibility_only: true });
  } catch (error) {
    return Response.json({ error: error.message, command_failed: true }, { status: 500 });
  }
});