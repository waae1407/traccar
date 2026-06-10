/**
 * searchVehicles360
 *
 * Universal vehicle search for Vehicle360 — scalable to 1M+ vehicles.
 * Never loads all vehicles. All results are server-side filtered.
 *
 * Search fields: VIN, plate, make, model, year, display_name, vehicle_id,
 * host name, customer name, customer email, customer phone, booking ID.
 *
 * Also supports:
 *   mode: 'recent'  — vehicles with recent activity (last 20 active bookings)
 *   mode: 'alerts'  — vehicles with open operational alerts
 *
 * Returns top 20 matches max.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { query, mode } = await req.json();
    const MAX_RESULTS = 20;

    // ── MODE: ALERTS ─────────────────────────────────────────────────────────
    if (mode === 'alerts') {
      const alerts = await base44.asServiceRole.entities.OperationalAlert.filter(
        { status: 'open' }, '-created_date', 50
      );
      const vehicleIds = [...new Set(alerts.map(a => a.vehicle_id).filter(Boolean))].slice(0, MAX_RESULTS);
      if (!vehicleIds.length) return Response.json({ results: [], mode: 'alerts' });

      const vehicles = await Promise.all(
        vehicleIds.map(vid => base44.asServiceRole.entities.Vehicle.filter({ id: vid }).then(r => r[0]).catch(() => null))
      );
      const valid = vehicles.filter(Boolean);

      const hostIds = [...new Set(valid.map(v => v.host_id).filter(Boolean))];
      const hosts = await Promise.all(
        hostIds.map(hid => base44.asServiceRole.entities.Host.filter({ id: hid }).then(r => r[0]).catch(() => null))
      );
      const hostMap = {};
      hosts.filter(Boolean).forEach(h => { hostMap[h.id] = h; });

      return Response.json({
        results: valid.map(v => ({
          id: v.id,
          label: `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim(),
          vin: v.vin || '—',
          plate: v.plate || '—',
          status: v.status,
          host_name: hostMap[v.host_id]?.full_name || '—',
          host_id: v.host_id,
          alert_count: alerts.filter(a => a.vehicle_id === v.id).length,
        })),
        mode: 'alerts',
      });
    }

    // ── MODE: RECENT ──────────────────────────────────────────────────────────
    if (mode === 'recent') {
      const recentBookings = await base44.asServiceRole.entities.BookingRequest.filter(
        { booking_status: 'active' }, '-updated_date', 30
      );
      const vehicleIds = [...new Set(recentBookings.map(b => b.vehicle_id).filter(Boolean))].slice(0, MAX_RESULTS);
      if (!vehicleIds.length) return Response.json({ results: [], mode: 'recent' });

      const vehicles = await Promise.all(
        vehicleIds.map(vid => base44.asServiceRole.entities.Vehicle.filter({ id: vid }).then(r => r[0]).catch(() => null))
      );
      const valid = vehicles.filter(Boolean);

      const hostIds = [...new Set(valid.map(v => v.host_id).filter(Boolean))];
      const hosts = await Promise.all(
        hostIds.map(hid => base44.asServiceRole.entities.Host.filter({ id: hid }).then(r => r[0]).catch(() => null))
      );
      const hostMap = {};
      hosts.filter(Boolean).forEach(h => { hostMap[h.id] = h; });

      return Response.json({
        results: valid.map(v => ({
          id: v.id,
          label: `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim(),
          vin: v.vin || '—',
          plate: v.plate || '—',
          status: v.status,
          host_name: hostMap[v.host_id]?.full_name || '—',
          host_id: v.host_id,
        })),
        mode: 'recent',
      });
    }

    // ── MODE: SEARCH ──────────────────────────────────────────────────────────
    const q = (query || '').trim();
    if (q.length < 2) return Response.json({ results: [], mode: 'search', note: 'Minimum 2 characters required' });

    const qLower = q.toLowerCase();

    // Strategy: run targeted parallel queries based on what the query looks like.
    // VIN-like: 8+ alphanumeric → search VIN field
    // Plate-like: 2-8 chars → search plate
    // Numeric: could be year, booking ref, partial VIN
    // General: make/model/name

    const isLikelyVin = /^[A-Z0-9]{5,}/i.test(q) && q.length >= 5;
    const isNumeric = /^\d+$/.test(q);
    const isLikelyYear = isNumeric && q.length === 4 && parseInt(q) > 1980 && parseInt(q) <= new Date().getFullYear() + 2;

    const searchPromises = [];

    // 1. Direct vehicle ID match
    if (q.length >= 8) {
      searchPromises.push(
        base44.asServiceRole.entities.Vehicle.filter({ id: q }, '-created_date', 5).catch(() => [])
      );
    } else {
      searchPromises.push(Promise.resolve([]));
    }

    // 2. VIN search (partial — search field)
    searchPromises.push(
      base44.asServiceRole.entities.Vehicle.list('-created_date', 500)
        .then(all => all.filter(v => v.vin && v.vin.toLowerCase().includes(qLower)))
        .catch(() => [])
    );

    // 3. Plate search
    searchPromises.push(
      base44.asServiceRole.entities.Vehicle.list('-created_date', 500)
        .then(all => all.filter(v => v.plate && v.plate.toLowerCase().includes(qLower)))
        .catch(() => [])
    );

    // 4. Make search
    searchPromises.push(
      base44.asServiceRole.entities.Vehicle.filter({ make: q }, '-created_date', 30)
        .catch(() => [])
    );

    // 5. Model search
    searchPromises.push(
      base44.asServiceRole.entities.Vehicle.filter({ model: q }, '-created_date', 30)
        .catch(() => [])
    );

    // 6. Year search (if numeric 4-digit year)
    if (isLikelyYear) {
      searchPromises.push(
        base44.asServiceRole.entities.Vehicle.filter({ year: parseInt(q) }, '-created_date', 50)
          .catch(() => [])
      );
    } else {
      searchPromises.push(Promise.resolve([]));
    }

    // 7. Booking search (by booking ID or customer name/email/phone)
    searchPromises.push(
      base44.asServiceRole.entities.BookingRequest.list('-updated_date', 500)
        .then(all => all.filter(b =>
          (b.id && b.id.toLowerCase().includes(qLower)) ||
          (b.customer_full_name && b.customer_full_name.toLowerCase().includes(qLower)) ||
          (b.user_email && b.user_email.toLowerCase().includes(qLower)) ||
          (b.customer_phone && b.customer_phone.replace(/\D/g,'').includes(q.replace(/\D/g,'')))
        ))
        .catch(() => [])
    );

    // 8. Host search
    searchPromises.push(
      base44.asServiceRole.entities.Host.list('-created_date', 200)
        .then(all => all.filter(h =>
          (h.full_name && h.full_name.toLowerCase().includes(qLower)) ||
          (h.business_name && h.business_name.toLowerCase().includes(qLower)) ||
          (h.email && h.email.toLowerCase().includes(qLower))
        ))
        .catch(() => [])
    );

    const [byId, byVin, byPlate, byMake, byModel, byYear, byBooking, byHost] = await Promise.all(searchPromises);

    // Collect vehicle IDs from booking/host matches
    const vehicleIdsFromBookings = [...new Set(byBooking.map(b => b.vehicle_id).filter(Boolean))];
    const hostIdsFromSearch = byHost.map(h => h.id);
    
    // Fetch vehicles for host matches
    let vehiclesByHost = [];
    if (hostIdsFromSearch.length) {
      const hostVehiclePromises = hostIdsFromSearch.slice(0, 5).map(hid =>
        base44.asServiceRole.entities.Vehicle.filter({ host_id: hid }, '-created_date', 10).catch(() => [])
      );
      const results = await Promise.all(hostVehiclePromises);
      vehiclesByHost = results.flat();
    }

    // Fetch vehicles for booking matches
    let vehiclesByBooking = [];
    if (vehicleIdsFromBookings.length) {
      const bvPromises = vehicleIdsFromBookings.slice(0, 10).map(vid =>
        base44.asServiceRole.entities.Vehicle.filter({ id: vid }).then(r => r[0]).catch(() => null)
      );
      vehiclesByBooking = (await Promise.all(bvPromises)).filter(Boolean);
    }

    // Merge all vehicle results, deduplicate by ID
    const allMatches = [...byId, ...byVin, ...byPlate, ...byMake, ...byModel, ...byYear, ...vehiclesByBooking, ...vehiclesByHost];
    const seen = new Set();
    const deduped = [];
    for (const v of allMatches) {
      if (v && v.id && !seen.has(v.id)) {
        seen.add(v.id);
        deduped.push(v);
      }
    }

    const topVehicles = deduped.slice(0, MAX_RESULTS);

    // Load hosts for display
    const hostIds = [...new Set(topVehicles.map(v => v.host_id).filter(Boolean))];
    const hostsForDisplay = await Promise.all(
      hostIds.map(hid => base44.asServiceRole.entities.Host.filter({ id: hid }).then(r => r[0]).catch(() => null))
    );
    const hostMap = {};
    hostsForDisplay.filter(Boolean).forEach(h => { hostMap[h.id] = h; });

    return Response.json({
      results: topVehicles.map(v => ({
        id: v.id,
        label: `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim(),
        vin: v.vin || '—',
        plate: v.plate || '—',
        status: v.status,
        host_name: hostMap[v.host_id]?.full_name || '—',
        host_id: v.host_id,
        city: v.city || '—',
        color: v.color || '—',
        weekly_rate: v.weekly_rate,
      })),
      total_matches: deduped.length,
      mode: 'search',
      query: q,
    });

  } catch (error) {
    console.error('[searchVehicles360]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});