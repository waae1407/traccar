import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Validates that a vehicle can be booked.
 * Checks: vehicle status, compliance doc expiry, missing required docs.
 * Respects compliance_enforcement_enabled platform setting.
 * Returns { blocked: boolean, reason: string, internal_reason: string }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { vehicle_id } = await req.json();
    if (!vehicle_id) return Response.json({ error: 'vehicle_id required' }, { status: 400 });

    // Load compliance enforcement setting (default: true)
    const platformSettings = await base44.asServiceRole.entities.PlatformSetting.filter({ key: 'compliance_enforcement_enabled' }, '-updated_date', 1).catch(() => []);
    const enforcementEnabled = platformSettings[0] ? platformSettings[0].value_boolean !== false : true;

    // 1. Check vehicle exists and status
    const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: vehicle_id });
    const vehicle = vehicles[0];
    if (!vehicle) {
      return Response.json({ blocked: true, reason: 'This vehicle is temporarily unavailable.', internal_reason: 'Vehicle not found' });
    }

    if (!vehicle.host_id) {
      return Response.json({
        blocked: true,
        reason: 'This vehicle is temporarily unavailable.',
        internal_reason: 'Vehicle is missing required host assignment'
      });
    }

    // Compliance Hold always blocks regardless of enforcement setting
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
    const requiredTypes = ['insurance', 'registration'];
    const uploadedTypes = compliance.map(c => c.doc_type);
    const missingRequired = requiredTypes.filter(t => !uploadedTypes.includes(t));

    const complianceIssues = [];
    if (expiredDocs.length > 0) complianceIssues.push(`Expired docs: ${expiredDocs.map(c => c.doc_type).join(', ')}`);
    if (missingRequired.length > 0) complianceIssues.push(`Missing docs: ${missingRequired.join(', ')}`);

    if (complianceIssues.length > 0) {
      if (enforcementEnabled) {
        return Response.json({
          blocked: true,
          reason: 'This vehicle is temporarily unavailable.',
          internal_reason: complianceIssues.join('; '),
          compliance_enforcement_enabled: true,
        });
      } else {
        // Enforcement OFF — warn but don't block
        return Response.json({
          blocked: false,
          host_id: vehicle.host_id,
          compliance_enforcement_enabled: false,
          compliance_warning: `Compliance enforcement is currently OFF for testing. This vehicle is missing required insurance/registration. Turn enforcement ON before production. Issues: ${complianceIssues.join('; ')}`,
        });
      }
    }

    return Response.json({
      blocked: false,
      host_id: vehicle.host_id,
      compliance_enforcement_enabled: enforcementEnabled,
    });
  } catch (error) {
    console.error('[ValidateVehicleBooking]', error.message);
    // Fail open — don't block booking if check itself errors
    return Response.json({ blocked: false, warning: error.message });
  }
});