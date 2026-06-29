import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    const body = await req.json();
    const {
      booking_request_id,
      vehicle_id,
      report_type = 'telematics_data_report',
      sections = null,
      data_streams = null,
      include_evidence_photos = true,
      include_telematics_events = true,
      include_safety_events = true,
      include_odometer_history = true
    } = body;

    if (!booking_request_id && !vehicle_id) {
      return Response.json({ error: 'booking_request_id or vehicle_id required' }, { status: 400 });
    }

    const ALL_SECTIONS = ['report_header', 'vehicle_identification', 'telematics_device_info', 'data_stream_summary', 'data_continuity', 'incident_findings', 'evidence_photos_section'];
    const ALL_STREAMS = ['time_stamped_location', 'speed', 'fuel_consumption', 'engine_diagnostics', 'vehicle_status', 'mileage_data', 'driver_behavior'];
    const activeSections = sections && Array.isArray(sections) && sections.length > 0 ? sections : ALL_SECTIONS;
    const activeStreams = data_streams && Array.isArray(data_streams) && data_streams.length > 0 ? data_streams : ALL_STREAMS;

    // ── Gather core records ──
    let booking = null;
    let vehicle = null;
    let host = null;

    if (booking_request_id) {
      const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
      booking = bookings[0];
      if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 });
    }

    const vehicleIdToUse = booking?.vehicle_id || vehicle_id;
    if (vehicleIdToUse) {
      const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: vehicleIdToUse });
      vehicle = vehicles[0];
    }

    const hostIdToUse = booking?.host_id || vehicle?.host_id;
    if (hostIdToUse) {
      const hosts = await base44.asServiceRole.entities.Host.filter({ id: hostIdToUse });
      host = hosts[0];
    }

    // ── Gather telematics device ──
    let telematicsDevice = null;
    if (vehicleIdToUse) {
      const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ vehicle_id: vehicleIdToUse }, '-last_seen_at', 5);
      telematicsDevice = devices[0] || null;
    }

    // ── Gather position history (location + speed data stream) ──
    let positionHistory = [];
    if (telematicsDevice?.id && activeStreams.includes('time_stamped_location')) {
      positionHistory = await base44.asServiceRole.entities.TelematicsPositionHistory.filter(
        { device_id: telematicsDevice.id }, '-timestamp', 200
      );
    }

    // ── Gather telematics events (engine diagnostics + status) ──
    let telematicsEvents = [];
    if (vehicleIdToUse && include_telematics_events) {
      telematicsEvents = await base44.asServiceRole.entities.TelematicsEvent.filter(
        { vehicle_id: vehicleIdToUse }, '-created_at', 200
      );
    }

    // ── Gather odometer snapshots (mileage data stream) ──
    let odometerSnapshots = [];
    if (vehicleIdToUse && include_odometer_history && activeStreams.includes('mileage_data')) {
      odometerSnapshots = await base44.asServiceRole.entities.OdometerSnapshot.filter(
        { vehicle_id: vehicleIdToUse }, '-captured_at', 50
      );
    }

    // ── Gather safety events (driver behavior data stream) ──
    let safetyEvents = [];
    if (vehicleIdToUse && include_safety_events && activeStreams.includes('driver_behavior')) {
      safetyEvents = await base44.asServiceRole.entities.TelematicsSafetyEvent.filter(
        { vehicle_id: vehicleIdToUse }, '-created_date', 100
      );
    }

    // ── Gather GPS command events (vehicle status + control) ──
    let gpsEvents = [];
    if (vehicleIdToUse && activeStreams.includes('vehicle_status')) {
      gpsEvents = await base44.asServiceRole.entities.GPSEvent.filter(
        { vehicle_id: vehicleIdToUse }, '-command_sent_at', 50
      );
    }

    // ── Gather inspection evidence photos ──
    const evidencePhotos = [];
    if (booking && include_evidence_photos) {
      if (booking.pickup_photos?.length) {
        booking.pickup_photos.forEach(url => evidencePhotos.push({ type: 'pickup', url }));
      }
      if (booking.return_exterior_photos?.length) {
        booking.return_exterior_photos.forEach(url => evidencePhotos.push({ type: 'return_exterior', url }));
      }
      if (booking.return_interior_photos?.length) {
        booking.return_interior_photos.forEach(url => evidencePhotos.push({ type: 'return_interior', url }));
      }
    }

    // ── Build data summary ──
    const vehicleName = booking?.vehicle_name || (vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Unknown Vehicle');
    const rentalPeriod = booking ? `${booking.start_date} to ${booking.end_date}` : 'N/A';

    // Assess each data stream availability
    const positionCount = positionHistory.length;
    const hasLocationData = positionCount > 0 || (telematicsDevice?.last_latitude != null && telematicsDevice?.last_longitude != null);
    const hasSpeedData = positionHistory.some(p => p.speed != null) || telematicsDevice?.speed != null || telematicsEvents.some(e => e.speed != null);
    const hasMileageData = odometerSnapshots.length > 0 || vehicle?.virtual_odometer != null || vehicle?.baseline_odometer != null || telematicsDevice?.device_mileage != null || telematicsDevice?.traccar_total_distance_meters != null;
    const hasEngineDiagnostics = telematicsDevice?.battery_voltage != null || telematicsDevice?.power_voltage != null || telematicsDevice?.external_voltage != null || telematicsDevice?.voltage != null || telematicsDevice?.ignition_status != null;
    const hasVehicleStatus = telematicsDevice != null && (telematicsDevice.online_status != null || telematicsDevice.lifecycle_status != null || telematicsDevice.ignition_status != null);
    const hasDriverBehavior = safetyEvents.length > 0 || telematicsDevice?.shock_alarm != null || telematicsDevice?.overspeed_alarm != null || telematicsDevice?.movement_alarm != null;

    // Data continuity analysis
    let dataGapAnalysis = { has_gaps: false, gap_count: 0, total_gap_hours: 0, first_data: null, last_data: null };
    if (positionHistory.length >= 2) {
      const sorted = [...positionHistory].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      dataGapAnalysis.first_data = sorted[0]?.timestamp;
      dataGapAnalysis.last_data = sorted[sorted.length - 1]?.timestamp;
      let gapCount = 0;
      let totalGapMs = 0;
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1].timestamp).getTime();
        const curr = new Date(sorted[i].timestamp).getTime();
        const gapHours = (curr - prev) / (1000 * 60 * 60);
        if (gapHours > 6) {
          gapCount++;
          totalGapMs += (curr - prev);
        }
      }
      dataGapAnalysis.has_gaps = gapCount > 0;
      dataGapAnalysis.gap_count = gapCount;
      dataGapAnalysis.total_gap_hours = Math.round(totalGapMs / (1000 * 60 * 60) * 10) / 10;
    }

    const reportData = {
      vehicle: vehicle ? {
        make: vehicle.make, model: vehicle.model, year: vehicle.year, vin: vehicle.vin,
        plate: vehicle.plate, color: vehicle.color, mileage: vehicle.mileage, status: vehicle.status,
        baseline_odometer: vehicle.baseline_odometer, virtual_odometer: vehicle.virtual_odometer,
        telematics_provider: vehicle.telematics_provider, telematics_device_id: vehicle.telematics_device_id
      } : null,
      booking: booking ? {
        id: booking.id, booking_type: booking.booking_type, start_date: booking.start_date, end_date: booking.end_date,
        booking_status: booking.booking_status, payment_status: booking.payment_status,
        pickup_completed_at: booking.pickup_completed_at, return_completed_at: booking.return_completed_at,
        host_review_status: booking.host_review_status, clean_return_status: booking.clean_return_status,
        damage_dispute_status: booking.damage_dispute_status
      } : null,
      host: host ? {
        full_name: host.full_name, email: host.email, status: host.status, business_name: host.business_name,
        business_type: host.business_type, verification_status: host.verification_status
      } : null,
      telematics_device: telematicsDevice ? {
        provider_key: telematicsDevice.provider_key, model: telematicsDevice.model, imei: telematicsDevice.imei,
        activation_status: telematicsDevice.activation_status, subscription_status: telematicsDevice.subscription_status,
        lifecycle_status: telematicsDevice.lifecycle_status, online_status: telematicsDevice.online_status,
        ignition_status: telematicsDevice.ignition_status, installation_type: telematicsDevice.installation_type,
        installation_completed_at: telematicsDevice.installation_completed_at, live_enabled_at: telematicsDevice.live_enabled_at,
        last_seen_at: telematicsDevice.last_seen_at, last_latitude: telematicsDevice.last_latitude,
        last_longitude: telematicsDevice.last_longitude, speed: telematicsDevice.speed,
        battery_voltage: telematicsDevice.battery_voltage, power_voltage: telematicsDevice.power_voltage,
        external_voltage: telematicsDevice.external_voltage, device_mileage: telematicsDevice.device_mileage,
        traccar_total_distance_meters: telematicsDevice.traccar_total_distance_meters,
        shock_alarm: telematicsDevice.shock_alarm, power_cut_alarm: telematicsDevice.power_cut_alarm,
        low_battery_alarm: telematicsDevice.low_battery_alarm, overspeed_alarm: telematicsDevice.overspeed_alarm,
        movement_alarm: telematicsDevice.movement_alarm, geofence_alarm: telematicsDevice.geofence_alarm,
        smoke_detected: telematicsDevice.smoke_detected, door_open: telematicsDevice.door_open,
        starter_disabled: telematicsDevice.starter_disabled, production_commands_enabled: telematicsDevice.production_commands_enabled
      } : null,
      data_stream_availability: {
        time_stamped_location: activeStreams.includes('time_stamped_location')
          ? { data_available: hasLocationData, data_points: positionCount, first_timestamp: dataGapAnalysis.first_data, last_timestamp: dataGapAnalysis.last_data }
          : { excluded: true },
        speed: activeStreams.includes('speed')
          ? { data_available: hasSpeedData, sources: ['position_history', 'device', 'telematics_events'] }
          : { excluded: true },
        fuel_consumption: activeStreams.includes('fuel_consumption')
          ? { data_available: false, note: 'Fuel consumption not directly captured by current telematics provider. Engine voltage and ignition data available as proxy.' }
          : { excluded: true },
        engine_diagnostics: activeStreams.includes('engine_diagnostics')
          ? { data_available: hasEngineDiagnostics, data_points: telematicsEvents.length }
          : { excluded: true },
        vehicle_status: activeStreams.includes('vehicle_status')
          ? { data_available: hasVehicleStatus, online_status: telematicsDevice?.online_status, ignition_status: telematicsDevice?.ignition_status }
          : { excluded: true },
        mileage_data: activeStreams.includes('mileage_data')
          ? { data_available: hasMileageData, odometer_snapshots: odometerSnapshots.length, baseline: vehicle?.baseline_odometer, current: vehicle?.virtual_odometer || telematicsDevice?.device_mileage }
          : { excluded: true },
        driver_behavior: activeStreams.includes('driver_behavior')
          ? { data_available: hasDriverBehavior, safety_events: safetyEvents.length, alarms_active: [telematicsDevice?.shock_alarm, telematicsDevice?.overspeed_alarm, telematicsDevice?.movement_alarm].filter(Boolean).length }
          : { excluded: true },
      },
      data_continuity: dataGapAnalysis,
      position_history_sample: positionHistory.slice(0, 20).map(p => ({ lat: p.latitude, lon: p.longitude, speed: p.speed, timestamp: p.timestamp, ignition: p.ignition_status })),
      telematics_events_sample: telematicsEvents.slice(0, 20).map(e => ({ event_type: e.event_type, speed: e.speed, ignition: e.ignition, lat: e.latitude, lon: e.longitude, created_at: e.created_at })),
      odometer_snapshots: odometerSnapshots.slice(0, 10).map(s => ({ type: s.snapshot_type, miles: s.virtual_odometer_miles, captured_at: s.captured_at })),
      safety_events_sample: safetyEvents.slice(0, 10).map(e => ({ event_type: e.event_type, severity: e.severity, created_date: e.created_date })),
      gps_events_sample: gpsEvents.slice(0, 10).map(e => ({ event_type: e.event_type, status: e.response_status, sent_at: e.command_sent_at })),
      evidence_photos: evidencePhotos.map(p => ({ type: p.type, url: p.url }))
    };

    const reportTypeLabels = {
      telematics_data_report: 'Telematics Data Report',
      insurance_audit: 'Telematics Data Report — Insurance Audit',
      damage_assessment: 'Telematics Data Report — Damage Assessment',
      claim_summary: 'Telematics Data Report — Claim Summary',
      dispute_resolution: 'Telematics Data Report — Dispute Resolution',
      fleet_risk_analysis: 'Telematics Data Report — Fleet Risk Analysis'
    };

    const streamLabels = {
      time_stamped_location: 'Time-Stamped Vehicle Location',
      speed: 'Speed',
      fuel_consumption: 'Fuel Consumption',
      engine_diagnostics: 'Engine Diagnostics',
      vehicle_status: 'Vehicle Status',
      mileage_data: 'Mileage Data',
      driver_behavior: 'Driver Behavior',
    };

    // Build section list dynamically
    const sectionDefs = [];
    if (activeSections.includes('report_header')) {
      sectionDefs.push({ title: 'Report Header', instructions: 'Report title, generation date/time, and a brief 1-2 sentence description of what this report contains.' });
    }
    if (activeSections.includes('vehicle_identification')) {
      sectionDefs.push({ title: 'Vehicle & Booking Identification', instructions: 'Vehicle make, model, year, VIN, plate, color, current mileage/status. Booking reference, rental period, booking type, booking status, payment status. Host/insured party name, business name, business type, verification status.' });
    }
    if (activeSections.includes('telematics_device_info')) {
      sectionDefs.push({ title: 'Telematics Device Information', instructions: 'Device provider, model, IMEI, activation status, subscription status, lifecycle status, online status, ignition status, installation type, installation date, live-enabled date, last seen timestamp, last known GPS coordinates. Any active alarms (shock, power cut, low battery, overspeed, movement, geofence), smoke detected, door open, starter disabled status.' });
    }
    if (activeSections.includes('data_stream_summary')) {
      sectionDefs.push({ title: 'Telematics Data Stream Summary', instructions: `For EACH of the following data streams, report what data was found:\n${activeStreams.map((s, i) => `${i + 1}. ${streamLabels[s] || s}`).join('\n')}\n\nFor each stream: state whether data is available, how many data points exist, the date range of the data (first and last timestamps), and a brief description of what the data shows. For streams that were excluded from this report, state "Excluded from this report." Do NOT make compliance judgments — just report what data exists.` });
    }
    if (activeSections.includes('data_continuity')) {
      sectionDefs.push({ title: 'Data Continuity Summary', instructions: 'Report whether telematics data was continuous throughout the rental period. List any gaps greater than 6 hours, total gap duration, first data point timestamp, and last data point timestamp. Present this as factual observations only.' });
    }
    if (activeSections.includes('incident_findings')) {
      const findingTitle = report_type === 'damage_assessment' ? 'Damage & Incident Findings' : report_type === 'claim_summary' ? 'Claim-Related Findings' : report_type === 'dispute_resolution' ? 'Dispute-Related Findings' : report_type === 'fleet_risk_analysis' ? 'Risk Factors & Findings' : 'Incident & Event Findings';
      sectionDefs.push({ title: findingTitle, instructions: 'List any damage, incidents, safety events, telematics alerts, or notable events found in the data. Include event types, timestamps, severity levels, and GPS coordinates where available. Present as factual observations only — do not assess blame or make risk judgments.' });
    }
    if (activeSections.includes('evidence_photos_section')) {
      sectionDefs.push({ title: 'Evidence Photos', instructions: 'List all inspection photos available (pickup photos, return exterior photos, return interior photos) with their URLs. Note the type of each photo.' });
    }

    const sectionList = sectionDefs.map((s, i) => `${i + 1}. ${s.title}\n   ${s.instructions}`).join('\n\n');

    const prompt = `You are a data reporter. Your job is to present telematics and vehicle data in a clear, readable, human-friendly report format.

IMPORTANT RULES:
- Do NOT make any compliance judgments (do not say "compliant" or "non-compliant").
- Do NOT assess risk levels or make coverage determinations.
- Do NOT make legal conclusions or attestations.
- Simply present the data that exists in a clear, organized, readable format.
- If data is missing or unavailable, state that factually — do not interpret what it means.
- Use plain, professional language that a non-technical reader can understand.
- Reference actual data points, counts, and timestamps from the evidence below.

=== REPORT DATA ===
Report Type: ${reportTypeLabels[report_type] || report_type}
Vehicle: ${vehicleName}
VIN: ${vehicle?.vin || 'N/A'}
Rental Period: ${rentalPeriod}
Customer: ${booking?.user_email || 'N/A'}
Booking ID: ${booking?.id || 'N/A'}
Report Generated: ${new Date().toISOString()}

${JSON.stringify(reportData, null, 2)}
=== END DATA ===

Write a well-structured, human-readable report in markdown format. Use clear headings, bullet points, and tables where appropriate. Include the following sections (skip any that don't apply):

${sectionList}

The report should read like a professional data summary — clear, factual, and easy to understand. Include actual values, dates, and counts from the data above. Do not use placeholder text.`;

    // ── Generate report via AI ──
    const llmResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          report_summary: { type: "string", description: "A 2-3 sentence factual summary of what data was found in this report" },
          report_content: { type: "string", description: "Full formatted markdown report content, human-readable" },
          findings: { type: "array", items: { type: "string" }, description: "Factual observations about the data found (not judgments)" }
        }
      }
    });

    // ── Create EvidenceVault record ──
    const evidence = await base44.asServiceRole.entities.EvidenceVault.create({
      evidence_type: 'ai_generated_report',
      title: `${reportTypeLabels[report_type] || report_type} — ${vehicleName}`,
      description: `Telematics data report for ${vehicleName}${booking ? ` (Booking: ${booking.id})` : ''}. ${llmResponse.report_summary || ''}`,
      booking_request_id: booking?.id || null,
      vehicle_id: vehicle?.id || vehicleIdToUse,
      host_id: hostIdToUse || null,
      host_email: host?.email || null,
      customer_email: booking?.user_email || null,
      vehicle_name: vehicleName,
      evidence_date: new Date().toISOString(),
      evidence_urls: evidencePhotos.map(p => p.url),
      telematics_snapshot: {
        device_provider: telematicsDevice?.provider_key,
        device_imei: telematicsDevice?.imei,
        device_lifecycle: telematicsDevice?.lifecycle_status,
        device_online: telematicsDevice?.online_status,
        position_history_count: positionHistory.length,
        telematics_events_count: telematicsEvents.length,
        odometer_snapshots_count: odometerSnapshots.length,
        safety_events_count: safetyEvents.length,
        gps_events_count: gpsEvents.length,
        data_continuity: dataGapAnalysis
      },
      ai_report_content: llmResponse.report_content,
      ai_report_summary: llmResponse.report_summary,
      ai_findings: llmResponse.findings || [],
      status: 'collected',
      created_by: user.email,
      is_immutable: true,
      metadata: {
        report_type,
        custom_sections: activeSections,
        custom_data_streams: activeStreams,
        include_evidence_photos,
        include_telematics_events,
        include_safety_events,
        include_odometer_history,
        evidence_photos_count: evidencePhotos.length,
        position_history_count: positionHistory.length,
        telematics_events_count: telematicsEvents.length,
        odometer_snapshots_count: odometerSnapshots.length,
        safety_events_count: safetyEvents.length,
        gps_events_count: gpsEvents.length,
        generated_at: new Date().toISOString()
      }
    });

    return Response.json({
      evidence,
      summary: {
        report_summary: llmResponse.report_summary,
        evidence_photos_count: evidencePhotos.length,
        position_history_count: positionHistory.length,
        telematics_events_count: telematicsEvents.length,
        odometer_snapshots_count: odometerSnapshots.length,
        safety_events_count: safetyEvents.length,
        gps_events_count: gpsEvents.length,
        data_continuity: dataGapAnalysis
      }
    });
  } catch (error) {
    console.error("[generateInsuranceReport] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});