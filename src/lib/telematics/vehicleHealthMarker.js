// Vehicle Health Marker — shared utility for building Leaflet divIcons
// with battery + GPS health dots and abnormal-state badges.
// Used by admin fleet map, host telematics map, and customer Find My Vehicle map.

const STALE_DATA_MS = 15 * 60 * 1000;      // voltage/position older than 15 min = stale
const GPS_STALE_MS = 30 * 60 * 1000;       // GPS older than 30 min = stale
const GPS_OFFLINE_MS = 2 * 60 * 60 * 1000; // GPS older than 2 hr = offline

const BATTERY_HEALTHY_V = 12.2;
const BATTERY_LOW_V = 12.0;

// Audience density controls which abnormal badges appear.
// admin  = everything (door, trunk, unlocked, smoke, starter, ignition)
// host   = door, trunk, unlocked, starter, ignition (smoke is admin-only safety)
// customer = unlocked only (security-relevant to them; rest is admin's concern)
export const VEHICLE_HEALTH_DENSITY = {
  admin: { showSmoke: true, showStarter: true, showDoor: true, showTrunk: true, showUnlocked: true, showIgnition: true },
  host: { showSmoke: false, showStarter: true, showDoor: true, showTrunk: true, showUnlocked: true, showIgnition: true },
  customer: { showSmoke: false, showStarter: false, showDoor: false, showTrunk: false, showUnlocked: true, showIgnition: false },
};

function ageMs(dateValue) {
  if (!dateValue) return Infinity;
  const time = new Date(dateValue).getTime();
  return Number.isNaN(time) ? Infinity : Date.now() - time;
}

