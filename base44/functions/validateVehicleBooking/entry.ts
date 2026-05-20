import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Validates that a vehicle can be booked.
 * Checks: vehicle status, compliance doc expiry, missing required docs.
 * Returns { blocked: boolean, reason: string, internal_reason: string }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { vehicle_id } = await req.json();
    if (!vehicle_id) return Response.json({ error: 'vehicle_id required' }, { status: 400 });

    // 1. Check vehicle exists and status
    const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: vehicle_id });
    const vehicle = vehicles[0];
    if (!vehicle) {
      return Response.json({ blocked: true, reason: 'This vehicle is temporarily unavailable.', internal_reason: 'Vehicle not found' });
    }

    if (vehicle.status === 'Compliance Hold') {
      return Response.json({
        blocked: true,
        reason: 'This vehicle is temporarily unavailable.',
        internal_reason: 'Vehicle status: Compliance Hold — expired or missing compliance documents'
      });
    }

    if (vehicle.status !== 'Available') {
      return Response.json({
        blocked: true,
        reason: 'This vehicle is not currently available for booking.',
        internal_reason: `Vehicle status: ${vehicle.status}`
      });
    }

    // 2. Check compliance documents
    const compliance = await base44.asServiceRole.entities.HostVehicleCompliance.filter({ vehicle_id });

    const expiredDocs = compliance.filter(c => c.status === 'expired');
    if (expiredDocs.length > 0) {
      return Response.json({
        blocked: true,
        reason: 'This vehicle is temporarily unavailable.',
        internal_reason: `Expired compliance docs: ${expiredDocs.map(c => c.doc_type).join(', ')}`
      });
    }

    // 3. Check required doc types are present (insurance + registration)
    const requiredTypes = ['insurance', 'registration'];
    const uploadedTypes = compliance.map(c => c.doc_type);
    const missingRequired = requiredTypes.filter(t => !uploadedTypes.includes(t));

    if (missingRequired.length > 0) {
      return Response.json({
        blocked: true,
        reason: 'This vehicle is temporarily unavailable.',
        internal_reason: `Missing required compliance docs: ${missingRequired.join(', ')}`
      });
    }

    return Response.json({ blocked: false });
  } catch (error) {
    console.error('[ValidateVehicleBooking]', error.message);
    // Fail open — don't block booking if check itself errors
    return Response.json({ blocked: false, warning: error.message });
  }
});