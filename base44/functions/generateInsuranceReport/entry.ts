import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    const body = await req.json();
    const { booking_request_id, vehicle_id, report_type = 'insurance_audit' } = body;

    if (!booking_request_id && !vehicle_id) {
      return Response.json({ error: 'booking_request_id or vehicle_id required' }, { status: 400 });
    }

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
    if (telematicsDevice?.id) {
      const positions = await base44.asServiceRole.entities.TelematicsPositionHistory.filter(
        { device_id: telematicsDevice.id },
        '-timestamp',
        200
      );
      positionHistory = positions;
    }

    // ── Gather telematics events (engine diagnostics + status) ──
    let telematicsEvents = [];
    if (vehicleIdToUse) {
      const events = await base44.asServiceRole.entities.TelematicsEvent.filter(
        { vehicle_id: vehicleIdToUse },
        '-created_at',
        200
      );
      telematicsEvents = events;
    }

    // ── Gather odometer snapshots (mileage data stream) ──
    let odometerSnapshots = [];
    if (vehicleIdToUse) {
      odometerSnapshots = await base44.asServiceRole.entities.OdometerSnapshot.filter(
        { vehicle_id: vehicleIdToUse },
        '-captured_at',
        50
      );
    }

    // ── Gather safety events (driver behavior data stream) ──
    let safetyEvents = [];
    if (vehicleIdToUse) {
      const sEvents = await base44.asServiceRole.entities.TelematicsSafetyEvent.filter(
        { vehicle_id: vehicleIdToUse },
        '-created_date',
        100
      );
      safetyEvents = sEvents;
    }

    // ── Gather GPS command events (vehicle status + control) ──
    let gpsEvents = [];
    if (vehicleIdToUse) {
      gpsEvents = await base44.asServiceRole.entities.GPSEvent.filter(
        { vehicle_id: vehicleIdToUse },
        '-command_sent_at',
        50
      );
    }

    // ── Gather inspection evidence photos ──
    const evidencePhotos = [];
    if (booking) {
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

    // ── Build compliance evidence summary ──
    const vehicleName = booking?.vehicle_name || (vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Unknown Vehicle');
    const rentalPeriod = booking ? `${booking.start_date} to ${booking.end_date}` : 'N/A';

    // Assess each required telematics data stream
    const positionCount = positionHistory.length;
    const hasLocationData = positionCount > 0 || (telematicsDevice?.last_latitude != null && telematicsDevice?.last_longitude != null);
    const hasSpeedData = positionHistory.some(p => p.speed != null) || telematicsDevice?.speed != null || telematicsEvents.some(e => e.speed != null);
    const hasMileageData = odometerSnapshots.length > 0 || vehicle?.virtual_odometer != null || vehicle?.baseline_odometer != null || telematicsDevice?.device_mileage != null || telematicsDevice?.traccar_total_distance_meters != null;
    const hasEngineDiagnostics = telematicsDevice?.battery_voltage != null || telematicsDevice?.power_voltage != null || telematicsDevice?.external_voltage != null || telematicsDevice?.voltage != null || telematicsDevice?.ignition_status != null;
    const hasVehicleStatus = telematicsDevice != null && (telematicsDevice.online_status != null || telematicsDevice.lifecycle_status != null || telematicsDevice.ignition_status != null);
    const hasDriverBehavior = safetyEvents.length > 0 || telematicsDevice?.shock_alarm != null || telematicsDevice?.overspeed_alarm != null || telematicsDevice?.movement_alarm != null;

    // Data continuity assessment
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
        if (gapHours > 6) { // gap > 6 hours = significant
          gapCount++;
          totalGapMs += (curr - prev);
        }
      }
      dataGapAnalysis.has_gaps = gapCount > 0;
      dataGapAnalysis.gap_count = gapCount;
      dataGapAnalysis.total_gap_hours = Math.round(totalGapMs / (1000 * 60 * 60) * 10) / 10;
    }

    const complianceEvidence = {
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
        time_stamped_location: { available: hasLocationData, data_points: positionCount, first_timestamp: dataGapAnalysis.first_data, last_timestamp: dataGapAnalysis.last_data },
        speed_data: { available: hasSpeedData, sources: ['position_history', 'device', 'telematics_events'].filter(s => s) },
        fuel_consumption: { available: false, note: 'Fuel consumption data not directly captured by current telematics provider — engine voltage and ignition data available as proxy' },
        engine_diagnostics: { available: hasEngineDiagnostics, data_points: telematicsEvents.length },
        vehicle_status: { available: hasVehicleStatus, online_status: telematicsDevice?.online_status, ignition_status: telematicsDevice?.ignition_status },
        mileage_data: { available: hasMileageData, odometer_snapshots: odometerSnapshots.length, baseline: vehicle?.baseline_odometer, current: vehicle?.virtual_odometer || telematicsDevice?.device_mileage },
        driver_behavior: { available: hasDriverBehavior, safety_events: safetyEvents.length, alarms_active: [telematicsDevice?.shock_alarm, telematicsDevice?.overspeed_alarm, telematicsDevice?.movement_alarm].filter(Boolean).length }
      },
      data_continuity: dataGapAnalysis,
      position_history_sample: positionHistory.slice(0, 10).map(p => ({ lat: p.latitude, lon: p.longitude, speed: p.speed, timestamp: p.timestamp, ignition: p.ignition_status })),
      telematics_events_sample: telematicsEvents.slice(0, 15).map(e => ({ event_type: e.event_type, speed: e.speed, ignition: e.ignition, lat: e.latitude, lon: e.longitude, created_at: e.created_at })),
      odometer_snapshots: odometerSnapshots.slice(0, 10).map(s => ({ type: s.snapshot_type, miles: s.virtual_odometer_miles, captured_at: s.captured_at })),
      safety_events_sample: safetyEvents.slice(0, 10).map(e => ({ event_type: e.event_type, severity: e.severity, created_date: e.created_date })),
      gps_events_sample: gpsEvents.slice(0, 10).map(e => ({ event_type: e.event_type, status: e.response_status, sent_at: e.command_sent_at })),
      evidence_photos: evidencePhotos.map(p => ({ type: p.type, url: p.url }))
    };

    const reportTypeLabels = {
      insurance_audit: 'Insurance Audit & Telematics Compliance Report',
      damage_assessment: 'Damage Assessment & Telematics Compliance Report',
      claim_summary: 'Insurance Claim Summary & Telematics Compliance Report',
      dispute_resolution: 'Dispute Resolution & Telematics Compliance Report',
      fleet_risk_analysis: 'Fleet Risk Analysis & Telematics Compliance Report'
    };

    const prompt = `You are a certified insurance compliance auditor. Generate a ${reportTypeLabels[report_type] || report_type} that meets the standard requirements of ALL major insurance carriers (Roamly, National General, Progressive, etc.).

This report MUST certify telematics data compliance as a MANDATORY requirement, following the standard insurance carrier telematics addendum format:

TELEMATICS IS REQUIRED FOR EVERY VEHICLE ON THIS POLICY.

The policy holder (host) must provide complete, timely (real-time) and ongoing telematics data, including but not limited to:
1. Time-stamped vehicle location
2. Speed
3. Fuel consumption (or engine voltage/diagnostics as proxy if fuel data unavailable)
4. Engine diagnostics
5. Vehicle status
6. Mileage data
7. Driver behavior

Failure to provide continuous and timely telematics data constitutes a MATERIAL MISREPRESENTATION that may result in modifications to coverage terms, including adjustments in premium, changes in coverage limits or deductables, cancellation of coverage, and/or denial of a claim.

=== COMPLIANCE EVIDENCE DATA ===
Vehicle: ${vehicleName}
VIN: ${vehicle?.vin || 'N/A'}
Rental Period: ${rentalPeriod}
Customer: ${booking?.user_email || 'N/A'}
Booking ID: ${booking?.id || 'N/A'}

${JSON.stringify(complianceEvidence, null, 2)}
=== END EVIDENCE DATA ===

Generate the report with the following structure:

1. COMPLIANCE CERTIFICATION HEADER
   - Title: "TELEMATICS COMPLIANCE CERTIFICATION"
   - Mandatory statement: "TELEMATICS IS REQUIRED FOR EVERY VEHICLE ON THIS POLICY."

2. POLICY & VEHICLE IDENTIFICATION
   - Vehicle make/model/year/VIN/plate
   - Booking/Policy reference, rental period
   - Host/Insured party details

3. MANDATORY TELEMATICS DATA STREAM VERIFICATION
   For EACH of the 7 required data categories above, provide:
   - Status: VERIFIED / GAPS_DETECTED / NOT_AVAILABLE
   - Evidence: What data was found (data point counts, timestamps, sources)
   - Gaps: Any missing periods or data quality issues
   - Assessment: Whether this category meets carrier compliance requirements

4. DATA CONTINUITY ASSESSMENT
   - Was telematics data continuous throughout the rental/policy period?
   - Identify any gaps > 6 hours
   - Total gap duration
   - Real-time data availability assessment

5. COMPLIANCE STATUS DETERMINATION
   - Overall: COMPLIANT / PARTIAL_COMPLIANCE / NON-COMPLIANT
   - Rationale based on data stream verification

6. MATERIAL MISREPRESENTATION RISK ASSESSMENT
   - Risk level: NONE / LOW / MEDIUM / HIGH
   - If any data gaps exist, explain the coverage impact
   - Whether failure to maintain data could result in claim denial

7. ${report_type === 'damage_assessment' ? 'DAMAGE ASSESSMENT' : report_type === 'claim_summary' ? 'CLAIM SUMMARY' : report_type === 'dispute_resolution' ? 'DISPUTE ANALYSIS' : report_type === 'fleet_risk_analysis' ? 'FLEET RISK ANALYSIS' : 'ADDITIONAL AUDIT FINDINGS'}
   - Any damage, incidents, safety events, or risk factors identified
   - Evidence from photos, telematics events, safety events

8. ATTESTATION
   - Compliance attestation statement
   - Signature-ready section with date

9. FINDINGS (as array)
10. RECOMMENDATIONS (as array)

Write the full report_content as formatted markdown text. Be specific and reference actual data points, counts, and timestamps from the evidence. Do not use placeholder text.`;

    // ── Generate report via AI ──
    const llmResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          report_summary: { type: "string", description: "Executive summary of compliance status" },
          compliance_status: { type: "string", enum: ["COMPLIANT", "PARTIAL_COMPLIANCE", "NON_COMPLIANT"], description: "Overall telematics compliance determination" },
          data_stream_verification: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category: { type: "string" },
                status: { type: "string", enum: ["VERIFIED", "GAPS_DETECTED", "NOT_AVAILABLE"] },
                evidence: { type: "string" },
                gaps: { type: "string" },
                assessment: { type: "string" }
              }
            },
            description: "Verification of each mandatory telematics data stream"
          },
          data_continuity: {
            type: "object",
            properties: {
              continuous: { type: "boolean" },
              gap_count: { type: "number" },
              total_gap_hours: { type: "number" },
              assessment: { type: "string" }
            }
          },
          material_misrepresentation_risk: { type: "string", enum: ["NONE", "LOW", "MEDIUM", "HIGH"], description: "Risk that data gaps constitute material misrepresentation" },
          coverage_impact: { type: "string", description: "Potential impact on coverage terms if data gaps exist" },
          report_content: { type: "string", description: "Full formatted markdown report content" },
          confidence_score: { type: "number", description: "Confidence score 0-1 based on evidence completeness" },
          findings: { type: "array", items: { type: "string" }, description: "Key findings" },
          recommendations: { type: "array", items: { type: "string" }, description: "Actionable recommendations" }
        }
      }
    });

    // ── Create immutable EvidenceVault record ──
    const evidence = await base44.asServiceRole.entities.EvidenceVault.create({
      evidence_type: 'ai_generated_report',
      title: `${reportTypeLabels[report_type] || report_type} — ${vehicleName}`,
      description: `Carrier-grade telematics compliance certification for ${vehicleName}${booking ? ` (Booking: ${booking.id})` : ''}. Compliance Status: ${llmResponse.compliance_status || 'UNKNOWN'}.`,
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
      ai_confidence_score: llmResponse.confidence_score,
      ai_findings: llmResponse.findings || [],
      ai_recommendations: llmResponse.recommendations || [],
      status: 'collected',
      created_by: user.email,
      is_immutable: true,
      metadata: {
        report_type,
        compliance_status: llmResponse.compliance_status,
        material_misrepresentation_risk: llmResponse.material_misrepresentation_risk,
        coverage_impact: llmResponse.coverage_impact,
        data_stream_verification: llmResponse.data_stream_verification,
        data_continuity: llmResponse.data_continuity,
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
        compliance_status: llmResponse.compliance_status,
        material_misrepresentation_risk: llmResponse.material_misrepresentation_risk,
        coverage_impact: llmResponse.coverage_impact,
        confidence_score: llmResponse.confidence_score,
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