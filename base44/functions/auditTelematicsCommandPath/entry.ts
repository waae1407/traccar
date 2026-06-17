import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Admin-only diagnostic function.
// Audits the full command path: Base44 device record → Traccar device → Traccar command queue
// Checks all gating conditions that can block a command before Traccar sends it over UDP.

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

async function traccarFetch(path, options = {}) {
  const baseUrl  = String(Deno.env.get('TRACCAR_BASE_URL') || '').trim();
  const username = String(Deno.env.get('TRACCAR_USERNAME') || '').trim();
  const password = String(Deno.env.get('TRACCAR_PASSWORD') || '').trim();
  if (!baseUrl || !username || !password) throw new Error('Traccar credentials not configured.');
  const res = await fetch(joinUrl(baseUrl, path), {
    ...options,
    headers: {
      Authorization: 'Basic ' + btoa(`${username}:${password}`),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Traccar ${path} failed (${res.status}): ${text}`);
  return data;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const body = await req.json();
    const uniqueId = String(body.unique_id || body.device_id || '').trim().toUpperCase();
    if (!uniqueId) return Response.json({ error: 'unique_id is required' }, { status: 400 });

    const report = { unique_id: uniqueId, timestamp: new Date().toISOString(), sections: {} };

    // ── SECTION A: Base44 device record ──
    const b44Devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ unique_id: uniqueId });
    const device = b44Devices[0] || null;
    const now = Date.now();

    if (!device) {
      report.sections.base44_device = { found: false, error: 'No TelematicsDevice record found with this unique_id' };
    } else {
      const UDP_FRESH_WINDOW_MS = 10 * 1000; // Must match sendTelematicsCommand — 10s send-now window
      const lastInboundMs  = device.last_inbound_packet_at ? new Date(device.last_inbound_packet_at).getTime() : null;
      const ageSeconds     = lastInboundMs ? Math.round((now - lastInboundMs) / 1000) : null;
      // Recompute live — don't trust stored udp_session_fresh_until (may be from old 20s window)
      const isFresh        = lastInboundMs ? (now - lastInboundMs) <= UDP_FRESH_WINDOW_MS : false;

      report.sections.base44_device = {
        found: true,
        id: device.id,
        unique_id: device.unique_id,
        traccar_device_id: device.traccar_device_id,
        provider_device_id: device.provider_device_id,
        provider_key: device.provider_key,
        lifecycle_status: device.lifecycle_status,
        online_status: device.online_status,
        production_commands_enabled: device.production_commands_enabled,
        production_command_scope: device.production_command_scope,
        last_seen_at: device.last_seen_at,
        // UDP session fields
        udp_session_status: device.udp_session_status,
        last_inbound_packet_at: device.last_inbound_packet_at,
        last_inbound_packet_type: device.last_inbound_packet_type,
        udp_session_fresh_until: device.udp_session_fresh_until,
        udp_session_age_seconds: ageSeconds,
        udp_session_is_fresh: isFresh,
        // Gating analysis
        gating: {
          production_gate: device.production_commands_enabled === true ? 'PASS' : 'BLOCK — production_commands_enabled is not true',
          traccar_id_gate: device.traccar_device_id ? 'PASS' : 'BLOCK — no traccar_device_id on record',
          lifecycle_gate: ['suspended', 'retired'].includes(device.lifecycle_status) ? 'BLOCK — device lifecycle is ' + device.lifecycle_status : 'PASS',
          udp_session_gate: isFresh ? 'PASS — session fresh' : `BLOCK — session stale (${ageSeconds ?? 'no data'}s since last inbound, fresh window is 10s)`,
        }
      };
    }

    // ── SECTION B: Provider config gating ──
    if (device) {
      const providerRecords = await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: device.provider_key });
      const provider = providerRecords[0] || null;
      if (!provider) {
        report.sections.provider_config = { found: false, warning: 'No TelematicsProviderConfig found — using default fallback (dry_run, live=false)' };
      } else {
        report.sections.provider_config = {
          found: true,
          provider_key: provider.provider_key,
          execution_mode: provider.execution_mode,
          allow_live_commands: provider.allow_live_commands,
          allow_starter_commands: provider.allow_starter_commands,
          is_active: provider.is_active,
          gating: {
            execution_mode_gate: provider.execution_mode === 'production' ? 'PASS' : `BLOCK — execution_mode is "${provider.execution_mode}"`,
            live_commands_gate:  provider.allow_live_commands === true ? 'PASS' : 'BLOCK — allow_live_commands is not true',
            active_gate:         provider.is_active === true ? 'PASS' : 'BLOCK — provider is not active',
          }
        };
      }
    }

    // ── SECTION C: Traccar device record ──
    let traccarDevice = null;
    try {
      const allDevices = await traccarFetch('/api/devices', { method: 'GET' });
      const list = Array.isArray(allDevices) ? allDevices : [];
      traccarDevice = list.find((d) => String(d.uniqueId || '').trim().toUpperCase() === uniqueId)
        || list.find((d) => String(d.name || '').trim().toUpperCase() === uniqueId)
        || null;

      if (!traccarDevice) {
        report.sections.traccar_device = { found: false, error: `Device ${uniqueId} not found in Traccar (searched ${list.length} devices)` };
      } else {
        const lastUpdateMs = traccarDevice.lastUpdate ? new Date(traccarDevice.lastUpdate).getTime() : null;
        const lastUpdateAge = lastUpdateMs ? Math.round((now - lastUpdateMs) / 1000) : null;
        report.sections.traccar_device = {
          found: true,
          id: traccarDevice.id,
          uniqueId: traccarDevice.uniqueId,
          name: traccarDevice.name,
          status: traccarDevice.status,           // online/offline/unknown
          lastUpdate: traccarDevice.lastUpdate,
          lastUpdate_age_seconds: lastUpdateAge,
          positionId: traccarDevice.positionId,
          attributes: traccarDevice.attributes,
          // ID sync check
          id_sync: device ? (String(device.traccar_device_id) === String(traccarDevice.id) ? 'IN SYNC' : `MISMATCH — Base44 has "${device.traccar_device_id}", Traccar has "${traccarDevice.id}"`) : 'N/A — no Base44 device',
        };
      }
    } catch (err) {
      report.sections.traccar_device = { found: false, error: err.message };
    }

    // ── SECTION D: Recent Traccar commands queue ──
    try {
      const traccarDeviceId = traccarDevice?.id;
      if (traccarDeviceId) {
        // Fetch pending commands in Traccar queue
        const commands = await traccarFetch(`/api/commands?deviceId=${traccarDeviceId}`, { method: 'GET' }).catch(() => []);
        const commandList = Array.isArray(commands) ? commands : [];

        // Also fetch sent command logs from Traccar (last 20)
        const recentCommandsLog = await traccarFetch(`/api/commands?deviceId=${traccarDeviceId}&limit=20`, { method: 'GET' }).catch(() => []);

        report.sections.traccar_command_queue = {
          queued_commands_count: commandList.length,
          queued_commands: commandList.map((c) => ({
            id: c.id,
            deviceId: c.deviceId,
            type: c.type,
            attributes: c.attributes,
            textChannel: c.textChannel
          }))
        };
      } else {
        report.sections.traccar_command_queue = { skipped: true, reason: 'No Traccar device found to query commands for' };
      }
    } catch (err) {
      report.sections.traccar_command_queue = { error: err.message };
    }

    // ── SECTION E: Recent Base44 commands for this device ──
    if (device) {
      const recentCmds = await base44.asServiceRole.entities.TelematicsCommand.filter(
        { telematics_device_id: device.id }, '-created_date', 15
      );
      report.sections.base44_recent_commands = recentCmds.map((c) => ({
        id: c.id,
        command_type: c.command_type,
        queue_status: c.queue_status,
        status: c.status,
        confirmation_status: c.confirmation_status,
        production_command: c.production_command,
        sent_at: c.sent_at,
        created_at: c.created_at || c.created_date,
        failure_reason: c.failure_reason,
        udp_gate_reason: c.udp_gate_reason,
        udp_gate_blocked_at: c.udp_gate_blocked_at,
        hex_payload_prefix: c.hex_payload ? c.hex_payload.slice(0, 20) + '...' : null,
        hex_payload_length_bytes: c.hex_payload ? Math.floor(c.hex_payload.length / 2) : null,
        traccar_device_id: c.traccar_device_id,
        provider_response_summary: c.provider_response ? {
          has_id: !!(c.provider_response.id || c.provider_response.commandId),
          traccar_payload_device_id: c.provider_response.traccar_payload?.deviceId || c.provider_response.responses?.[0]?.traccar_payload?.deviceId || null,
          response_type: c.provider_response.type || null
        } : null
      }));
    }

    // ── SECTION F: Summary / diagnosis ──
    const blocks = [];
    const gating = report.sections.base44_device?.gating || {};
    const providerGating = report.sections.provider_config?.gating || {};
    Object.entries({ ...gating, ...providerGating }).forEach(([key, val]) => {
      if (String(val).startsWith('BLOCK')) blocks.push({ gate: key, reason: val });
    });
    if (!report.sections.traccar_device?.found) blocks.push({ gate: 'traccar_device', reason: 'Device not found in Traccar' });

    report.sections.diagnosis = {
      total_blocks: blocks.length,
      blocks,
      verdict: blocks.length === 0
        ? 'No Base44 gating blocks detected. If UDP packet is not seen in tcpdump, the block is inside Traccar (device offline in Traccar, Traccar not routing UDP, or cellular NAT expired).'
        : `${blocks.length} gate(s) are blocking command dispatch from Base44 before reaching Traccar.`,
      next_steps: blocks.length === 0 ? [
        '1. Confirm a command was actually submitted to Traccar POST /api/commands/send and received a 200 response.',
        '2. Query GET /api/commands?deviceId=<id> immediately after to confirm the command was queued.',
        '3. If queued but no UDP seen: Traccar is not routing UDP to device (session expired at Traccar transport layer).',
        '4. Check Traccar logs for UDP send errors for this device.',
        '5. Device may need to send a fresh heartbeat to re-establish NAT port mapping before Traccar can deliver.'
      ] : blocks.map((b) => `Fix: ${b.gate} — ${b.reason}`)
    };

    return Response.json({ ok: true, audit: report });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});