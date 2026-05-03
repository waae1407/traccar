import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const today = new Date();
    const periodEnd = today.toISOString().split("T")[0];
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const periodStart = weekAgo.toISOString().split("T")[0];

    const hosts = await base44.asServiceRole.entities.Host.filter({ status: "approved" });
    const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ payment_status: "paid" });
    const periodBookings = bookings.filter(b => {
      const paidDate = b.updated_date?.split("T")[0];
      return paidDate >= periodStart && paidDate <= periodEnd && b.host_id;
    });

    const results = [];

    for (const host of hosts) {
      const hostBookings = periodBookings.filter(b => b.host_id === host.id);
      if (hostBookings.length === 0) continue;

      const commissionRate = host.commission_rate ?? 0.08;
      const grossCollected = hostBookings.reduce((s, b) => s + (b.weekly_rate || 0), 0);
      const uridePlatformFee = Math.round(grossCollected * commissionRate * 100) / 100;
      const netPayout = Math.round((grossCollected - uridePlatformFee) * 100) / 100;

      const existing = await base44.asServiceRole.entities.HostPayout.filter({ host_id: host.id, period_start: periodStart });

      if (existing.length === 0) {
        await base44.asServiceRole.entities.HostPayout.create({
          host_id: host.id,
          host_email: host.email,
          host_name: host.full_name,
          period_start: periodStart,
          period_end: periodEnd,
          gross_booking_amount: grossCollected,
          uride_platform_fee_amount: uridePlatformFee,
          uride_platform_fee_rate: commissionRate,
          net_host_payout: netPayout,
          // Legacy aliases
          gross_collected: grossCollected,
          platform_fee: uridePlatformFee,
          net_payout: netPayout,
          status: "pending",
          booking_count: hostBookings.length,
          vehicle_count: [...new Set(hostBookings.map(b => b.vehicle_id))].length,
        });

        results.push({ host_id: host.id, host_name: host.full_name, gross: grossCollected, net: netPayout, bookings: hostBookings.length });
        console.log(`[HostEarnings] Created payout for ${host.full_name}: gross $${grossCollected} | Uride Fee (${(commissionRate*100).toFixed(0)}%): $${uridePlatformFee} | Net: $${netPayout}`);
      }
    }

    return Response.json({ ok: true, payouts_created: results.length, results });
  } catch (error) {
    console.error("[HostEarnings] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});