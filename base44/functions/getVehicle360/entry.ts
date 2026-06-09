import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { vehicle_id } = await req.json();
    if (!vehicle_id) return Response.json({ error: 'vehicle_id required' }, { status: 400 });

    const vehicle = await base44.asServiceRole.entities.Vehicle.get(vehicle_id);
    if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });

    const isAdmin = user.role === 'admin';
    if (!isAdmin) {
      const hosts = await base44.asServiceRole.entities.Host.filter({ email: user.email });
      const hostByUserId = await base44.asServiceRole.entities.Host.filter({ user_id: user.id });
      const myHost = hosts[0] || hostByUserId[0];
      if (!myHost || vehicle.host_id !== myHost.id) return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [host, bookings, paymentLogs, expenses, maintenanceLogs, complianceDocs, telematicsDevice, telematicsCommands, telematicsEvents, positionHistory, inspectionPackets, operationalAlerts] = await Promise.all([
      vehicle.host_id ? base44.asServiceRole.entities.Host.filter({ id: vehicle.host_id }).then(r => r[0]) : null,
      base44.asServiceRole.entities.BookingRequest.filter({ vehicle_id }),
      base44.asServiceRole.entities.PaymentLog.filter({ vehicle_id }),
      base44.asServiceRole.entities.HostExpense.filter({ vehicle_id }),
      base44.asServiceRole.entities.HostMaintenanceLog.filter({ vehicle_id }),
      base44.asServiceRole.entities.HostVehicleCompliance.filter({ vehicle_id }),
      base44.asServiceRole.entities.TelematicsDevice.filter({ vehicle_id }).then(r => r[0]),
      base44.asServiceRole.entities.TelematicsCommand.filter({ vehicle_id }, '-created_date', 50),
      base44.asServiceRole.entities.TelematicsEvent.filter({ vehicle_id }, '-created_date', 50),
      base44.asServiceRole.entities.TelematicsPositionHistory.filter({ vehicle_id }, '-timestamp', 20),
      base44.asServiceRole.entities.InspectionEvidencePacket.filter({ vehicle_id }, '-created_date', 20),
      base44.asServiceRole.entities.OperationalAlert.filter({ vehicle_id }),
    ]);

    const completedBookings = bookings.filter(b => b.booking_status === 'completed');
    const activeBooking = bookings.find(b => ['active', 'confirmed', 'approved', 'payment_due', 'suspended'].includes(b.booking_status));

    const paidLogs = paymentLogs.filter(p => p.status === 'paid');
    const vehicleRevenue = paidLogs.reduce((s, p) => s + (p.amount || 0), 0);
    const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const totalMaintenanceCost = maintenanceLogs.reduce((s, m) => s + (m.cost || 0), 0);
    const netProfit = vehicleRevenue - totalExpenses - totalMaintenanceCost;
    const roi = vehicle.purchase_price > 0 ? (netProfit / vehicle.purchase_price) * 100 : null;

    // Utilization: rough estimate from booking days
    const now = new Date();
    const firstBooking = bookings.length ? new Date(bookings[bookings.length - 1].created_date) : null;
    const availableDays = firstBooking ? Math.ceil((now - firstBooking) / (1000 * 60 * 60 * 24)) : 0;
    const rentedDays = completedBookings.reduce((s, b) => {
      if (!b.start_date || !b.end_date) return s;
      return s + Math.ceil((new Date(b.end_date) - new Date(b.start_date)) / (1000 * 60 * 60 * 24));
    }, 0);
    const utilizationRate = availableDays > 0 ? (rentedDays / availableDays) * 100 : null;

    const registration = complianceDocs.find(d => d.doc_type === 'registration');
    const insurance = complianceDocs.find(d => d.doc_type === 'insurance');

    const gpsStatus = telematicsDevice
      ? { online: telematicsDevice.online_status === 'online', status: telematicsDevice.online_status, last_seen: telematicsDevice.last_seen_at, lat: telematicsDevice.last_latitude, lon: telematicsDevice.last_longitude, starter_disabled: telematicsDevice.starter_disabled }
      : null;

    const overdueMaintenace = maintenanceLogs.filter(m => {
      const days = m.next_service_date ? Math.ceil((new Date(m.next_service_date) - now) / (1000 * 60 * 60 * 24)) : null;
      return days !== null && days < 0;
    });
    const dueSoonMaintenance = maintenanceLogs.filter(m => {
      const days = m.next_service_date ? Math.ceil((new Date(m.next_service_date) - now) / (1000 * 60 * 60 * 24)) : null;
      return days !== null && days >= 0 && days <= 14;
    });

    const warnings = [];
    if (utilizationRate !== null && utilizationRate === 0 && completedBookings.length === 0) warnings.push('Utilization is estimated — no completed bookings found');
    if (!vehicle.purchase_price) warnings.push('Purchase price not set — ROI cannot be calculated');
    if (!telematicsDevice) warnings.push('No telematics device assigned to this vehicle');
    if (telematicsDevice && telematicsDevice.online_status === 'offline') warnings.push('GPS device is offline');
    if (insurance?.status === 'expired') warnings.push('Vehicle insurance is expired');
    if (registration?.status === 'expired') warnings.push('Vehicle registration is expired');
    if (overdueMaintenace.length) warnings.push(`${overdueMaintenace.length} maintenance item(s) are overdue`);

    return Response.json({
      vehicle,
      host: host || null,
      current_booking: activeBooking ? { ...activeBooking } : null,
      rental_history: completedBookings,
      all_bookings: bookings,
      financials: {
        gross_revenue: vehicleRevenue,
        total_expenses: totalExpenses,
        total_maintenance_cost: totalMaintenanceCost,
        net_profit: netProfit,
        roi_percent: roi ? Math.round(roi * 100) / 100 : null,
        payment_log_count: paidLogs.length,
      },
      utilization: {
        available_days: availableDays,
        rented_days: rentedDays,
        utilization_rate_percent: utilizationRate ? Math.round(utilizationRate * 100) / 100 : null,
        is_estimated: true,
      },
      payment_logs: paymentLogs,
      expenses,
      maintenance: { logs: maintenanceLogs, overdue: overdueMaintenace, due_soon: dueSoonMaintenance },
      compliance: { all: complianceDocs, registration: registration || null, insurance: insurance || null },
      gps: gpsStatus,
      telematics_device: telematicsDevice || null,
      telematics_commands: telematicsCommands,
      telematics_events: telematicsEvents,
      position_history: positionHistory,
      inspections: inspectionPackets,
      operational_alerts: operationalAlerts,
      warnings,
      scope: isAdmin ? 'admin' : 'host',
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getVehicle360]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});