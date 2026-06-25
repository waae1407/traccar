import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * searchMarketplaceVehicles — Premium Marketplace Search
 * 
 * Turo-style search with advanced filters and commercial ranking.
 * 
 * Ranking priority (for 'recommended' sort):
 *  1. Exact city match
 *  2. Closest pickup distance
 *  3. Instant Booking
 *  4. Highest rated host
 *  5. Closest availability
 *  6. Lowest total rental price
 *  7. Featured vehicle
 *  8. Recently active host
 *  9. New listing
 * 10. Slight randomized tie-break
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    const {
      location,
      radius_miles = 50,
      pickup_date,
      return_date,
      price_min,
      price_max,
      make,
      model,
      year_min,
      year_max,
      vehicle_type,
      seats,
      fuel_type,
      transmission,
      rental_type,
      contactless_pickup,
      delivery_available,
      instant_booking,
      minimum_rental_days,
      host_rating_min,
      sort = 'recommended',
      limit = 50,
      skip = 0
    } = await req.json();

    // Build query filters
    const query = {
      status: 'Available',
      approval_status: 'approved',
      marketplace_visible: true,
      admin_marketplace_approved: true
    };

    // Location filter
    if (location?.city) {
      query.city = location.city;
    }
    if (location?.state) {
      query.state = location.state;
    }

    // Vehicle filters
    if (make) query.make = make;
    if (model) query.model = model;
    if (year_min) query.year = { $gte: year_min };
    if (year_max) {
      if (typeof query.year === 'object') query.year.$lte = year_max;
      else query.year = { $lte: year_max };
    }
    if (vehicle_type) query.vehicle_type = vehicle_type;
    if (seats) query.seats = { $gte: seats };
    if (fuel_type) query.fuel_type = fuel_type;
    if (transmission) query.transmission = transmission;

    // Rental type filters
    if (rental_type === 'daily') query.allow_daily_booking = true;
    else if (rental_type === 'weekly') query.allow_weekly_booking = true;
    else if (rental_type === 'monthly') query.allow_monthly_booking = true;
    else if (rental_type === 'rent_to_own') query.rent_to_own_eligible = true;

    // Feature filters
    if (contactless_pickup) query.contactless_pickup = true;
    if (delivery_available) query.delivery_available = true;
    if (instant_booking) query.instant_booking_enabled = true;

    // Price filter
    let priceFilter = null;
    if (price_min || price_max) {
      priceFilter = { min: price_min, max: price_max };
    }

    // Fetch vehicles
    let vehicles = await base44.entities.Vehicle.filter(query, '-created_date', limit + skip + 100);

    // Apply price filter
    if (priceFilter) {
      vehicles = vehicles.filter(v => {
        const rate = rental_type === 'monthly' ? v.monthly_rate :
                     rental_type === 'daily' ? v.daily_rate : v.weekly_rate;
        if (!rate) return false;
        if (priceFilter.min && rate < priceFilter.min) return false;
        if (priceFilter.max && rate > priceFilter.max) return false;
        return true;
      });
    }

    // Apply minimum rental days filter
    if (minimum_rental_days) {
      vehicles = vehicles.filter(v => (v.minimum_rental_days || 7) <= minimum_rental_days);
    }

    // Date-based availability filtering
    if (pickup_date && return_date) {
      const pickupDate = new Date(pickup_date + 'T00:00:00');
      const returnDate = new Date(return_date + 'T23:59:59');
      const rentalDays = Math.ceil((returnDate - pickupDate) / (1000 * 60 * 60 * 24));

      const availableVehicles = [];
      for (const vehicle of vehicles) {
        const minDays = vehicle.minimum_rental_days || 7;
        if (rentalDays < minDays) continue;

        const advanceNoticeHours = vehicle.advance_notice_hours || 0;
        if (advanceNoticeHours > 0) {
          const hoursFromNow = (pickupDate.getTime() - new Date().getTime()) / (1000 * 60 * 60);
          if (hoursFromNow < advanceNoticeHours) continue;
        }

        const BLOCKING_STATUSES = [
          'pending_payment', 'pending_review', 'approved', 'confirmed', 'checked_out',
          'active', 'return_required', 'post_inspection_required', 'overdue_return',
          'return_pending_host_review', 'grace_period', 'payment_retry',
          'payment_due', 'suspended', 'under_review'
        ];
        const BLOCKING_PHASES = [
          'payment_complete', 'pickup_required', 'checked_out', 'active',
          'return_required', 'return_in_progress', 'host_review'
        ];

        const rawConflictingBookings = await base44.asServiceRole.entities.BookingRequest.filter({
          vehicle_id: vehicle.id,
          booking_status: { $in: BLOCKING_STATUSES },
          start_date: { $lte: return_date },
          end_date: { $gte: pickup_date }
        });

        const conflictingBookings = rawConflictingBookings.filter(b => {
          if (b.is_superseded) return false;
          if (b.booking_status === 'completed' || b.booking_status === 'cancelled' || b.booking_status === 'superseded_invalid') return false;
          if (b.rental_lifecycle_phase && !BLOCKING_PHASES.includes(b.rental_lifecycle_phase)) return false;
          return true;
        });

        if (conflictingBookings.length > 0) continue;

        const availabilityRules = await base44.asServiceRole.entities.VehicleAvailabilityRule.filter({
          vehicle_id: vehicle.id,
          is_active: true,
          rule_type: { $in: ['blocked', 'maintenance', 'personal_use', 'blackout'] }
        });

        let isBlocked = false;
        for (const rule of availabilityRules) {
          const ruleStart = new Date(rule.start_date + 'T00:00:00');
          const ruleEnd = rule.end_date ? new Date(rule.end_date + 'T23:59:59') : ruleStart;
          const hasOverlap = !(returnDate <= ruleStart || pickupDate >= ruleEnd);
          if (hasOverlap) { isBlocked = true; break; }
        }
        if (isBlocked) continue;

        availableVehicles.push(vehicle);
      }
      vehicles = availableVehicles;
    }

    // ── COMMERCIAL RANKING (for 'recommended' sort) ──
    if (sort === 'recommended') {
      vehicles = await rankVehicles(base44, vehicles, location, pickup_date, return_date);
    } else if (sort === 'lowest_price') {
      vehicles.sort((a, b) => (a.weekly_rate || 999999) - (b.weekly_rate || 999999));
    } else if (sort === 'highest_price') {
      vehicles.sort((a, b) => (b.weekly_rate || 0) - (a.weekly_rate || 0));
    } else if (sort === 'newest') {
      vehicles.sort((a, b) => (b.year || 0) - (a.year || 0));
    } else if (sort === 'closest') {
      if (location?.lat && location?.lon) {
        vehicles.sort((a, b) => {
          const distA = a.vehicle_lat && a.vehicle_lon ? getDistance(location.lat, location.lon, a.vehicle_lat, a.vehicle_lon) : 999999;
          const distB = b.vehicle_lat && b.vehicle_lon ? getDistance(location.lat, location.lon, b.vehicle_lat, b.vehicle_lon) : 999999;
          return distA - distB;
        });
      }
    } else if (sort === 'available_soonest') {
      vehicles.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    }

    // Attach customer-friendly availability status to each vehicle
    vehicles = vehicles.map(v => ({
      ...v,
      availability_summary: 'available',
      availability_label: 'Available'
    }));

    // Apply pagination
    const paginatedVehicles = vehicles.slice(skip, skip + limit);

    return Response.json({
      vehicles: paginatedVehicles,
      total: vehicles.length,
      has_more: skip + limit < vehicles.length,
      filters_applied: {
        location,
        dates: { pickup_date, return_date },
        price: priceFilter,
        vehicle: { make, model, year_min, year_max },
        rental: { rental_type, contactless_pickup, delivery_available, instant_booking }
      }
    });
  } catch (error) {
    console.error('[searchMarketplaceVehicles] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── Commercial Multi-Factor Ranking ──
async function rankVehicles(base44, vehicles, location, pickupDateStr, returnDateStr) {
  if (vehicles.length === 0) return vehicles;

  const searchCity = location?.city?.toLowerCase()?.trim();
  const searchLat = location?.lat;
  const searchLon = location?.lon;
  const now = Date.now();

  // Batch-fetch host reputation summaries
  const hostIds = [...new Set(vehicles.map(v => v.host_id).filter(Boolean))];
  let hostReputationMap = {};
  let hostDataMap = {};

  if (hostIds.length > 0) {
    try {
      const [repSummaries, hosts] = await Promise.all([
        base44.asServiceRole.entities.HostReputationSummary.filter({ host_id: { $in: hostIds } }),
        base44.asServiceRole.entities.Host.filter({ id: { $in: hostIds } })
      ]);
      repSummaries.forEach(r => { if (r.host_id) hostReputationMap[r.host_id] = r; });
      hosts.forEach(h => { hostDataMap[h.id] = h; });
    } catch (_) { /* non-critical */ }
  }

  // Compute scores
  const scored = vehicles.map(v => {
    let score = 0;

    // 1. Exact city match (highest priority)
    if (searchCity && v.city && v.city.toLowerCase().trim() === searchCity) {
      score += 1000;
    }

    // 2. Closest pickup distance
    let distance = null;
    if (searchLat && searchLon && v.vehicle_lat && v.vehicle_lon) {
      distance = getDistance(searchLat, searchLon, v.vehicle_lat, v.vehicle_lon);
      // Closer = more points (max 500 for 0 miles, decays to 0 at 100+ miles)
      score += Math.max(0, 500 - distance * 5);
    }

    // 3. Instant Booking
    if (v.instant_booking_enabled !== false) {
      score += 200;
    }

    // 4. Highest rated host
    const rep = v.host_id ? hostReputationMap[v.host_id] : null;
    const hostScore = rep?.overall_score || rep?.fleet_score || 0;
    score += Math.min(200, hostScore * 2);

    // 5. Closest availability (how soon available — if no dates, newer vehicles get slight boost)
    if (pickupDateStr) {
      // Vehicle is available for the requested dates — give boost
      score += 100;
    }

    // 6. Lowest total rental price
    const rate = v.weekly_rate || 999999;
    // Lower price = more points (max 150 for $0, decays)
    score += Math.max(0, 150 - rate * 0.5);

    // 7. Featured vehicle (heuristic: has image, has trust badges, high reputation)
    if (v.image_url && hostScore > 80) {
      score += 80;
    }

    // 8. Recently active host
    const host = v.host_id ? hostDataMap[v.host_id] : null;
    if (host?.updated_date) {
      const daysSinceActive = (now - new Date(host.updated_date).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceActive < 7) score += 60;
      else if (daysSinceActive < 30) score += 30;
    }

    // 9. New listing
    if (v.created_date) {
      const daysSinceCreated = (now - new Date(v.created_date).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCreated < 30) score += 40;
      else if (daysSinceCreated < 90) score += 20;
    }

    // 10. Slight randomized tie-break
    score += Math.random() * 10;

    return { vehicle: v, score, distance };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return vehicles with distance attached
  return scored.map(s => ({
    ...s.vehicle,
    distance: s.distance !== null ? Math.round(s.distance * 10) / 10 : undefined
  }));
}

// Haversine distance in miles
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}