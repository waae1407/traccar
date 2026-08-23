/**
 * detectParasiteDraw — Parasitic battery drain detection & auto-remediation
 *
 * Runs every 5 minutes. For each parked MT20 device:
 *   1. Analyzes all voltage samples since parked_at (capped at 24h), skipping the
 *      first 90s of surface charge. Requires ≥10 min of settled data.
 *   2. Calculates drain rate (V/hr) via linear regression, with R² confidence
 *      gating to suppress unreliable fits. Projects time-to-dead, health score
 *   3. Creates/updates a BatteryHealthScorecard
 *   4. Auto-remediates severe drains by sending power-save (019,0) via Traccar
 *   5. Verifies previous auto-remediations succeeded
 *   6. Sends email + SMS + push notifications to host and admin on severe/critical
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const APP_URL = 'https://uridehub.com';
const ANALYSIS_WINDOW_HOURS = 24;      // Cap lookback at 24h (adaptive: uses parked_at → now)
// Surface-charge settle: skip the first 90s after parking — alternator/module
// wake-up charge bleeds off quickly, and including it inflates resting voltage.
const SURFACE_CHARGE_SETTLE_MS = 90 * 1000;
// Minimum settled window before computing a drain rate. Shorter windows are too
// noisy to be actionable (sensor resolution is ~0.1V; need enough span to see a
// real downward trend emerge from the noise).
const MIN_SETTLED_DATA_MS = 10 * 60_000;
// R² confidence threshold for the regression slope. Below this, a non-trivial
// drain rate is treated as unreliable (noise, not a real trend) and suppressed.
// Flat data (slope ≈ 0) is always trusted regardless of R².
const MIN_R2_FOR_DRAIN = 0.3;
const DEAD_VOLTAGE = 10.5;
const AUTO_REMEDIATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const NOTIFICATION_COOLDOWN_MS = 2 * 60 * 60 * 1000;
// Voltage below which we send restore-starter (007,1,0) instead of power-save (019,0).
// At 11.2V the MT20 is 2.2V above its 9V floor — reliable command reception.
// Below this, the relay must be CLOSED so the vehicle can be jump-started after
// the battery dies. Power-save (019,0) would leave the relay OPEN.
const RESTORE_VOLTAGE_THRESHOLD = 11.2;

// ── Thresholds ──
const DRAIN = { healthy: 0.2, warning: 0.5, severe: 1.0 };
const VOLTAGE = { healthy: 12.7, warning: 12.2, severe: 11.5, critical: 10.8 };
// Auto-remediation (auto-send power-save) triggers below this voltage.
const REMEDIATION_VOLTAGE = 12.7;
// Send alert email to host+admin when voltage drops to this level (12.2V ≈ 50% capacity)
const ALERT_VOLTAGE = 12.2;
const REMEDIATION_NOTE = 'Please jump-start the vehicle and keep it running for at least 30 minutes to recharge the battery — it is currently at approximately 50% capacity.';

// ── MT20 packet building (replicated from bulkSendNoranRelayPowerSave) ──
function sanitizeId(v = '') { return String(v).replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 80); }
function bytesToHex(bytes) { return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase(); }

function buildMt20WrappedPacket(asciiCommand) {
  const sMarkHex = '0D0A2A4B5700';
  const packetLenHex = '4400';
  const cmdHex = '0200';
  const gisIpHex = '741E649C';
  const portHex = '5B9A';
  const sEndHex = '0D0A';
  const sDataBytes = new TextEncoder().encode(asciiCommand);
  if (sDataBytes.length > 50) throw new Error('sData exceeds 50 bytes');
  const padded = new Uint8Array(50);
  padded.set(sDataBytes);
  return `${sMarkHex}${packetLenHex}${cmdHex}${gisIpHex}${portHex}${bytesToHex(padded)}${sEndHex}`;
}

function buildPowerSaveAscii(deviceId, mode) {
  const d = new Date();
  const hhmmss = [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map(n => String(n).padStart(2, '0')).join('');
  return `*KW,${sanitizeId(deviceId)},019,${hhmmss},${mode}#`;
}

async function sendPowerSaveViaTraccar(device) {
  const baseUrl = Deno.env.get('TRACCAR_BASE_URL');
  const username = Deno.env.get('TRACCAR_USERNAME');
  const password = Deno.env.get('TRACCAR_PASSWORD');
  if (!baseUrl || !username || !password) return { ok: false, error: 'TRACCAR_NOT_CONFIGURED' };

  const ascii = buildPowerSaveAscii(device.unique_id, 0);
  const hex = buildMt20WrappedPacket(ascii);
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/commands/send`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ deviceId: Number(device.traccar_device_id), type: 'custom', attributes: { data: hex } }),
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) return { ok: false, error: `Traccar (${res.status})` };
    return { ok: true, ascii, hex, response: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Restore starter (007,1,0) — closes the relay so the vehicle can crank ──
// Sent instead of power-save when voltage ≤ RESTORE_VOLTAGE_THRESHOLD.
function buildRestoreStarterAscii(deviceId) {
  const d = new Date();
  const hhmmss = [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map(n => String(n).padStart(2, '0')).join('');
  return `*KW,${sanitizeId(deviceId)},007,${hhmmss},1,0#`;
}

async function sendRestoreStarterViaTraccar(device) {
  const baseUrl = Deno.env.get('TRACCAR_BASE_URL');
  const username = Deno.env.get('TRACCAR_USERNAME');
  const password = Deno.env.get('TRACCAR_PASSWORD');
  if (!baseUrl || !username || !password) return { ok: false, error: 'TRACCAR_NOT_CONFIGURED' };

  const ascii = buildRestoreStarterAscii(device.unique_id);
  const hex = buildMt20WrappedPacket(ascii);
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/commands/send`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ deviceId: Number(device.traccar_device_id), type: 'custom', attributes: { data: hex } }),
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) return { ok: false, error: `Traccar (${res.status})` };
    return { ok: true, ascii, hex, response: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Voltage extraction from TelematicsEvent ──
function extractVoltage(event) {
  const p = event.raw_payload || {};
  return p.battery_voltage ?? p.power_voltage ?? p.external_voltage ?? p.voltage ?? null;
}

// ── Median of an array of numbers (robust against transient spikes) ──
function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ── Linear regression (least-squares fit) for drain rate ──
// Fits voltage vs time across ALL settled samples. The slope IS the drain rate.
// Far more reliable than two-point comparison, especially for slow parasitic
// draws where the total delta over the window is near sensor resolution (0.1V).
// More parked time = more points = more confident slope.
function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  const sumT = points.reduce((s, p) => s + p.t, 0);
  const sumV = points.reduce((s, p) => s + p.v, 0);
  const sumTT = points.reduce((s, p) => s + p.t * p.t, 0);
  const sumTV = points.reduce((s, p) => s + p.t * p.v, 0);
  const meanT = sumT / n;
  const meanV = sumV / n;
  const denom = sumTT - n * meanT * meanT;
  if (denom === 0) return null; // zero variance in time = flat
  const slope = (sumTV - n * meanT * meanV) / denom;   // V per ms
  const intercept = meanV - slope * meanT;
  // R² — confidence of the fit (1 = perfect, 0 = no correlation)
  const ssTot = points.reduce((s, p) => s + (p.v - meanV) ** 2, 0);
  const ssRes = points.reduce((s, p) => s + (p.v - (intercept + slope * p.t)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

// ── Battery health score (0-100) ──
function calcBatteryHealthScore(restingVoltage, drainRate) {
  let score = 100;
  if (restingVoltage < 11.5) score -= 50;
  else if (restingVoltage < 11.8) score -= 40;
  else if (restingVoltage < 12.0) score -= 30;
  else if (restingVoltage < 12.2) score -= 20;
  else if (restingVoltage < 12.4) score -= 10;

  if (drainRate > 1.0) score -= 40;
  else if (drainRate > 0.5) score -= 30;
  else if (drainRate > 0.3) score -= 20;
  else if (drainRate > 0.1) score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function healthLabel(score) {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'fair';
  if (score >= 40) return 'poor';
  return 'critical';
}

function classifySeverity(restingVoltage, drainRate, projectedDead) {
  if (restingVoltage < VOLTAGE.critical || (projectedDead !== null && projectedDead < 4)) return 'critical';
  if (drainRate > DRAIN.severe || restingVoltage < VOLTAGE.severe) return 'severe';
  if (drainRate > DRAIN.warning || restingVoltage <= VOLTAGE.warning) return 'warning';
  return 'healthy';
}

// ── Relay state & start status ──
// Determines if the starter relay is OPEN (blocking starter) or CLOSED (allowing crank).
// Looks at recent ActivityEvents to find the last relay command sent, plus device state.
//
// MT20 relay commands and their direct relay impact:
//   007,1,0  → Restore Starter  → relay CLOSED (starter can crank)
//   007,1,1  → Starter Kill     → relay OPEN   (starter blocked — immobilized)
//   019,0    → Power-save ON    → relay OPEN while parked (auto-closes on ignition)
//   019,1    → Power-save OFF   → relay CLOSED
async function getLastRelayCommand(base44, deviceId) {
  const events = await base44.asServiceRole.entities.ActivityEvent.filter({
    event_type: 'gps.device_config_traccar_sent',
    target_id: deviceId,
  }, '-created_date', 10).catch(() => []);

  for (const event of events) {
    const ascii = event.metadata?.ascii || '';
    const summary = (event.summary || '').toLowerCase();

    // Parse from ascii (most reliable) — full command format: *KW,ID,CCC,HHMMSS[,ARGS]#
    // 007,1,1 = starter kill → relay OPEN
    if (/007,\d{6},1,1/.test(ascii)) {
      return { command: 'starter_kill', relay_state: 'open', sent_at: event.created_date };
    }
    // 007,1,0 = restore starter → relay CLOSED
    if (/007,\d{6},1,0/.test(ascii)) {
      return { command: 'restore_starter', relay_state: 'closed', sent_at: event.created_date };
    }
    // 019,0 = power-save ON → relay OPEN (while parked, auto-closes on ignition)
    if (/019,\d{6},0/.test(ascii)) {
      return { command: 'power_save', relay_state: 'open', sent_at: event.created_date };
    }
    // 019,1 = power-save OFF → relay CLOSED
    if (/019,\d{6},1/.test(ascii)) {
      return { command: 'power_save_off', relay_state: 'closed', sent_at: event.created_date };
    }

    // Fallback: parse from summary if ascii not available
    if (summary.includes('starter kill') || summary.includes('immobiliz') || summary.includes('starter disable')) {
      return { command: 'starter_kill', relay_state: 'open', sent_at: event.created_date };
    }
    if (summary.includes('restore')) {
      return { command: 'restore_starter', relay_state: 'closed', sent_at: event.created_date };
    }
    if (summary.includes('power-save off') || summary.includes('power save off')) {
      return { command: 'power_save_off', relay_state: 'closed', sent_at: event.created_date };
    }
    if (summary.includes('power-save') || summary.includes('power save')) {
      return { command: 'power_save', relay_state: 'open', sent_at: event.created_date };
    }
  }
  return null;
}

function computeStartStatus(device, lastRelayCommand, restingVoltage) {
  let relayState = 'unknown';
  const lastRelayCommandType = lastRelayCommand?.command || null;
  const lastRelayCommandAt = lastRelayCommand?.sent_at || null;

  if (device.ignition_status === 'on') {
    relayState = 'closed'; // ignition on = relay closed (firmware clears power-save on ACC)
  } else if (lastRelayCommand) {
    relayState = lastRelayCommand.relay_state;
  } else if (device.starter_disabled) {
    relayState = 'open';
  } else {
    relayState = 'closed'; // default: no command sent, no starter disable
  }

  let willStart = true;
  let noStartReason = '';

  // Only an explicit starter kill (007,1,1) or the starter_disabled flag
  // actually blocks the starter. Power-save (019,0) opens the relay WHILE
  // PARKED but the MT20 firmware auto-closes it when ignition turns on,
  // so it does NOT prevent starting.
  if (lastRelayCommand?.command === 'starter_kill' || device.starter_disabled) {
    willStart = false;
    noStartReason = 'Starter kill is ACTIVE (immobilized). Send "Restore Starter" command to re-enable. This is a GPS device issue, not a mechanical problem.';
  } else if (restingVoltage < 10.5) {
    willStart = false;
    noStartReason = 'Battery too low to crank — needs jump-start or charge.';
  }

  return { relayState, willStart, noStartReason, lastRelayCommandType, lastRelayCommandAt };
}

// ── Authorization ──
async function authorize(base44, req) {
  const user = await base44.auth.me().catch(() => null);
  if (user) {
    if (user.role !== 'admin') return { ok: false, response: Response.json({ error: 'Forbidden' }, { status: 403 }) };
    return { ok: true };
  }
  const isCron = !!(Deno.env.get('CRON_SECRET') && req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET'));
  const isScheduled = req.headers.get('x-base44-scheduled-function') === 'true';
  if (isCron || isScheduled) return { ok: true };
  return { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const auth = await authorize(base44, req);
    if (!auth.ok) return auth.response;

    const now = new Date();
    const capMs = now.getTime() - ANALYSIS_WINDOW_HOURS * 60 * 60 * 1000;
    const results = { analyzed: 0, scorecards_updated: 0, severe: 0, critical: 0, auto_remediated: 0, remediation_verified: 0, notifications_sent: 0 };

    // Fetch all active telematics devices (Noran MT20 only — that's what has voltage data)
    const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({
      provider_key: 'traccar_noran_mt20',
    }, '-updated_date', 200);

    // Fetch vehicles for name lookup
    const vehicleIds = [...new Set(devices.map(d => d.vehicle_id).filter(Boolean))];
    const vehicles = vehicleIds.length > 0
      ? await base44.asServiceRole.entities.Vehicle.filter({ _id: { $in: vehicleIds } }).catch(() => [])
      : [];

    // Fetch hosts for name/email lookup
    const hostIds = [...new Set(devices.map(d => d.host_id).filter(Boolean))];
    const hosts = hostIds.length > 0
      ? await base44.asServiceRole.entities.Host.filter({ _id: { $in: hostIds } }).catch(() => [])
      : [];

    const vehicleMap = new Map(vehicles.map(v => [v.id, v]));
    const hostMap = new Map(hosts.map(h => [h.id, h]));

    for (const device of devices) {
      if (['retired', 'suspended'].includes(device.lifecycle_status)) continue;
      if (!device.traccar_device_id) continue;
      // Only track devices that are physically installed AND production-enabled.
      if (device.install_status !== 'installed') continue;
      if (!device.production_commands_enabled) continue;
      results.analyzed++;

      const vehicle = device.vehicle_id ? vehicleMap.get(device.vehicle_id) : null;
      const host = device.host_id ? hostMap.get(device.host_id) : null;
      const vehicleName = vehicle ? `${vehicle.make} ${vehicle.model} ${vehicle.year || ''}`.trim() : device.unique_id;
      const hostName = host?.full_name || host?.business_name || host?.email || '';
      const hostEmail = host?.email || '';

      // Fetch events for this device in the analysis window
      // Adaptive window: start from parked_at if available, capped at 24h.
      // Uses all data since the vehicle parked — more points = more reliable
      // regression slope, especially for slow parasitic draws.
      const parkedAtMs = device.parked_at ? new Date(device.parked_at).getTime() : null;
      const windowStartMs = parkedAtMs ? Math.max(parkedAtMs, capMs) : capMs;
      const windowStartIso = new Date(windowStartMs).toISOString();
      const events = await base44.asServiceRole.entities.TelematicsEvent.filter({
        telematics_device_id: device.id,
        created_at: { $gte: windowStartIso },
      }, 'created_at', 500).catch(() => []);

      // Extract voltage samples
      const samples = events
        .map(e => ({ t: new Date(e.created_at).getTime(), v: extractVoltage(e), ign: e.ignition }))
        .filter(s => s.v !== null && s.v > 0)
        .sort((a, b) => a.t - b.t);

      // Current voltage = latest sample
      const currentVoltage = samples.length > 0 ? samples[samples.length - 1].v : (device.battery_voltage ?? device.power_voltage ?? 0);

      // Only analyze parked (ignition off) samples after surface charge settle
      const parkedSamples = samples.filter(s => s.ign === false);
      if (parkedSamples.length === 0) {
        // Device is driving or no parked data — update scorecard with minimal data
        await upsertScorecard(base44, {
          telematics_device_id: device.id,
          vehicle_id: device.vehicle_id || '',
          host_id: device.host_id || '',
          vehicle_name: vehicleName,
          host_name: hostName,
          host_email: hostEmail,
          device_unique_id: device.unique_id,
          current_voltage: currentVoltage,
          resting_voltage: currentVoltage,
          drain_rate_v_per_hr: 0,
          projected_hours_to_dead: null,
          severity: 'healthy',
          battery_health_score: calcBatteryHealthScore(currentVoltage, 0),
          battery_health_label: healthLabel(calcBatteryHealthScore(currentVoltage, 0)),
          voltage_samples_30min: samples.slice(-12).map(s => ({ t: new Date(s.t).toISOString(), v: s.v })),
          ignition_status: device.ignition_status || 'unknown',
          online_status: device.online_status || 'unknown',
          relay_state: device.ignition_status === 'on' ? 'closed' : 'unknown',
          will_start: device.ignition_status === 'on' || (currentVoltage >= 10.5),
          no_start_reason: currentVoltage < 10.5 ? 'Battery too low to crank — needs jump-start or charge.' : '',
          last_analysis_at: now.toISOString(),
        }, results);
        continue;
      }

      // Skip first 30 min of surface charge bleed (alternator/module wake-up charge
      // takes 30+ minutes to dissipate to true resting voltage)
      const firstParkedTime = parkedSamples[0].t;
      const settledSamples = parkedSamples.filter(s => s.t >= firstParkedTime + SURFACE_CHARGE_SETTLE_MS);

      // Need at least 30 min of settled data for a reliable drain calculation
      const settledSpan = settledSamples.length >= 2
        ? settledSamples[settledSamples.length - 1].t - settledSamples[0].t
        : 0;

      let restingVoltage = currentVoltage;
      let drainRate = 0;

      if (settledSamples.length >= 2 && settledSpan >= MIN_SETTLED_DATA_MS) {
        // Linear regression across ALL settled samples — slope = drain rate.
        // Uses every data point instead of two 10-min slices, giving a far more
        // reliable slope for slow parasitic draws where total delta is near
        // sensor resolution (0.1V). More parked time = more points = better fit.
        const reg = linearRegression(settledSamples.map(s => ({ t: s.t, v: s.v })));
        if (reg) {
          // Slope is V/ms; convert to V/hr. Negative slope = voltage dropping = drain.
          drainRate = -reg.slope * 3_600_000;
          if (drainRate < 0) drainRate = 0; // voltage recovering or stable = no drain
          // R² confidence gating: a low R² with a non-trivial drain means the
          // fit is unreliable (noisy data, ignition blips, sensor jitter). Only
          // trust the drain rate if the fit is confident OR the slope is near-zero
          // (flat data legitimately has low R² — that's "no drain", not "unknown").
          if (drainRate > DRAIN.warning && reg.r2 < MIN_R2_FOR_DRAIN) {
            drainRate = 0;
          }
          // Resting voltage = median of last 20 min of settled data (robust current reading)
          const last20MinStart = settledSamples[settledSamples.length - 1].t - 20 * 60_000;
          const recentSamples = settledSamples.filter(s => s.t >= last20MinStart);
          restingVoltage = recentSamples.length > 0
            ? median(recentSamples.map(s => s.v))
            : settledSamples[settledSamples.length - 1].v;
        } else {
          // Regression failed (zero variance) — voltage is perfectly flat
          restingVoltage = median(settledSamples.map(s => s.v));
        }
      } else {
        // Not enough settled data — use latest parked voltage as resting, no drain calc
        restingVoltage = parkedSamples[parkedSamples.length - 1].v;
      }

      // Projected time-to-dead
      let projectedDead = null;
      if (drainRate > 0.01) {
        projectedDead = (restingVoltage - DEAD_VOLTAGE) / drainRate;
        if (projectedDead < 0) projectedDead = 0;
      }

      // Health score + severity
      const healthScore = calcBatteryHealthScore(restingVoltage, drainRate);
      const severity = classifySeverity(restingVoltage, drainRate, projectedDead);

      // Downsample for sparkline (max 12 points) — use settled samples if available
      const sparkSource = settledSamples.length >= 2 ? settledSamples : parkedSamples;
      const sparkline = [];
      const step = Math.max(1, Math.floor(sparkSource.length / 12));
      for (let i = 0; i < sparkSource.length; i += step) {
        sparkline.push({ t: new Date(sparkSource[i].t).toISOString(), v: sparkSource[i].v });
      }

      // Check existing scorecard for auto-remediation state
      const existingCards = await base44.asServiceRole.entities.BatteryHealthScorecard.filter({
        telematics_device_id: device.id,
      }, '-updated_date', 1).catch(() => []);
      const existing = existingCards[0];

      // ── Post-action verification ──
      let remediationVerified = existing?.remediation_verified || false;
      let remediationVerifiedAt = existing?.remediation_verified_at || null;
      if (existing?.auto_remediated && !remediationVerified && drainRate < DRAIN.healthy) {
        remediationVerified = true;
        remediationVerifiedAt = now.toISOString();
        results.remediation_verified++;
      }

      // ── Auto-remediation ──
      // Trigger when voltage < 12.7V (REMEDIATION_VOLTAGE).
      let autoRemediated = existing?.auto_remediated || false;
      let autoRemediatedAt = existing?.auto_remediated_at || null;
      let powerSaveActive = existing?.power_save_active || false;
      let shouldAutoRemediate = false;

      if (restingVoltage < REMEDIATION_VOLTAGE && !autoRemediated) {
        const cooldownExpired = !autoRemediatedAt || (now.getTime() - new Date(autoRemediatedAt).getTime() > AUTO_REMEDIATION_COOLDOWN_MS);
        if (cooldownExpired) {
          shouldAutoRemediate = true;
        }
      }

      if (shouldAutoRemediate) {
        // Voltage-gated: if voltage ≤ 11.2V, send restore-starter (007,1,0) to
        // close the relay so the vehicle can be jump-started after the battery dies.
        // Above 11.2V, send power-save (019,0) to stop the parasitic drain.
        const isLowVoltage = restingVoltage <= RESTORE_VOLTAGE_THRESHOLD;
        const remResult = isLowVoltage
          ? await sendRestoreStarterViaTraccar(device)
          : await sendPowerSaveViaTraccar(device);
        if (remResult.ok) {
          autoRemediated = true;
          autoRemediatedAt = now.toISOString();
          powerSaveActive = !isLowVoltage;
          results.auto_remediated++;

          await base44.asServiceRole.entities.ActivityEvent.create({
            event_type: 'gps.device_config_traccar_sent',
            actor_id: 'system',
            actor_email: 'system@uride',
            actor_role: 'system',
            target_entity: 'TelematicsDevice',
            target_id: device.id,
            vehicle_id: device.vehicle_id || '',
            summary: isLowVoltage
              ? `Auto-remediation: restore-starter (007,1,0) sent to ${device.unique_id} — voltage ${restingVoltage.toFixed(1)}V ≤ ${RESTORE_VOLTAGE_THRESHOLD}V, relay CLOSED for jump-start safety`
              : `Auto-remediation: power-save (019,0) sent to ${device.unique_id} — drain ${drainRate.toFixed(2)}V/hr detected`,
            metadata: { source: 'detectParasiteDraw', drain_rate: drainRate, resting_voltage: restingVoltage, severity, is_low_voltage: isLowVoltage, command: isLowVoltage ? '007,1,0' : '019,0', ascii: remResult.ascii },
            source: 'automation',
            event_status: 'success',
          }).catch(() => {});
        }
      }

      // ── Notifications ──
      let lastNotificationAt = existing?.last_notification_at || null;
      const shouldNotify = (restingVoltage <= ALERT_VOLTAGE || severity === 'severe' || severity === 'critical') &&
        (!lastNotificationAt || (now.getTime() - new Date(lastNotificationAt).getTime() > NOTIFICATION_COOLDOWN_MS));

      if (shouldNotify && host) {
        const severityLabel = severity === 'critical' ? 'CRITICAL' : severity === 'severe' ? 'SEVERE' : 'WARNING';
        const title = `🔋 ${severityLabel} Battery Drain — ${vehicleName}`;
        const message = `Parasitic drain detected on ${vehicleName} (${device.unique_id}).\n\n` +
          `Voltage: ${restingVoltage.toFixed(1)}V\n` +
          `Drain rate: ${drainRate.toFixed(2)}V/hr\n` +
          (projectedDead !== null ? `Battery dead in ~${projectedDead.toFixed(1)} hours\n` : '') +
          (autoRemediated ? `\n✅ Power-save auto-applied — relay released.\n` : '') +
          `\n⚠️ ${REMEDIATION_NOTE}\n` +
          `\nView details: ${APP_URL}${device.host_id ? '/host/telematics' : '/admin/battery-health'}`;

        await base44.asServiceRole.functions.invoke('routePlatformNotification', {
          event_type: 'parasite_draw_detected',
          severity: severity === 'critical' ? 'critical' : 'warning',
          category: 'telematics',
          title,
          message,
          vehicle_id: device.vehicle_id || '',
          host_id: device.host_id || '',
          action_url: device.host_id ? '/host/telematics' : '/admin/battery-health',
          source_function: 'detectParasiteDraw',
          metadata: {
            drain_rate: drainRate,
            resting_voltage: restingVoltage,
            projected_hours_to_dead: projectedDead,
            severity,
            auto_remediated: autoRemediated,
            device_unique_id: device.unique_id,
            financial_impact_amount: 0,
          },
          notify_admin: true,
        }).catch(() => {});

        lastNotificationAt = now.toISOString();
        results.notifications_sent++;
      }

      if (severity === 'severe') results.severe++;
      if (severity === 'critical') results.critical++;

      // ── Relay state & start status ──
      const lastRelayCommand = await getLastRelayCommand(base44, device.id);
      const startStatus = computeStartStatus(device, lastRelayCommand, restingVoltage);

      // Sync power_save_active from the last detected relay command.
      // If a power-save (019,0) was sent (manually or by auto-remediation), the
      // relay is OPEN while parked → power_save_active = true.
      // If power-save-off (019,1), restore-starter (007,1,0), or starter-kill
      // (007,1,1) was the last command, power-save is no longer active.
      if (lastRelayCommand) {
        if (lastRelayCommand.command === 'power_save') {
          powerSaveActive = true;
        } else if (['power_save_off', 'restore_starter', 'starter_kill'].includes(lastRelayCommand.command)) {
          powerSaveActive = false;
        }
      }

      // ── Upsert scorecard ──
      await upsertScorecard(base44, {
        telematics_device_id: device.id,
        vehicle_id: device.vehicle_id || '',
        host_id: device.host_id || '',
        vehicle_name: vehicleName,
        host_name: hostName,
        host_email: hostEmail,
        device_unique_id: device.unique_id,
        current_voltage: currentVoltage,
        resting_voltage: restingVoltage,
        drain_rate_v_per_hr: Math.round(drainRate * 100) / 100,
        projected_hours_to_dead: projectedDead !== null ? Math.round(projectedDead * 10) / 10 : null,
        severity,
        battery_health_score: healthScore,
        battery_health_label: healthLabel(healthScore),
        power_save_active: powerSaveActive,
        relay_state: startStatus.relayState,
        will_start: startStatus.willStart,
        no_start_reason: startStatus.noStartReason,
        last_relay_command: startStatus.lastRelayCommandType,
        last_relay_command_at: startStatus.lastRelayCommandAt,
        auto_remediated: autoRemediated,
        auto_remediated_at: autoRemediatedAt,
        remediation_verified: remediationVerified,
        remediation_verified_at: remediationVerifiedAt,
        voltage_samples_30min: sparkline,
        ignition_status: device.ignition_status || 'unknown',
        online_status: device.online_status || 'unknown',
        last_notification_at: lastNotificationAt,
        last_analysis_at: now.toISOString(),
      }, results);
    }

    console.log(`[detectParasiteDraw] Analyzed ${results.analyzed} devices — severe:${results.severe} critical:${results.critical} auto-remediated:${results.auto_remediated} verified:${results.remediation_verified} notifications:${results.notifications_sent}`);
    return Response.json({ ok: true, ...results, timestamp: now.toISOString() });
  } catch (error) {
    console.error('[detectParasiteDraw] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function upsertScorecard(base44, data, results) {
  const existing = await base44.asServiceRole.entities.BatteryHealthScorecard.filter({
    telematics_device_id: data.telematics_device_id,
  }, '-updated_date', 1).catch(() => []);

  if (existing[0]) {
    await base44.asServiceRole.entities.BatteryHealthScorecard.update(existing[0].id, data).catch(() => {});
  } else {
    await base44.asServiceRole.entities.BatteryHealthScorecard.create(data).catch(() => {});
  }
  results.scorecards_updated++;
}