// Compute overall vehicle health from device telemetry.
// Returns { tier, battery, gps, abnormals, isStale, voltage, lastSeenMs }
export function computeVehicleHealth(device) {
  const voltage = Number(device?.battery_voltage ?? device?.voltage ?? device?.power_voltage ?? 0);
  const voltageAge = ageMs(device?.voltage_last_seen_at || device?.last_seen_at);
  const positionAge = ageMs(device?.last_seen_at || device?.location_updated_at);
  const isStale = voltageAge > STALE_DATA_MS && positionAge > STALE_DATA_MS;

  // Battery classification
  let battery;
  if (!Number.isFinite(voltage) || voltage <= 0 || voltageAge > STALE_DATA_MS) {
    battery = { state: 'unknown', color: '#6b7280', label: 'No recent battery data' };
  } else if (voltage >= BATTERY_HEALTHY_V) {
    battery = { state: 'healthy', color: '#10b981', label: `${voltage.toFixed(1)}V — healthy` };
  } else if (voltage >= BATTERY_LOW_V) {
    battery = { state: 'low', color: '#eab308', label: `${voltage.toFixed(1)}V — charge soon` };
  } else {
    battery = { state: 'critical', color: '#ef4444', label: `${voltage.toFixed(1)}V — may not start` };
  }

  // GPS classification
  let gps;
  if (device?.online_status === 'offline' || positionAge > GPS_OFFLINE_MS) {
    gps = { state: 'offline', color: '#ef4444', label: 'GPS offline' };
  } else if (positionAge > GPS_STALE_MS) {
    gps = { state: 'stale', color: '#eab308', label: 'GPS stale' };
  } else if (positionAge < 5 * 60 * 1000) {
    gps = { state: 'live', color: '#10b981', label: 'GPS live' };
  } else {
    gps = { state: 'ok', color: '#10b981', label: 'GPS recent' };
  }

  // Abnormal states (only populated when abnormal)
  const abnormals = [];
  if (device?.door_open) abnormals.push({ type: 'door', icon: '🚗', label: 'Door open' });
  if (device?.trunk_open) abnormals.push({ type: 'trunk', icon: '📦', label: 'Trunk open' });
  if (device?.smoke_detected) abnormals.push({ type: 'smoke', icon: '💨', label: 'Smoke detected' });
  if (device?.starter_disabled) abnormals.push({ type: 'starter', icon: '🔒', label: 'Starter disabled' });
  if (device?.ignition_status === 'on') abnormals.push({ type: 'ignition', icon: '🔑', label: 'Engine running' });

  // Overall tier: gray (stale) > red (critical) > yellow (warning) > green (healthy)
  let tier;
  if (isStale) {
    tier = { color: '#6b7280', label: 'Stale data' };
  } else if (
    battery.state === 'critical' ||
    gps.state === 'offline' ||
    device?.smoke_detected
  ) {
    tier = { color: '#ef4444', label: 'Critical' };
  } else if (
    battery.state === 'low' ||
    gps.state === 'stale' ||
    device?.door_open ||
    device?.trunk_open ||
    device?.starter_disabled
  ) {
    tier = { color: '#eab308', label: 'Warning' };
  } else {
    tier = { color: '#10b981', label: 'Healthy' };
  }

  return { tier, battery, gps, abnormals, isStale, voltage, positionAge };
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Build the Leaflet divIcon HTML for a vehicle health marker.
// audience: 'admin' | 'host' | 'customer'
// label: vehicle name/plate shown in the bubble
export function buildVehicleHealthIconHtml(device, label, audience = 'admin') {
  const health = computeVehicleHealth(device);
  const density = VEHICLE_HEALTH_DENSITY[audience] || VEHICLE_HEALTH_DENSITY.admin;
  const markerColor = health.tier.color;

  // Battery dot
  const batteryDot = `
    <div title="${escapeHtml(health.battery.label)}" style="
      width:10px;height:10px;border-radius:50%;background:${health.battery.color};
      border:1.5px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);flex:0 0 auto;
    "></div>`;

  // GPS dot
  const gpsDot = `
    <div title="${escapeHtml(health.gps.label)}" style="
      width:10px;height:10px;border-radius:50%;background:${health.gps.color};
      border:1.5px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);flex:0 0 auto;
    "></div>`;

  // Abnormal badges (filtered by audience density)
  const badges = health.abnormals
    .filter(a => {
      if (a.type === 'smoke') return density.showSmoke;
      if (a.type === 'starter') return density.showStarter;
      if (a.type === 'door') return density.showDoor;
      if (a.type === 'trunk') return density.showTrunk;
      if (a.type === 'ignition') return density.showIgnition;
      return true; // unlocked always shown if present
    })
    .map(a => `
      <div title="${escapeHtml(a.label)}" style="
        display:flex;align-items:center;justify-content:center;
        width:16px;height:16px;border-radius:50%;
        background:#ef4444;border:1.5px solid white;
        font-size:9px;line-height:1;box-shadow:0 1px 3px rgba(0,0,0,0.4);flex:0 0 auto;
      ">${a.icon}</div>`)
    .join('');

  // Car SVG
  const carSvg = `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
      <circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>
    </svg>`;

  // For customer view: no label bubble, just the marker + dots (cleaner)
  if (audience === 'customer') {
    return `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.35));">
        <div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:${markerColor};border-radius:50%;border:2.5px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.4);">${carSvg}</div>
        <div style="display:flex;gap:3px;align-items:center;">
          ${batteryDot}${gpsDot}${badges}
        </div>
      </div>`;
  }

  // Admin / host view: car circle + label bubble + health dots below
  return `
    <div style="display:flex;flex-direction:column;align-items:flex-start;gap:3px;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.35));">
      <div style="display:flex;align-items:center;gap:6px;">
        <div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;background:${markerColor};border-radius:50%;border:2px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.3);flex:0 0 auto;">${carSvg}</div>
        <div style="max-width:118px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:1px solid rgba(15,23,42,0.16);background:rgba(255,255,255,0.94);color:#0f172a;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:800;line-height:1;">${escapeHtml(label)}</div>
      </div>
      <div style="display:flex;gap:3px;align-items:center;padding-left:4px;">
        ${batteryDot}${gpsDot}${badges}
      </div>
    </div>`;
}

// Build the full Leaflet divIcon config
export function buildVehicleHealthIcon(device, label, audience = 'admin') {
  const html = buildVehicleHealthIconHtml(device, label, audience);
  // Icon size varies: customer is compact (no label), admin/host wider
  if (audience === 'customer') {
    return {
      html,
      className: 'vehicle-health-marker',
      iconSize: [40, 56],
      iconAnchor: [20, 20],
      popupAnchor: [0, -24],
    };
  }
  return {
    html,
    className: 'vehicle-health-marker',
    iconSize: [170, 58],
    iconAnchor: [18, 18],
    popupAnchor: [0, -24],
  };
}