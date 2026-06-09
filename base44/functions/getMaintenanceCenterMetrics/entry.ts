import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = user.role === 'admin';
    const body = await req.json().catch(() => ({}));
    const { host_id: bodyHostId, vehicle_id: filterVehicleId, status: filterStatus } = body;

    let scopedHostId = bodyHostId;
    if (!isAdmin) {
      const hosts = await base44.asServiceRole.entities.Host.filter({ email: user.email });
      const hostByUser = await base44.asServiceRole.entities.Host.filter({ user_id: user.id });
      const myHost = hosts[0] || hostByUser[0];
      if (!myHost) return Response.json({ error: 'Host not found' }, { status: 403 });
      scopedHostId = myHost.id;
    }

    const [maintenanceLogs, vehicles, expenses] = await Promise.all([
      scopedHostId ? base44.asServiceRole.entities.HostMaintenanceLog.filter({ host_id: scopedHostId }) : base44.asServiceRole.entities.HostMaintenanceLog.list('-date', 5000),
      scopedHostId ? base44.asServiceRole.entities.Vehicle.filter({ host_id: scopedHostId }) : base44.asServiceRole.entities.Vehicle.list('-created_date', 2000),
      scopedHostId ? base44.asServiceRole.entities.HostExpense.filter({ host_id: scopedHostId }) : base44.asServiceRole.entities.HostExpense.list('-date', 5000),
    ]);

    const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, v]));
    const now = new Date();

    const enrichedLogs = maintenanceLogs
      .filter(m => !filterVehicleId || m.vehicle_id === filterVehicleId)
      .map(m => {
        const vehicle = vehicleMap[m.vehicle_id] || null;
        const daysUntil = m.next_service_date ? Math.ceil((new Date(m.next_service_date) - now) / (1000 * 60 * 60 * 24)) : null;
        const milesLeft = m.next_service_mileage && vehicle?.mileage ? m.next_service_mileage - vehicle.mileage : null;

        let computed_status = 'completed';
        if (vehicle?.status === 'Maintenance') computed_status = 'in_maintenance';
        else if (daysUntil !== null && daysUntil < 0) computed_status = 'overdue';
        else if (daysUntil !== null && daysUntil <= 14) computed_status = 'due_soon';
        else if (milesLeft !== null && milesLeft <= 0) computed_status = 'overdue';
        else if (milesLeft !== null && milesLeft <= 500) computed_status = 'due_soon';
        else if (m.status === 'overdue') computed_status = 'overdue';
        else if (m.status === 'scheduled') computed_status = 'scheduled';

        const linkedExpense = expenses.find(e =>
          e.vehicle_id === m.vehicle_id &&
          e.date === m.date &&
          Math.abs((e.amount || 0) - (m.cost || 0)) < 1
        );

        return {
          ...m,
          vehicle,
          vehicle_name: m.vehicle_name || (vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : ''),
          computed_status,
          days_until_service: daysUntil,
          miles_until_service: milesLeft,
          linked_expense: linkedExpense || null,
        };
      })
      .filter(m => !filterStatus || m.computed_status === filterStatus || m.status === filterStatus);

    const overdue = enrichedLogs.filter(m => m.computed_status === 'overdue');
    const dueSoon = enrichedLogs.filter(m => m.computed_status === 'due_soon');
    const scheduled = enrichedLogs.filter(m => m.computed_status === 'scheduled');
    const completed = enrichedLogs.filter(m => m.computed_status === 'completed');
    const downtime = vehicles.filter(v => v.status === 'Maintenance');

    const totalCost = enrichedLogs.reduce((s, m) => s + (m.cost || 0), 0);
    const byVehicle = {};
    enrichedLogs.forEach(m => {
      byVehicle[m.vehicle_id || 'unknown'] = (byVehicle[m.vehicle_id || 'unknown'] || 0) + (m.cost || 0);
    });

    const warnings = [];
    if (overdue.length) warnings.push(`${overdue.length} maintenance item(s) overdue`);
    if (dueSoon.length) warnings.push(`${dueSoon.length} maintenance item(s) due within 14 days`);
    if (downtime.length) warnings.push(`${downtime.length} vehicle(s) currently in maintenance downtime`);

    return Response.json({
      records: enrichedLogs,
      overdue,
      due_soon: dueSoon,
      scheduled,
      completed,
      downtime_vehicles: downtime,
      kpis: {
        total_records: enrichedLogs.length,
        total_cost: totalCost,
        overdue_count: overdue.length,
        due_soon_count: dueSoon.length,
        scheduled_count: scheduled.length,
        completed_count: completed.length,
        downtime_count: downtime.length,
      },
      breakdowns: { by_vehicle: byVehicle },
      warnings,
      calculation_notes: ['HostMaintenanceLog is canonical', 'Legacy Maintenance entity is not included as canonical', 'Vehicle mileage used for mileage-based alerts when available'],
      scope: isAdmin ? 'admin' : 'host',
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getMaintenanceCenterMetrics]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});