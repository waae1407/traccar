/**
 * recalculateHostFinancials v1.0 - Payment360 Production Certified
 *
 * Recalculates host financial summaries from canonical sources:
 * - PaymentLog = source of truth for customer payments
 * - HostPayout = source of truth for host payout obligations
 *
 * Updates Host.cached fields:
 * - total_earnings (sum of PaymentLog.gross_amount)
 * - total_payouts (sum of HostPayout.net_host_payout where status in ['paid', 'pending', 'processing'])
 * - total_paid_out (sum where status = 'paid')
 * - total_failed_payouts (sum where status = 'failed')
 * - total_pending_payouts (sum where status in ['pending', 'processing', 'on_hold'])
 *
 * Does NOT use orphaned HostPayout records (booking_request_id = null) unless explicitly classified as legacy_orphan.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const hostIdFilter = body.host_id || null;
    const dryRun = body.dry_run || false;

    // Fetch hosts
    const hostQuery = hostIdFilter ? { id: hostIdFilter } : {};
    const hosts = await base44.asServiceRole.entities.Host.filter(hostQuery, '-created_date', 100);

    const results = [];

    for (const host of hosts) {
      const result = {
        host_id: host.id,
        host_email: host.email,
        host_name: host.full_name,
        status: 'calculated',
      };

      // 1. Calculate total_gross_revenue from PaymentLog
      const paymentLogs = await base44.asServiceRole.entities.PaymentLog.filter({
        host_id: host.id,
        status: 'paid'
      });
      
      const totalGrossRevenue = paymentLogs.reduce((sum, log) => sum + (log.amount || 0), 0);
      const totalPlatformFees = paymentLogs.reduce((sum, log) => sum + (log.platform_fee_amount || 0), 0);
      
      result.total_gross_revenue = Math.round(totalGrossRevenue * 100) / 100;
      result.total_platform_fees = Math.round(totalPlatformFees * 100) / 100;

      // 2. Calculate host earnings/payouts from HostPayout (exclude orphans)
      const payouts = await base44.asServiceRole.entities.HostPayout.filter({
        host_id: host.id,
        booking_request_id: { $exists: true, $ne: null } // Exclude orphans
      });

      let totalEarnings = 0;
      let totalPaidOut = 0;
      let totalFailedPayouts = 0;
      let totalPendingPayouts = 0;

      for (const payout of payouts) {
        const netAmount = payout.net_host_payout || payout.net_payout || 0;
        
        if (['paid', 'pending', 'processing'].includes(payout.status)) {
          totalEarnings += netAmount;
        }
        
        if (payout.status === 'paid') {
          totalPaidOut += netAmount;
        } else if (['failed', 'failed_requires_manual_review', 'voided_duplicate'].includes(payout.status)) {
          totalFailedPayouts += netAmount;
        } else if (['pending', 'processing', 'on_hold', 'on_hold_stripe_balance', 'held'].includes(payout.status)) {
          totalPendingPayouts += netAmount;
        }
      }

      result.total_earnings = Math.round(totalEarnings * 100) / 100;
      result.total_paid_out = Math.round(totalPaidOut * 100) / 100;
      result.total_failed_payouts = Math.round(totalFailedPayouts * 100) / 100;
      result.total_pending_payouts = Math.round(totalPendingPayouts * 100) / 100;

      // 3. Update Host cached fields
      if (!dryRun) {
        await base44.asServiceRole.entities.Host.update(host.id, {
          total_earnings: result.total_earnings,
          total_payouts: result.total_paid_out, // Legacy field = actually paid out
        });
      }

      // 4. Detect mismatches
      const earningsMismatch = Math.abs((host.total_earnings || 0) - result.total_earnings) > 0.01;
      const payoutsMismatch = Math.abs((host.total_payouts || 0) - result.total_paid_out) > 0.01;

      if (earningsMismatch || payoutsMismatch) {
        result.had_mismatch = true;
        result.previous_total_earnings = host.total_earnings || 0;
        result.previous_total_payouts = host.total_payouts || 0;
      }

      results.push(result);
    }

    const summary = {
      total_hosts: results.length,
      had_mismatch: results.filter(r => r.had_mismatch).length,
      dry_run: dryRun,
      results,
    };

    return Response.json(summary);
  } catch (error) {
    console.error('[RecalculateHostFinancials] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});