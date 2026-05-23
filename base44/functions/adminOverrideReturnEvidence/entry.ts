import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ALLOWED_REASONS = ['fraud', 'hidden_severe_damage', 'stolen_vehicle', 'insurance_claim', 'gps_evidence_conflict', 'legal_safety_issue'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const { packet_id, override_reason, notes = '' } = await req.json();
    if (!packet_id || !ALLOWED_REASONS.includes(override_reason)) {
      return Response.json({ error: 'Valid override reason is required' }, { status: 400 });
    }

    const packets = await base44.asServiceRole.entities.InspectionEvidencePacket.filter({ id: packet_id });
    const packet = packets[0];
    if (!packet) return Response.json({ error: 'Evidence packet not found' }, { status: 404 });

    await base44.asServiceRole.entities.InspectionEvidencePacket.update(packet.id, {
      evidence_status: 'disputed',
      dispute_window_closed_at: '',
      dispute_window_close_reason: 'admin_override',
      admin_override_reason: `${override_reason}: ${notes}`,
    });

    await base44.asServiceRole.entities.ReputationEventLog.create({
      event_type: 'signal_collected',
      entity_type: 'booking',
      entity_id: packet.booking_request_id,
      host_id: packet.host_id,
      vehicle_id: packet.vehicle_id,
      booking_request_id: packet.booking_request_id,
      score_impact: 0,
      subscores_affected: ['inspection_evidence_governance'],
      reason: `Admin override reopened return evidence: ${override_reason}. ${notes}`,
      processed_by: user.email,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});