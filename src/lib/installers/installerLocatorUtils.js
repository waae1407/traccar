export function distanceMiles(lat1, lon1, lat2, lon2) {
  const a = Number(lat1), b = Number(lon1), c = Number(lat2), d = Number(lon2);
  if (![a,b,c,d].every(Number.isFinite)) return Infinity;
  const R = 3958.8;
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(c - a);
  const dLon = toRad(d - b);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function sortInstallers(a, b) {
  const rank = { preferred: 0, verified: 1, almost_verified: 2, in_progress: 3, not_verified: 4, suspended: 9 };
  const status = (rank[a.installer_status] ?? 5) - (rank[b.installer_status] ?? 5);
  if (status !== 0) return status;
  if (a.distance !== undefined && b.distance !== undefined) return a.distance - b.distance;
  return (b.successful_install_count || 0) - (a.successful_install_count || 0);
}

export function filterAndRankInstallers(installers, center, radius) {
  return installers
    .filter(i => i.lead_status !== 'rejected' && i.installer_status !== 'suspended')
    .map(i => ({
      ...i,
      distance: center && i.business_latitude && i.business_longitude ? distanceMiles(center.lat, center.lon, i.business_latitude, i.business_longitude) : undefined
    }))
    .filter(i => !center || i.distance === undefined || i.distance <= radius)
    .sort(sortInstallers);
}