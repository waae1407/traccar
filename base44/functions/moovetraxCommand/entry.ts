import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// MooveTrax Base URL — adjust if they provide a different one
const MOOVETRAX_BASE = "https://www.moovetrax.com/api";

/**
 * Unified MooveTrax command handler.
 * Commands: location, lock, unlock, panic, kill, unkill, mileage, speed
 *
 * Auth params (per MooveTrax API):
 *   key = device-level key (stored as moovetrax_device_id on Vehicle)
 *   partner_api_key = global partner key (MOOVETRAX_PARTNER_API_KEY secret) — optional for now
 */
async function callMoovetrax(command, deviceKey, extraParams = {}) {
  const partnerApiKey = Deno.env.get("MOOVETRAX_PARTNER_API_KEY") || "";

  const params = new URLSearchParams({
    key: deviceKey,
    ...(partnerApiKey && { partner_api_key: partnerApiKey }),
    ...extraParams,
  });

  const url = `${MOOVETRAX_BASE}/${command}?${params.toString()}`;
  console.log(`[MooveTrax] ${command.toUpperCase()} → device: ${deviceKey}`);

  const res = await fetch(url, { method: "GET" });
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`MooveTrax ${command} failed (${res.status}): ${text}`);
  }

  console.log(`[MooveTrax] ${command} response:`, JSON.stringify(data));
  return data;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { command, booking_id, vehicle_id, value } = body;

    const VALID_COMMANDS = ["location", "lock", "unlock", "panic", "kill", "unkill", "mileage", "speed"];
    if (!command || !VALID_COMMANDS.includes(command)) {
      return Response.json({ error: `Invalid command. Must be one of: ${VALID_COMMANDS.join(", ")}` }, { status: 400 });
    }

    // Admin-only commands
    const ADMIN_ONLY = ["kill", "unkill", "speed"];
    if (ADMIN_ONLY.includes(command) && user.role !== "admin") {
      return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    // Resolve vehicle
    let vehicleDoc;
    if (vehicle_id) {
      const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: vehicle_id });
      vehicleDoc = vehicles[0];
    } else if (booking_id) {
      const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_id });
      const booking = bookings[0];
      if (!booking) return Response.json({ error: "Booking not found" }, { status: 404 });

      // For customer commands, verify this booking belongs to them
      if (user.role !== "admin" && booking.user_email !== user.email) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      // Customer can only control if booking is active and kill is NOT active
      if (user.role !== "admin") {
        const activeStatuses = ["active", "approved", "confirmed"];
        if (!activeStatuses.includes(booking.booking_status)) {
          return Response.json({ error: "Vehicle controls are only available for active rentals" }, { status: 403 });
        }
        if (booking.moovetrax_kill_active) {
          return Response.json({ error: "Vehicle is currently disabled due to a payment issue" }, { status: 403 });
        }
      }

      const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
      vehicleDoc = vehicles[0];
    }

    if (!vehicleDoc) {
      return Response.json({ error: "Vehicle not found" }, { status: 404 });
    }

    if (!vehicleDoc.moovetrax_device_id) {
      return Response.json({ error: "This vehicle does not have a MooveTrax device configured" }, { status: 400 });
    }

    const deviceKey = vehicleDoc.moovetrax_device_id;

    // Extra params per command
    const extraParams = {};
    if (command === "speed" && value) {
      extraParams.speed = String(value);
    }

    const result = await callMoovetrax(command, deviceKey, extraParams);

    // Post-command side-effects
    if (command === "kill" && booking_id) {
      await base44.asServiceRole.entities.BookingRequest.update(booking_id, {
        moovetrax_kill_active: true,
      });
    }
    if (command === "unkill" && booking_id) {
      await base44.asServiceRole.entities.BookingRequest.update(booking_id, {
        moovetrax_kill_active: false,
      });
    }
    if (command === "mileage" && booking_id && result.mileage) {
      await base44.asServiceRole.entities.BookingRequest.update(booking_id, {
        return_mileage: result.mileage,
      });
    }

    return Response.json({ ok: true, command, result });
  } catch (error) {
    console.error("[MooveTrax] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});