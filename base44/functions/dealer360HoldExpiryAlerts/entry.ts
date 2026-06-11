/**
 * dealer360HoldExpiryAlerts
 *
 * Scheduled daily job — checks all open Dealer360 purchase requests
 * with active Stripe authorization holds and sends expiry warnings.
 *
 * Sends:
 *   48h warning  — if hold_expires_at < now + 48h  (and 48h warning not yet sent)
 *   24h warning  — if hold_expires_at < now + 24h  (and 24h warning not yet sent)
 *   Expired alert — if hold_expires_at <= now        (hold has already expired)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const now = new Date();
    const nowMs = now.getTime();
    const h48 = nowMs + (48 * 60 * 60 * 1000);
    const h24 = nowMs + (24 * 60 * 60 * 1000);

    // Fetch all PRs with active authorized holds
    const activeBidStatuses = ['funded', 'under_review', 'bid_placed', 'outbid', 'won'];
    const allPRs = await base44.asServiceRole.entities.DealerPurchaseRequest.list('-created_date', 500);
    const openHolds = allPRs.filter(pr =>
      pr.hold_status === 'authorized' &&
      !pr.hold_captured &&
      !pr.hold_released &&
      activeBidStatuses.includes(pr.status)
    );

    let warned48 = 0, warned24 = 0, alertedExpired = 0;
    const nowIso = now.toISOString();

    for (const pr of openHolds) {
      if (!pr.hold_expires_at) continue;
      const expiresMs = new Date(pr.hold_expires_at).getTime();
      const label = `${pr.year} ${pr.make} ${pr.model} (VIN: ${pr.vin})`;

      if (expiresMs <= nowMs) {
        // EXPIRED — alert admin + host
        await Promise.all([
          base44.asServiceRole.entities.Notification.create({
            user_email: 'admin',
            title: `🚨 Dealer360 Hold EXPIRED — ${label}`,
            body: `The Buying Power Hold for ${pr.host_email}'s purchase of ${label} has expired. Bidding is now blocked. Host must reauthorize before the bid desk can continue. PR ID: ${pr.id}`,
            type: 'payment',
          }),
          base44.asServiceRole.entities.Notification.create({
            user_email: pr.host_email,
            title: `🚨 Buying Power Hold Expired — ${label}`,
            body: `Your Buying Power Hold for ${label} has expired. Reauthorization is required before bidding can continue. Please contact your bid desk agent or log in to Dealer360 to resubmit.`,
            type: 'payment',
          }),
        ]);
        alertedExpired++;

      } else if (expiresMs < h24 && !pr.hold_expiry_final_warning_sent_at) {
        // UNDER 24H — final warning
        await base44.asServiceRole.entities.DealerPurchaseRequest.update(pr.id, {
          hold_expiry_final_warning_sent_at: nowIso,
          activity_log: [...(pr.activity_log || []), {
            action: 'hold_expiry_final_warning_sent',
            actor: 'system',
            note: `Final 24h expiry warning sent. Expires: ${pr.hold_expires_at}`,
            at: nowIso,
          }],
        });
        await Promise.all([
          base44.asServiceRole.entities.Notification.create({
            user_email: 'admin',
            title: `⚠️ Hold Expires in <24h — ${label}`,
            body: `URGENT: The Buying Power Hold for ${pr.host_email}'s purchase of ${label} expires in less than 24 hours (${new Date(pr.hold_expires_at).toLocaleString()}). Immediate action required.`,
            type: 'payment',
          }),
          base44.asServiceRole.entities.Notification.create({
            user_email: pr.host_email,
            title: `⚠️ Buying Power Hold Expires Soon — ${label}`,
            body: `Your Buying Power Hold for ${label} will expire in less than 24 hours. Your Buying Power Hold will expire soon and may require reauthorization. Please contact your uRide agent immediately.`,
            type: 'payment',
          }),
        ]);
        warned24++;

      } else if (expiresMs < h48 && !pr.hold_expiry_warning_sent_at) {
        // UNDER 48H — first warning
        await base44.asServiceRole.entities.DealerPurchaseRequest.update(pr.id, {
          hold_expiry_warning_sent_at: nowIso,
          activity_log: [...(pr.activity_log || []), {
            action: 'hold_expiry_warning_sent',
            actor: 'system',
            note: `48h expiry warning sent. Expires: ${pr.hold_expires_at}`,
            at: nowIso,
          }],
        });
        await Promise.all([
          base44.asServiceRole.entities.Notification.create({
            user_email: 'admin',
            title: `⏳ Hold Expires in <48h — ${label}`,
            body: `The Buying Power Hold for ${pr.host_email}'s purchase of ${label} expires within 48 hours (${new Date(pr.hold_expires_at).toLocaleString()}). Resolve or reauthorize before expiry.`,
            type: 'payment',
          }),
          base44.asServiceRole.entities.Notification.create({
            user_email: pr.host_email,
            title: `⏳ Buying Power Hold Expires in 48 Hours — ${label}`,
            body: `Your Buying Power Hold for ${label} will expire within 48 hours. Your Buying Power Hold will expire soon and may require reauthorization if the auction has not concluded. Contact your uRide agent if you have questions.`,
            type: 'payment',
          }),
        ]);
        warned48++;
      }
    }

    return Response.json({
      ok: true,
      open_holds_checked: openHolds.length,
      expired_alerted: alertedExpired,
      warned_24h: warned24,
      warned_48h: warned48,
    });

  } catch (error) {
    console.error('[dealer360HoldExpiryAlerts]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});