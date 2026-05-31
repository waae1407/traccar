export function deviceFreshness(device) {
  const source = device?.last_seen_at || device?.location_updated_at;
  if (!source) return { label: 'Unknown', tone: 'bg-gray-500/10 text-gray-400 border-gray-500/20', stale: true };
  const age = Date.now() - new Date(source).getTime();
  if (!Number.isFinite(age)) return { label: 'Unknown', tone: 'bg-gray-500/10 text-gray-400 border-gray-500/20', stale: true };
  if (age < 30 * 60 * 1000 && device?.online_status === 'online') return { label: 'Online', tone: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', stale: false };
  if (age < 6 * 60 * 60 * 1000) return { label: 'Stale', tone: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30', stale: true };
  return { label: 'Offline/Stale', tone: 'bg-red-500/10 text-red-400 border-red-500/30', stale: true };
}

export function formatDeviceTime(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

export function providerDisplayName(provider, key) {
  return provider?.provider_name || key || 'Unknown provider';
}

export function vehicleLabel(vehicle) {
  return vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vin || vehicle.id : 'No vehicle linked';
}