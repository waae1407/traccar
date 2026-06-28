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

    // ── Gather evidence ──
    let booking = null;
    let vehicle = null;
    let host = null;
    const evidencePhotos = [];

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

    // Collect pickup and return photos from booking
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

    // Collect telematics events for the vehicle during the rental period
    let telematicsEvents = [];
    if (vehicleIdToUse) {
      const telematicsQuery = { vehicle_id: vehicleIdToUse };
      if (booking?.start_date && booking?.end_date) {
        telematicsQuery.created_date = { $gte: booking.start_date, $lte: booking.end_date + 'T23:59:59' };
      }
      const events = await base44.asServiceRole.entities.TelematicsEvent.filter(telematicsQuery, '-created_date', 50);
      telematicsEvents = events.slice(0, 20);
    }

    // Collect existing inspection evidence packets
    let inspectionPackets = [];
    if (booking_request_id) {
      inspectionPackets = await base44.asServiceRole.entities.InspectionEvidencePacket.filter({ booking_request_id }, '-created_date', 10);
    }

    // Collect safety events (Alert360)
    let safetyEvents = [];
    if (vehicleIdToUse) {
      const safetyQuery = { vehicle_id: vehicleIdToUse };
      if (booking?.start_date) safetyQuery.created_date = { $gte: booking.start_date };
      const sEvents = await base44.asServiceRole.entities.TelematicsSafetyEvent.filter(safetyQuery, '-created_date', 20);
      safetyEvents = sEvents.slice(0, 10);
    }

    // ── Build the AI prompt ──
    const vehicleName = booking?.vehicle_name || (vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Unknown Vehicle');
    const rentalPeriod = booking ? `${booking.start_date} to ${booking.end_date}` : 'N/A';

    const contextData = {
      vehicle: vehicle ? {
        make: vehicle.make, model: vehicle.model, year: vehicle.year, vin: vehicle.vin,
        plate: vehicle.plate, color: vehicle.color, mileage: vehicle.mileage, status: vehicle.status
      } : null,
      booking: booking ? {
        booking_type: booking.booking_type, start_date: booking.start_date, end_date: booking.end_date,
        booking_status: booking.booking_status, payment_status: booking.payment_status,
        pickup_completed_at: booking.pickup_completed_at, return_completed_at: booking.return_completed_at,
        host_review_status: booking.host_review_status, clean_return_status: booking.clean_return_status,
        damage_dispute_status: booking.damage_dispute_status, total_due_now: booking.total_due_now
      } : null,
      host: host ? {
        full_name: host.full_name, email: host.email, status: host.status, business_name: host.business_name
      } : null,
      evidence_photos: evidencePhotos.map(p => ({ type: p.type })),
      telematics_events: telematicsEvents.map(e => ({
        event_type: e.event_type, created_date: e.created_date, severity: e.severity, description: e.description
      })),
      inspection_packets: inspectionPackets.map(p => ({
        inspection_type: p.inspection_type, submitted_at: p.submitted_at, evidence_status: p.evidence_status,
        evidence_confidence: p.evidence_confidence
      })),
      safety_events: safetyEvents.map(e => ({
        event_type: e.event_type, severity: e.severity, created_date: e.created_date, description: e.description
      }))
    };

    const reportTypeLabels = {
      insurance_audit: 'Insurance Audit Report',
      damage_assessment: 'Damage Assessment Report',
      claim_summary: 'Insurance Claim Summary',
      dispute_resolution: 'Dispute Resolution Report',
      fleet_risk_analysis: 'Fleet Risk Analysis Report'
    };

    const prompt = `You are an expert insurance auditor for a vehicle rental platform (uRide). Generate a comprehensive ${reportTypeLabels[report_type] || report_type} based on the following evidence data.

Vehicle: ${vehicleName}
Rental Period: ${rentalPeriod}
Customer: ${booking?.user_email || 'N/A'}

Evidence Data:
${JSON.stringify(contextData, null, 2)}

Instructions:
1. Analyze all available evidence including photos metadata, telematics events, inspection packets, and safety events.
2. Identify any risk factors, damage indicators, compliance gaps, or notable incidents.
3. Generate a structured professional report suitable for transmission to an insurance carrier.
4. Assign a confidence score (0-1) based on evidence completeness and quality.
5. List specific findings and actionable recommendations.

Report Format:
- Executive Summary
- Vehicle & Rental Details
- Evidence Inventory
- Findings & Risk Assessment
- Recommendations
- Auditor Notes`;

    // ── Generate report via AI ──
    const llmResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          report_summary: { type: "string", description: "Executive summary of the report" },
          report_content: { type: "string", description: "Full markdown report content" },
          confidence_score: { type: "number", description: "Confidence score 0-1" },
          findings: { type: "array", items: { type: "string" }, description: "Key findings" },
          recommendations: { type: "array", items: { type: "string" }, description: "Actionable recommendations" }
        }
      }
    });

    // ── Create immutable EvidenceVault record ──
    const evidence = await base44.asServiceRole.entities.EvidenceVault.create({
      evidence_type: 'ai_generated_report',
      title: `${reportTypeLabels[report_type] || report_type} — ${vehicleName}`,
      description: `AI-generated ${report_type} for ${vehicleName}${booking ? ` (Booking: ${booking.id})` : ''}`,
      booking_request_id: booking?.id || null,
      vehicle_id: vehicle?.id || vehicleIdToUse,
      host_id: hostIdToUse || null,
      host_email: host?.email || null,
      customer_email: booking?.user_email || null,
      vehicle_name: vehicleName,
      evidence_date: new Date().toISOString(),
      evidence_urls: evidencePhotos.map(p => p.url),
      telematics_snapshot: {
        events_count: telematicsEvents.length,
        safety_events_count: safetyEvents.length,
        inspection_packets_count: inspectionPackets.length
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
        evidence_photos_count: evidencePhotos.length,
        telematics_events_count: telematicsEvents.length,
        safety_events_count: safetyEvents.length,
        inspection_packets_count: inspectionPackets.length,
        generated_at: new Date().toISOString()
      }
    });

    return Response.json({
      evidence,
      summary: {
        evidence_photos_count: evidencePhotos.length,
        telematics_events_count: telematicsEvents.length,
        safety_events_count: safetyEvents.length,
        inspection_packets_count: inspectionPackets.length,
        confidence_score: llmResponse.confidence_score
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});