import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SIMULATION_ENTITIES = [
  'HostPayout',
  'PaymentLog',
  'BookingRequest',
  'HostPlatformSubscription',
  'Vehicle',
  'Customer',
  'Host',
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const { simulation_id } = await req.json();
    if (!simulation_id) return Response.json({ error: 'simulation_id is required' }, { status: 400 });

    const deleted_counts = {};
    for (const entityName of SIMULATION_ENTITIES) {
      const directMatches = await base44.asServiceRole.entities[entityName].filter({ simulation_id, is_simulation: true });
      const noteMatches = (await base44.asServiceRole.entities[entityName].list('-created_date', 500)).filter((record) => {
        const hasSimulationNote = String(record.notes || '').includes(`SIMULATION ${simulation_id}`);
        const hasSimulationAudit = JSON.stringify(record.audit_log || []).includes(`SIMULATION ${simulation_id}`);
        return hasSimulationNote || hasSimulationAudit;
      });
      const recordsById = new Map([...directMatches, ...noteMatches].map((record) => [record.id, record]));
      deleted_counts[entityName] = 0;
      for (const record of recordsById.values()) {
        await base44.asServiceRole.entities[entityName].delete(record.id);
        deleted_counts[entityName] += 1;
      }
    }

    return Response.json({
      ok: true,
      simulation_id,
      deleted_counts,
      note: 'Deleted only records with the provided simulation marker fields or SIMULATION note/audit marker.',
    });
  } catch (error) {
    console.error('[cleanupBillingStressTestSimulation] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});