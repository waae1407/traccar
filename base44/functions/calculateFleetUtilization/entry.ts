import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    // Only allow admin or service role
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffIso = thirtyDaysAgo.toISOString();

    const vehicles = await base44.asServiceRole.entities.Vehicle.filter({});
    let updatedCount = 0;

    for (const vehicle of vehicles) {
      // 1. Calculate 30-Day Trailing Average
      const snapshots = await base44.asServiceRole.entities.OdometerSnapshot.filter({ vehicle_id: vehicle.id });
      const recentSnapshots = snapshots.filter(s => s.captured_at >= cutoffIso).sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());

      let avgMilesPerDay = 0;
      if (recentSnapshots.length >= 2) {
        const earliest = recentSnapshots[0];
        const latest = recentSnapshots[recentSnapshots.length - 1];
        const milesDriven = latest.virtual_odometer_miles - earliest.virtual_odometer_miles;
        const daysBetween = (new Date(latest.captured_at).getTime() - new Date(earliest.captured_at).getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysBetween > 0 && milesDriven >= 0) {
          avgMilesPerDay = milesDriven / daysBetween;
        }
      }

      // 2. Project Next Maintenance Date (assuming 5000 mile intervals for oil changes)
      // This is a naive example: Next service = (current miles rounded up to next 5k)
      let projectedDateStr = null;
      if (vehicle.virtual_odometer !== undefined && avgMilesPerDay > 0) {
        const nextMilestone = Math.ceil(vehicle.virtual_odometer / 5000) * 5000;
        let milesToMilestone = nextMilestone - vehicle.virtual_odometer;
        if (milesToMilestone === 0) milesToMilestone = 5000; // if exactly on it, predict next one
        
        const daysToMilestone = milesToMilestone / avgMilesPerDay;
        const projectedDate = new Date();
        projectedDate.setDate(projectedDate.getDate() + daysToMilestone);
        projectedDateStr = projectedDate.toISOString().split('T')[0];
      }

      // 3. Apportion Lifetime Miles (Active Rental vs Operational Idle)
      // We look at all dropoff snapshots to calculate active miles.
      let totalActiveMiles = 0;
      for (let i = 0; i < snapshots.length; i++) {
        if (snapshots[i].snapshot_type === 'rental_dropoff') {
          // Find the corresponding pickup
          const pickup = snapshots.find(s => s.booking_id === snapshots[i].booking_id && s.snapshot_type === 'rental_pickup');
          if (pickup) {
            totalActiveMiles += (snapshots[i].virtual_odometer_miles - pickup.virtual_odometer_miles);
          }
        }
      }

      const totalDrivenSinceBaseline = (vehicle.virtual_odometer || 0) - (vehicle.baseline_odometer || 0);
      const totalIdleMiles = Math.max(0, totalDrivenSinceBaseline - totalActiveMiles);

      // Update Vehicle
      await base44.asServiceRole.entities.Vehicle.update(vehicle.id, {
        utilization_30d_avg_miles_per_day: Math.round(avgMilesPerDay * 10) / 10,
        projected_maintenance_date: projectedDateStr,
        lifetime_active_rental_miles: Math.round(totalActiveMiles),
        lifetime_operational_idle_miles: Math.round(totalIdleMiles)
      });
      updatedCount++;
    }

    return Response.json({ status: 'success', vehicles_updated: updatedCount });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});