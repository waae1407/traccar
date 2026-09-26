import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// ── Reckless Driving Detection Thresholds ──
// Only these 5 patterns are monitored. Any single pattern flags the trip as reckless.
const SUSTAINED_HIGH_SPEED_MPH = 90;
const SUSTAINED_HIGH_SPEED_MIN_DURATION_S = 30;
const RAPID_ACCEL_MAX_TIME_S = 8;
const RAPID_ACCEL_FROM_MPH = 5;
const RAPID_ACCEL_TO_MPH = 55;
const HARD_CORNERING_HEADING_DELTA_DEG = 45;
const HARD_CORNERING_MIN_SPEED_MPH = 45;
const HARD_CORNERING_MIN_COUNT = 3;
const STOP_AND_DASH_MIN_CYCLES = 2;
const STOP_AND_DASH_ACCEL_MPHPS = 8;
const SUSTAINED_SPEEDING_MPH = 80;
const SUSTAINED_SPEEDING_MIN_BURSTS = 2;
const MAX_PING_GAP_S = 60;

function headingDelta(h1, h2) {
  let diff = Math.abs(Number(h2) - Number(h1)) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

function analyzeTrip(positions) {
  const patterns = {
    sustained_high_speed: { detected: false, label: 'Sustained High Speed', description: 'Speed > 90 mph for 30+ seconds', details: [] },
    rapid_accel_burst: { detected: false, label: 'Rapid Acceleration Burst', description: '0→60 mph in under 8 seconds', details: [] },
    hard_cornering_chain: { detected: false, label: 'Hard Cornering Chain', description: '3+ sharp turns at 45+ mph', details: [] },
    stop_and_dash_cycle: { detected: false, label: 'Stop-and-Dash Cycle', description: 'Repeated hard accel + brake from stops', details: [] },
    sustained_speeding_bursts: { detected: false, label: 'Sustained Speeding Bursts', description: 'Multiple 80+ mph events in one trip', details: [] }
  };

  if (positions.length < 2) return patterns;

  const sorted = [...positions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // ── Pattern 1: Sustained high speed > 90 mph for > 30s ──
  let sustainedStart = null;
  let sustainedStartSpeed = 0;
  for (let i = 0; i < sorted.length; i++) {
    const speed = Number(sorted[i].speed || 0);
    const t = new Date(sorted[i].timestamp).getTime();
    if (speed > SUSTAINED_HIGH_SPEED_MPH) {
      if (sustainedStart === null) {
        sustainedStart = t;
        sustainedStartSpeed = speed;
      }
      const duration = (t - sustainedStart) / 1000;
      if (duration >= SUSTAINED_HIGH_SPEED_MIN_DURATION_S) {
        patterns.sustained_high_speed.detected = true;
        patterns.sustained_high_speed.details.push({
          start: new Date(sustainedStart).toISOString(),
          end: sorted[i].timestamp,
          max_speed: Math.max(sustainedStartSpeed, speed),
          duration_s: Math.round(duration),
          lat: Number(sorted[i].latitude || 0),
          lon: Number(sorted[i].longitude || 0)
        });
        break;
      }
    } else {
      sustainedStart = null;
    }
  }

  // ── Pattern 2: Rapid accel burst 0→60 in < 8s ──
  for (let i = 0; i < sorted.length - 1; i++) {
    const s1 = Number(sorted[i].speed || 0);
    const s2 = Number(sorted[i + 1].speed || 0);
    const t1 = new Date(sorted[i].timestamp).getTime();
    const t2 = new Date(sorted[i + 1].timestamp).getTime();
    const dt = (t2 - t1) / 1000;
    if (dt <= 0 || dt > MAX_PING_GAP_S) continue;
    if (s1 <= RAPID_ACCEL_FROM_MPH && s2 >= RAPID_ACCEL_TO_MPH) {
      const accelRate = (s2 - s1) / dt;
      const estimated0to60 = 60 / accelRate;
      if (estimated0to60 <= RAPID_ACCEL_MAX_TIME_S) {
        patterns.rapid_accel_burst.detected = true;
        patterns.rapid_accel_burst.details.push({
          from_speed: Math.round(s1),
          to_speed: Math.round(s2),
          estimated_0_to_60_s: Math.round(estimated0to60 * 10) / 10,
          timestamp: sorted[i].timestamp,
          lat: Number(sorted[i].latitude || 0),
          lon: Number(sorted[i].longitude || 0)
        });
        break;
      }
    }
  }

  // ── Pattern 3: Hard cornering chains — 3+ heading changes > 45° at 45+ mph ──
  let corneringCount = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const speed = Number(sorted[i].speed || 0);
    if (speed < HARD_CORNERING_MIN_SPEED_MPH) continue;
    const h1 = Number(sorted[i].heading || sorted[i].course || 0);
    const h2 = Number(sorted[i + 1].heading || sorted[i + 1].course || 0);
    const delta = headingDelta(h1, h2);
    if (delta > HARD_CORNERING_HEADING_DELTA_DEG) {
      corneringCount++;
      patterns.hard_cornering_chain.details.push({
        timestamp: sorted[i].timestamp,
        heading_delta_deg: Math.round(delta),
        speed_mph: Math.round(speed),
        lat: Number(sorted[i].latitude || 0),
        lon: Number(sorted[i].longitude || 0)
      });
    }
  }
  if (corneringCount >= HARD_CORNERING_MIN_COUNT) {
    patterns.hard_cornering_chain.detected = true;
  }

  // ── Pattern 4: Stop-and-dash cycles — 2+ full stop → hard accel → hard brake ──
  let cycles = 0;
  let state = 'stopped';
  for (let i = 0; i < sorted.length - 1; i++) {
    const s1 = Number(sorted[i].speed || 0);
    const s2 = Number(sorted[i + 1].speed || 0);
    const t1 = new Date(sorted[i].timestamp).getTime();
    const t2 = new Date(sorted[i + 1].timestamp).getTime();
    const dt = (t2 - t1) / 1000;
    if (dt <= 0 || dt > MAX_PING_GAP_S) continue;
    const accel = (s2 - s1) / dt;

    if (state === 'stopped' && s1 <= 3 && accel > STOP_AND_DASH_ACCEL_MPHPS) {
      state = 'accelerating';
    } else if (state === 'accelerating' && accel < -STOP_AND_DASH_ACCEL_MPHPS) {
      state = 'braking';
    } else if (state === 'braking' && s2 <= 3) {
      cycles++;
      state = 'stopped';
      patterns.stop_and_dash_cycle.details.push({
        cycle: cycles,
        timestamp: sorted[i + 1].timestamp,
        lat: Number(sorted[i + 1].latitude || 0),
        lon: Number(sorted[i + 1].longitude || 0)
      });
    }
  }
  if (cycles >= STOP_AND_DASH_MIN_CYCLES) {
    patterns.stop_and_dash_cycle.detected = true;
  }

  // ── Pattern 5: Sustained speeding bursts — 2+ separate 80+ mph events ──
  let speedingBursts = 0;
  let inBurst = false;
  let burstStart = null;
  let burstStartSpeed = 0;
  let burstMaxSpeed = 0;
  for (const pos of sorted) {
    const speed = Number(pos.speed || 0);
    if (speed > SUSTAINED_SPEEDING_MPH) {
      if (!inBurst) {
        speedingBursts++;
        inBurst = true;
        burstStart = pos.timestamp;
        burstStartSpeed = speed;
        burstMaxSpeed = speed;
      } else {
        burstMaxSpeed = Math.max(burstMaxSpeed, speed);
      }
    } else {
      if (inBurst && burstStart) {
        patterns.sustained_speeding_bursts.details.push({
          burst: speedingBursts,
          start: burstStart,
          end: pos.timestamp,
          max_speed: Math.round(burstMaxSpeed),
          lat: Number(pos.latitude || 0),
          lon: Number(pos.longitude || 0)
        });
      }
      inBurst = false;
      burstStart = null;
      burstMaxSpeed = 0;
    }
  }
  if (inBurst && burstStart) {
    patterns.sustained_speeding_bursts.details.push({
      burst: speedingBursts,
      start: burstStart,
      end: sorted[sorted.length - 1].timestamp,
      max_speed: Math.round(burstMaxSpeed),
      lat: Number(sorted[sorted.length - 1].latitude || 0),
      lon: Number(sorted[sorted.length - 1].longitude || 0)
    });
  }
  if (speedingBursts >= SUSTAINED_SPEEDING_MIN_BURSTS) {
    patterns.sustained_speeding_bursts.detected = true;
  }

  return patterns;
}

function groupIntoTrips(positions) {
  const sorted = [...positions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const trips = [];
  let currentTrip = [];

  for (const pos of sorted) {
    const ign = pos.ignition_status || 'unknown';
    if (ign === 'on') {
      currentTrip.push(pos);
    } else if (ign === 'off') {
      if (currentTrip.length > 0) {
        currentTrip.push(pos);
        trips.push(currentTrip);
        currentTrip = [];
      }
    } else {
      if (currentTrip.length > 0) currentTrip.push(pos);
    }
  }
  if (currentTrip.length > 0) trips.push(currentTrip);
  return trips;
}

const EMPTY_PATTERNS = () => ({
  sustained_high_speed: { detected: false, label: 'Sustained High Speed', description: 'Speed > 90 mph for 30+ seconds', details: [] },
  rapid_accel_burst: { detected: false, label: 'Rapid Acceleration Burst', description: '0→60 mph in under 8 seconds', details: [] },
  hard_cornering_chain: { detected: false, label: 'Hard Cornering Chain', description: '3+ sharp turns at 45+ mph', details: [] },
  stop_and_dash_cycle: { detected: false, label: 'Stop-and-Dash Cycle', description: 'Repeated hard accel + brake from stops', details: [] },
  sustained_speeding_bursts: { detected: false, label: 'Sustained Speeding Bursts', description: 'Multiple 80+ mph events in one trip', details: [] }
});

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const deviceId = String(body.device_id || '').trim();
    if (!deviceId) return Response.json({ error: 'device_id is required' }, { status: 400 });

    const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: deviceId });
    const device = devices[0];
    if (!device) return Response.json({ error: 'Device not found' }, { status: 404 });

    // Pull position history (last 24h, up to 500 pings)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const positions = await base44.asServiceRole.entities.TelematicsPositionHistory.filter(
      { device_id: deviceId },
      '-timestamp',
      500
    );

    const recentPositions = (positions || []).filter(p =>
      p.timestamp && new Date(p.timestamp).getTime() > new Date(since).getTime()
    );

    if (recentPositions.length < 2) {
      return Response.json({
        device_id: deviceId,
        status: 'pass',
        is_reckless: false,
        patterns: EMPTY_PATTERNS(),
        message: 'Not enough driving data yet — monitoring active'
      });
    }

    const trips = groupIntoTrips(recentPositions);
    const latestTrip = trips[trips.length - 1];

    if (!latestTrip || latestTrip.length < 2) {
      return Response.json({
        device_id: deviceId,
        status: 'pass',
        is_reckless: false,
        patterns: EMPTY_PATTERNS(),
        message: 'No recent trip data — monitoring active'
      });
    }

    const patterns = analyzeTrip(latestTrip);
    const tripStart = latestTrip[0].timestamp;
    const tripEnd = latestTrip[latestTrip.length - 1].timestamp;

    const detectedPatterns = Object.entries(patterns)
      .filter(([_, v]) => v.detected)
      .map(([k]) => k);

    const isReckless = detectedPatterns.length > 0;

    // Create event record if reckless and not already recorded for this trip
    if (isReckless) {
      const existing = await base44.asServiceRole.entities.RecklessDrivingEvent.filter({
        device_id: deviceId,
        trip_start: tripStart
      });

      if (existing.length === 0) {
        let maxSpeed = 0;
        for (const p of latestTrip) {
          maxSpeed = Math.max(maxSpeed, Number(p.speed || 0));
        }
        const durationMin = Math.round(
          (new Date(tripEnd).getTime() - new Date(tripStart).getTime()) / 60000
        );

        await base44.asServiceRole.entities.RecklessDrivingEvent.create({
          device_id: deviceId,
          vehicle_id: device.vehicle_id || '',
          host_id: device.host_id || '',
          customer_user_id: device.owner_user_id || '',
          trip_start: tripStart,
          trip_end: tripEnd,
          patterns_detected: detectedPatterns,
          pattern_details: patterns,
          is_reckless: true,
          severity: 'critical',
          max_speed_mph: Math.round(maxSpeed),
          duration_minutes: durationMin
        });

        // Route through Alert360 for host + admin notification
        await base44.asServiceRole.entities.TelematicsSafetyEvent.create({
          alert_type: 'reckless_driving_detected',
          alert_title: 'Reckless Driving Detected',
          alert_message: `Patterns: ${detectedPatterns.map(p => patterns[p].label).join(', ')}`,
          category: 'safety',
          severity: 'critical',
          customer_severity: 'critical',
          host_severity: 'critical',
          admin_severity: 'critical',
          vehicle_id: device.vehicle_id || '',
          device_id: deviceId,
          device_unique_id: device.unique_id || '',
          provider_key: device.provider_key || '',
          host_id: device.host_id || '',
          customer_id: device.owner_user_id || '',
          lat: latestTrip[latestTrip.length - 1].latitude,
          lon: latestTrip[latestTrip.length - 1].longitude,
          speed: latestTrip[latestTrip.length - 1].speed,
          source: 'webhook',
          is_active: true,
          visible_to_customer: true,
          visible_to_host: true,
          visible_to_admin: true,
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          parsed_payload_json: { patterns, trip_start: tripStart, trip_end: tripEnd }
        }).catch(() => {});
      }
    }

    return Response.json({
      device_id: deviceId,
      status: isReckless ? 'fail' : 'pass',
      is_reckless: isReckless,
      patterns,
      trip_start: tripStart,
      trip_end: tripEnd,
      trip_points: latestTrip.length
    });
  } catch (error) {
    console.error('detectRecklessDriving error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});