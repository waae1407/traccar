import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = user.role === 'admin';
    const body = await req.json().catch(() => ({}));
    const { host_id: bodyHostId, vehicle_id: filterVehicleId } = body;

    let scopedHostId = bodyHostId;
    if (!isAdmin) {
      const hosts = await base44.asServiceRole.entities.Host.filter({ email: user.email });
      const hostByUser = await base44.asServiceRole.entities.Host.filter({ user_id: user.id });
      const myHost = hosts[0] || hostByUser[0];
      if (!myHost) return Response.json({ error: 'Host not found' }, { status: 403 });
      scopedHostId = myHost.id;
    }

    // Batch 1: Core compliance + vehicles
    const [complianceDocs, vehicles] = await Promise.all([
      scopedHostId
        ? base44.asServiceRole.entities.HostVehicleCompliance.filter({ host_id: scopedHostId })
        : base44.asServiceRole.entities.HostVehicleCompliance.list('-created_date', 1000),
      scopedHostId
        ? base44.asServiceRole.entities.Vehicle.filter({ host_id: scopedHostId })
        : base44.asServiceRole.entities.Vehicle.list('-created_date', 500),
    ]);

    // Batch 2: Hosts + bookings (bounded)
    const [hosts, bookings] = await Promise.all([
      isAdmin && !scopedHostId
        ? base44.asServiceRole.entities.Host.list('-created_date', 200)
        : scopedHostId
          ? base44.asServiceRole.entities.Host.filter({ id: scopedHostId })
          : Promise.resolve([]),
      isAdmin && !scopedHostId
        ? base44.asServiceRole.entities.BookingRequest.list('-created_date', 500)
        : scopedHostId
          ? base44.asServiceRole.entities.BookingRequest.filter({ host_id: scopedHostId }, '-created_date', 200)
          : Promise.resolve([]),
    ]);

    // Batch 3: Inspections + contracts + alerts (bounded)
    const [inspectionPackets, contractTemplates, operationalAlerts] = await Promise.all([
      scopedHostId
        ? base44.asServiceRole.entities.InspectionEvidencePacket.list('-created_date', 100)
        : base44.asServiceRole.entities.InspectionEvidencePacket.list('-created_date', 100),
      scopedHostId
        ? base44.asServiceRole.entities.ContractTemplate.filter({ host_id: scopedHostId })
        : base44.asServiceRole.entities.ContractTemplate.list('-created_date', 100),
      base44.asServiceRole.entities.OperationalAlert.list('-created_date', 100),
    ]);

    const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, v]));
    const hostMap = Object.fromEntries(hosts.map(h => [h.id, h]));

    const filteredDocs = complianceDocs.filter(d => !filterVehicleId || d.vehicle_id === filterVehicleId);

    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const enrichedDocs = filteredDocs.map(d => ({
      ...d,
      vehicle: vehicleMap[d.vehicle_id] || null,
      host: hostMap[d.host_id] || null,
      days_until_expiry: d.expiry_date ? Math.ceil((new Date(d.expiry_date) - now) / (1000 * 60 * 60 * 24)) : null,
    }));

    const expiredDocs = enrichedDocs.filter(d => d.status === 'expired' || (d.expiry_date && new Date(d.expiry_date) < now));
    const expiringSoon = enrichedDocs.filter(d => d.expiry_date && new Date(d.expiry_date) >= now && new Date(d.expiry_date) <= in30Days);
    const validDocs = enrichedDocs.filter(d => ['valid', 'expiring_soon'].includes(d.status) && (!d.expiry_date || new Date(d.expiry_date) >= now));
    const missingExpiry = enrichedDocs.filter(d => !d.expiry_date);

    // Vehicle compliance holds
    const complianceHolds = vehicles.filter(v => v.status === 'Compliance Hold' || v.approval_status === 'pending');
    const pendingApproval = vehicles.filter(v => v.approval_status === 'pending');

    // FIX #3: Detect active vehicles with no compliance docs
    const bookableStatuses = new Set(['Available', 'Reserved', 'Active Rental', 'Booked', 'Payment Due', 'Grace Period']);
    const activeVehiclesWithNoCompliance = vehicles.filter(v => {
      if (!bookableStatuses.has(v.status) && v.approval_status !== 'approved') return false;
      const vehicleDocs = complianceDocs.filter(d => d.vehicle_id === v.id || d.vin === v.vin);
      return vehicleDocs.length === 0;
    });

    // Host verification
    const verifiedHosts = hosts.filter(h => h.verification_status === 'verified');
    const unverifiedHosts = hosts.filter(h => !h.verification_status || h.verification_status === 'not_started');
    const verificationPending = hosts.filter(h => ['docs_submitted', 'docs_requested'].includes(h.verification_status));
    const verificationFailed = hosts.filter(h => h.verification_status === 'failed');

    // Customer verification from bookings
    const allBookings = bookings;
    const unverifiedCustomers = allBookings.filter(b => !b.verification_status || b.verification_status === 'not_started');
    const verifiedCustomers = allBookings.filter(b => b.verification_status === 'verified');
    const verificationManualReview = allBookings.filter(b => b.verification_status === 'manual_review');

    // Contracts
    const signedContracts = allBookings.filter(b => b.contract_status === 'signed');
    const unsignedContracts = allBookings.filter(b => b.contract_status && b.contract_status !== 'signed' && ['pending_contract', 'pending_review', 'confirmed', 'active'].includes(b.booking_status));

    const isTruncated = complianceDocs.length >= 1000;

    const warnings = [];
    if (expiredDocs.length) warnings.push(`${expiredDocs.length} compliance document(s) expired`);
    if (expiringSoon.length) warnings.push(`${expiringSoon.length} compliance document(s) expiring within 30 days`);
    if (complianceHolds.length) warnings.push(`${complianceHolds.length} vehicle(s) on compliance hold`);
    if (missingExpiry.length) warnings.push(`${missingExpiry.length} compliance document(s) missing expiration date`);
    // FIX #3: Warn on active vehicles with no docs
    if (activeVehiclesWithNoCompliance.length) {
      warnings.push(`${activeVehiclesWithNoCompliance.length} active/approved vehicle(s) have no compliance documents on file`);
    }
    if (isTruncated) warnings.push('Compliance document results capped at 1000 — apply vehicle or host filter for complete data');

    return Response.json({
      vehicle_documents: { all: enrichedDocs, expired: expiredDocs, expiring_soon: expiringSoon, valid: validDocs, missing_expiry: missingExpiry },
      compliance_holds: complianceHolds,
      pending_vehicle_approval: pendingApproval,
      // FIX #3: Vehicles with no docs
      vehicles_missing_compliance: activeVehiclesWithNoCompliance.map(v => ({
        vehicle_id: v.id,
        make: v.make,
        model: v.model,
        year: v.year,
        vin: v.vin,
        status: v.status,
        host_id: v.host_id,
      })),
      host_verification: { verified: verifiedHosts.length, unverified: unverifiedHosts.length, pending: verificationPending.length, failed: verificationFailed.length, hosts },
      customer_verification: { verified: verifiedCustomers.length, unverified: unverifiedCustomers.length, manual_review: verificationManualReview.length },
      contracts: { templates: contractTemplates, signed: signedContracts.length, unsigned: unsignedContracts.length },
      inspections: { all: inspectionPackets },
      operational_alerts: operationalAlerts.filter(a => a.domain === 'compliance'),
      kpis: {
        total_docs: filteredDocs.length,
        expired_count: expiredDocs.length,
        expiring_soon_count: expiringSoon.length,
        valid_count: validDocs.length,
        compliance_hold_count: complianceHolds.length,
        host_verified_count: verifiedHosts.length,
        customer_verified_count: verifiedCustomers.length,
        vehicles_missing_compliance_count: activeVehiclesWithNoCompliance.length,
      },
      warnings,
      query_limits_used: { compliance_docs: 1000, vehicles: 500, bookings: 500 },
      is_truncated: isTruncated,
      scope: isAdmin ? 'admin' : 'host',
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getComplianceCenterMetrics]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});