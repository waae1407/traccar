import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * getDoorInputReadout — is this device's door input real, or blind?
 *
 * The "doors locked, then a door opens → alarm" rule can only be armed on a
 * device whose door wire is PROVEN to report both states. A device whose bit 4
 * never flips is indistinguishable from a car with the wire left disconnected,
 * and arming the rule there produces a trigger that can never fire.
 *
 * Evidence comes from webhookLightLogForwarder, which stores one TelematicsEvent
 * (event_type mt20_door_input_change) per door-bit flip. 0x8009 ACK bits are
 * excluded at the source because they carry the pre-command snapshot.
 */

const PACKET_STALE_SECONDS = 120;

function minutesAgo(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 60000);
}

function secondsAgo(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round(ms / 1000));
}

function buildRow(device, events) {
  const opened = events.filter((e) => e.raw_payload?.change === 'opened');
  const closed = events.filter((e) => e.raw_payload?.change === 'closed');
  const firstReading = events.filter((e) => e.raw_payload?.change === 'first_reading');
  const lastFlip = events[0] || null;

  const doorOpen = device.door_open === true;
  let verdict = 'blind';
  let verdictLabel = 'No door activity recorded';
  let note = 'This device has never reported the door opening or closing. The wire is probably not connected, so a locked-then-opened rule would never fire.';

  if (opened.length > 0 && closed.length > 0) {
    verdict = 'verified';
    verdictLabel = 'Door input verified';
    note = 'Both states have been reported, so the sensor is live. This vehicle can be armed for locked-then-opened detection.';
  } else if (opened.length > 0 && closed.length === 0) {
    verdict = 'stuck_open';
    verdictLabel = doorOpen ? 'Door reads open continuously' : 'Only the open state was ever seen';
    note = 'The input reported open but never closed. Check the sensor and its ground before arming anything.';
  } else if (closed.length > 0 && opened.length === 0) {
    verdict = 'partial';
    verdictLabel = 'Closed state seen, open never seen';
    note = 'Only half the signal is present. Open the door while this card is watching to complete the test.';
  } else if (firstReading.length > 0) {
    verdict = 'partial';
    verdictLabel = 'One initial reading only';
    note = 'A single starting value was captured. Open and close the door to prove the input actually moves.';
  }

  // A trunk bit that sits permanently open while the door bit never moves is the
  // classic sign the door sensor is landed on the trunk pin instead of pin 9.
  if (device.trunk_open === true && verdict !== 'verified') {
    note = 'The trunk input reads open continuously while the door input never moves — the door sensor may be wired to the trunk pin. Check the Interface 2 pin 9 connection.';
  }

  const packetAge = secondsAgo(device.last_seen_at || device.last_inbound_packet_at);

  return {
    device_id: device.id,
    unique_id: device.unique_id || device.device_unique_id || '',
    vehicle_id: device.vehicle_id || '',
    model: device.model || '',
    live: {
      door_open: doorOpen,
      trunk_open: device.trunk_open === true,
      lock_state: device.lock_state || 'unknown',
      last_seen_at: device.last_seen_at || null,
      packet_age_seconds: packetAge,
      packets_stale: packetAge === null || packetAge > PACKET_STALE_SECONDS,
    },
    evidence: {
      opened_count: opened.length,
      closed_count: closed.length,
      last_opened_at: opened[0]?.created_date || null,
      last_closed_at: closed[0]?.created_date || null,
      last_flip_at: lastFlip?.created_date || null,
      last_flip_age_minutes: minutesAgo(lastFlip?.created_date),
    },
    verdict,
    verdict_label: verdictLabel,
    verdict_note: note,
    rule_ready: verdict === 'verified',
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (user?.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const fleet = body.fleet === true;
    const identifier = String(body.unique_id || body.device_id || '').trim();

    if (!fleet && !identifier) return Response.json({ error: 'unique_id or device_id is required' }, { status: 400 });

    let devices = [];
    if (fleet) {
      devices = await base44.asServiceRole.entities.TelematicsDevice.filter(
        { lifecycle_status: { $ne: 'retired' } },
        { sort: '-updated_date', limit: 200 }
      ).then((page) => page.items || []).catch(() => []);
    } else {
      // Engineers type the unique ID far more often than the record id
      const byUniqueId = await base44.asServiceRole.entities.TelematicsDevice.filter({
        unique_id: identifier.toUpperCase(),
      }, { sort: '-updated_date', limit: 1 }).then((page) => page.items || []).catch(() => []);
      const isRecordId = /^[a-f0-9]{24}$/i.test(identifier);
      devices = byUniqueId.length || !isRecordId
        ? byUniqueId
        : await base44.asServiceRole.entities.TelematicsDevice.get(identifier)
            .then((d) => [d])
            .catch(() => []);
      if (!devices.length) return Response.json({ error: `No device found for "${identifier}"` }, { status: 404 });
    }

    const ids = devices.map((d) => d.id);
    const events = ids.length
      ? await base44.asServiceRole.entities.TelematicsEvent.filter(
          { event_type: 'mt20_door_input_change', telematics_device_id: { $in: ids } },
          { sort: '-created_date', limit: fleet ? 500 : 100 }
        ).then((page) => page.items || []).catch(() => [])
      : [];

    const byDevice = new Map();
    for (const event of events) {
      const key = event.telematics_device_id;
      if (!byDevice.has(key)) byDevice.set(key, []);
      byDevice.get(key).push(event);
    }

    const rows = devices.map((device) => buildRow(device, byDevice.get(device.id) || []));

    if (!fleet) {
      const row = rows[0];
      const recent = (byDevice.get(row.device_id) || []).slice(0, 8).map((e) => ({
        at: e.created_date,
        change: e.raw_payload?.change || 'unknown',
        door_open: e.raw_payload?.door_open === true,
        lock_state: e.raw_payload?.lock_state_at_change || 'unknown',
        packet_type: e.raw_payload?.packet_type || '',
        bEnable: e.raw_payload?.bEnable ?? null,
      }));
      return Response.json({ ok: true, ...row, recent });
    }

    const summary = {
      total: rows.length,
      verified: rows.filter((r) => r.verdict === 'verified').length,
      partial: rows.filter((r) => r.verdict === 'partial').length,
      stuck_open: rows.filter((r) => r.verdict === 'stuck_open').length,
      blind: rows.filter((r) => r.verdict === 'blind').length,
    };

    return Response.json({
      ok: true,
      summary,
      // Fleet view drops the long notes — one verdict label per device is enough here
      fleet: rows.map(({ verdict_note, ...row }) => row).sort((a, b) => {
        const rank = { verified: 0, partial: 1, stuck_open: 2, blind: 3 };
        return (rank[a.verdict] ?? 9) - (rank[b.verdict] ?? 9);
      }),
    });
  } catch (error) {
    console.error('[getDoorInputReadout] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});