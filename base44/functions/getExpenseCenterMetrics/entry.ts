import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = user.role === 'admin';
    const body = await req.json().catch(() => ({}));
    const { host_id: bodyHostId, vehicle_id: filterVehicleId, category: filterCategory, date_from, date_to } = body;

    let scopedHostId = bodyHostId;
    if (!isAdmin) {
      const hosts = await base44.asServiceRole.entities.Host.filter({ email: user.email });
      const hostByUser = await base44.asServiceRole.entities.Host.filter({ user_id: user.id });
      const myHost = hosts[0] || hostByUser[0];
      if (!myHost) return Response.json({ error: 'Host not found' }, { status: 403 });
      scopedHostId = myHost.id;
    }

    const [expenses, recurringExpenses, vehicles, hosts, paymentLogs] = await Promise.all([
      scopedHostId ? base44.asServiceRole.entities.HostExpense.filter({ host_id: scopedHostId }) : base44.asServiceRole.entities.HostExpense.list('-date', 5000),
      scopedHostId ? base44.asServiceRole.entities.RecurringExpense.filter({ host_id: scopedHostId }) : base44.asServiceRole.entities.RecurringExpense.list('-next_due_date', 2000),
      scopedHostId ? base44.asServiceRole.entities.Vehicle.filter({ host_id: scopedHostId }) : base44.asServiceRole.entities.Vehicle.list('-created_date', 2000),
      scopedHostId ? base44.asServiceRole.entities.Host.filter({ id: scopedHostId }) : base44.asServiceRole.entities.Host.list('-created_date', 500),
      scopedHostId ? base44.asServiceRole.entities.PaymentLog.filter({ host_id: scopedHostId }) : base44.asServiceRole.entities.PaymentLog.list('-paid_at', 5000),
    ]);

    const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, v]));
    const hostMap = Object.fromEntries(hosts.map(h => [h.id, h]));

    function inRange(dateStr) {
      if (!dateStr) return true;
      if (date_from && dateStr < date_from) return false;
      if (date_to && dateStr > date_to + 'T23:59:59') return false;
      return true;
    }

    const filteredExpenses = expenses.filter(e =>
      (!filterVehicleId || e.vehicle_id === filterVehicleId) &&
      (!filterCategory || e.expense_type === filterCategory || e.category === filterCategory) &&
      inRange(e.date || e.created_date)
    );

    const filteredRecurring = recurringExpenses.filter(r =>
      (!filterVehicleId || r.vehicle_id === filterVehicleId) &&
      (!filterCategory || r.category === filterCategory)
    );

    // Enrich
    const enrichedExpenses = filteredExpenses.map(e => ({
      ...e,
      vehicle: vehicleMap[e.vehicle_id] || null,
      host: hostMap[e.host_id] || null,
      vehicle_name: e.vehicle_name || (vehicleMap[e.vehicle_id] ? `${vehicleMap[e.vehicle_id].year || ''} ${vehicleMap[e.vehicle_id].make || ''} ${vehicleMap[e.vehicle_id].model || ''}`.trim() : ''),
    }));

    const now = new Date();
    const enrichedRecurring = filteredRecurring.map(r => {
      const days = r.next_due_date ? Math.ceil((new Date(r.next_due_date) - now) / (1000 * 60 * 60 * 24)) : null;
      return {
        ...r,
        vehicle: vehicleMap[r.vehicle_id] || null,
        due_status: days === null ? 'no_due_date' : days < 0 ? 'overdue' : days <= 14 ? 'due_soon' : 'scheduled',
        monthly_amount: r.frequency === 'weekly' ? (r.amount || 0) * 4.33 : r.frequency === 'quarterly' ? (r.amount || 0) / 3 : r.frequency === 'yearly' ? (r.amount || 0) / 12 : (r.amount || 0),
      };
    });

    const totalExpenses = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const byVehicle = {};
    const byCategory = {};
    const byHost = {};

    enrichedExpenses.forEach(e => {
      byVehicle[e.vehicle_id || 'unassigned'] = (byVehicle[e.vehicle_id || 'unassigned'] || 0) + (e.amount || 0);
      byCategory[e.expense_type || e.category || 'other'] = (byCategory[e.expense_type || e.category || 'other'] || 0) + (e.amount || 0);
      byHost[e.host_id || 'unknown'] = (byHost[e.host_id || 'unknown'] || 0) + (e.amount || 0);
    });

    const unassignedExpenses = enrichedExpenses.filter(e => !e.vehicle_id);
    const paidRevenue = paymentLogs.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0);
    const profitImpact = paidRevenue - totalExpenses;

    const vehicleProfitability = vehicles.map(v => {
      const vRevenue = paymentLogs.filter(p => p.vehicle_id === v.id && p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0);
      const vExpenses = filteredExpenses.filter(e => e.vehicle_id === v.id).reduce((s, e) => s + (e.amount || 0), 0);
      return {
        vehicle_id: v.id,
        vehicle_name: `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim(),
        revenue: vRevenue,
        expenses: vExpenses,
        profit: vRevenue - vExpenses,
      };
    });

    const warnings = [];
    if (unassignedExpenses.length) warnings.push(`${unassignedExpenses.length} expense(s) are not assigned to a vehicle`);

    return Response.json({
      expenses: enrichedExpenses,
      recurring_expenses: enrichedRecurring,
      kpis: {
        total_expenses: totalExpenses,
        unassigned_expense_count: unassignedExpenses.length,
        recurring_count: filteredRecurring.length,
        due_soon_count: enrichedRecurring.filter(r => r.due_status === 'due_soon').length,
        overdue_count: enrichedRecurring.filter(r => r.due_status === 'overdue').length,
        gross_revenue: paidRevenue,
        profit_impact: profitImpact,
      },
      breakdowns: { by_vehicle: byVehicle, by_category: byCategory, by_host: byHost },
      vehicle_profitability: vehicleProfitability,
      unassigned_expenses: unassignedExpenses,
      warnings,
      calculation_notes: ['HostExpense is canonical', 'VehicleExpense is legacy and excluded', 'RecurringExpense is canonical for recurring', 'Revenue from PaymentLog (paid only)'],
      scope: isAdmin ? 'admin' : 'host',
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getExpenseCenterMetrics]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});