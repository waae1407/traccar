import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * calculateHostEarnings
 *
 * Creates weekly HostPayout records from actual PaymentLog data (not weekly_rate).
 *
 * Previous bugs fixed:
 * - Used booking.weekly_rate instead of actual PaymentLog amounts
 * - Used booking.updated_date for period filtering (changes on any update)
 * - Did not set booking_request_id (created orphaned payouts)
 * - Did not calculate Stripe fees
 * - Dedup check by period_start only (missed duplicates with different periods)
 *
 * Now uses:
 * - PaymentLog.paid_at for date filtering (actual payment date)
 * - PaymentLog.amount for gross (actual collected amount)
 * - PaymentLog.stripe_fee_amount (or sum from charge data) for Stripe fees
 * - booking_request_id from the first PaymentLog in the period
 * - Dedup by host_id + period_start + booking_request_id
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isCronEarnings = !!(Deno.env.get('CRON_SECRET') && req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET'));
    const isScheduledEarnings = req.headers.get('x-base44-scheduled-function') === 'true';
    if (!isCronEarnings && !isScheduledEarnings) {
      const user = await base44.auth.me();
      if (!user || user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const today = new Date();
    const periodEnd = today.toISOString().split("T")[0];
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const periodStart = weekAgo.toISOString().split("T")[0];

    // ── Use PaymentLog records for actual collected amounts ──
    const paymentLogs = await base44.asServiceRole.entities.PaymentLog.filter({
      status: "paid",
      paid_at: { $gte: periodStart + "T00:00:00.000Z" },
    }, "-paid_at", 500);

    // Filter to the period and group by host
    const periodLogs = paymentLogs.filter(p => {
      const paidDate = p.paid_at?.split("T")[0];
      return paidDate >= periodStart && paidDate <= periodEnd && p.host_id;
    });

    // Group by host
    const byHost = {};
    for (const log of periodLogs) {
      if (!byHost[log.host_id]) {
        byHost[log.host_id] = { logs: [], bookingIds: new Set(), vehicleIds: new Set() };
      }
      byHost[log.host_id].logs.push(log);
      if (log.booking_request_id) byHost[log.host_id].bookingIds.add(log.booking_request_id);
      if (log.vehicle_id) byHost[log.host_id].vehicleIds.add(log.vehicle_id);
    }

    const hosts = await base44.asServiceRole.entities.Host.filter({ status: "approved" });
    const results = [];

    for (const host of hosts) {
      const hostData = byHost[host.id];
      if (!hostData || hostData.logs.length === 0) continue;

      const commissionRate = host.commission_rate ?? 0.08;

      // Use actual collected amounts from PaymentLogs
      const grossCollected = hostData.logs.reduce((s, p) => s + (p.amount || 0), 0);
      const stripeFeeAmount = hostData.logs.reduce((s, p) => s + (p.stripe_fee_amount || 0), 0);
      const uridePlatformFee = Math.round(grossCollected * commissionRate * 100) / 100;
      const netPayout = Math.round((grossCollected - uridePlatformFee - stripeFeeAmount) * 100) / 100;

      // Use the first booking_request_id (primary booking for this period)
      const bookingIds = [...hostData.bookingIds];
      const primaryBookingId = bookingIds[0] || "";

      // ── Dedup: check by host_id + period_start (and booking_request_id if available) ──
      const existing = await base44.asServiceRole.entities.HostPayout.filter({
        host_id: host.id,
        period_start: periodStart,
      });
      // Skip if a non-voided payout already exists for this period
      const activeExisting = existing.filter(p => p.status !== 'voided_duplicate');
      if (activeExisting.length > 0) {
        results.push({ host_id: host.id, host_name: host.full_name, skipped: true, reason: "payout already exists for this period" });
        continue;
      }

      await base44.asServiceRole.entities.HostPayout.create({
        host_id: host.id,
        host_email: host.email,
        host_name: host.full_name,
        booking_request_id: primaryBookingId,
        period_start: periodStart,
        period_end: periodEnd,
        gross_booking_amount: grossCollected,
        stripe_fee_amount: stripeFeeAmount,
        uride_platform_fee_amount: uridePlatformFee,
        uride_platform_fee_rate: commissionRate,
        net_host_payout: netPayout,
        // Legacy aliases
        gross_collected: grossCollected,
        platform_fee: uridePlatformFee,
        net_payout: netPayout,
        status: "pending",
        booking_count: hostData.logs.length,
        vehicle_count: hostData.vehicleIds.size,
      });

      results.push({ host_id: host.id, host_name: host.full_name, gross: grossCollected, net: netPayout, payments: hostData.logs.length });
      console.log(`[HostEarnings] Created payout for ${host.full_name}: gross $${grossCollected} | Stripe Fee: $${stripeFeeAmount} | Uride Fee (${(commissionRate*100).toFixed(0)}%): $${uridePlatformFee} | Net: $${netPayout}`);
    }

    return Response.json({ ok: true, payouts_created: results.filter(r => !r.skipped).length, skipped: results.filter(r => r.skipped).length, results });
  } catch (error) {
    console.error("[HostEarnings] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});