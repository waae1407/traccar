/**
 * backfillHostAgreements — Retroactively creates pending Platform Services Agreement
 * records for all existing hosts and sends them a notification directing them to sign.
 *
 * Run once (admin-triggered or scheduled). For each host:
 *   1. Resolves their current plan type from HostCommerceProfile / OperatorPlanConfiguration
 *   2. Creates a pending_signature HostPlatformAgreement record (if none exists)
 *   3. Sends an in-app + email + push notification directing them to /host/platform-agreement
 *
 * Idempotent: hosts with an existing signed or pending agreement are skipped.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const AGREEMENT_VERSION = 'v1.0';
const APP_URL = 'https://uridehub.com';

const PLAN_LABELS = {
  marketplace_partner: 'Marketplace Partner',
  fleetos_professional: 'FleetOS Professional',
  hybrid_growth: 'Hybrid Growth',
};

const PLAN_COMMISSION = {
  marketplace_partner: 0.08,
  fleetos_professional: 0,
  hybrid_growth: 0.05,
};

const PLAN_MONTHLY = {
  marketplace_partner: 0,
  fleetos_professional: 29.99,
  hybrid_growth: 29.99,
};

async function authorize(base44, req) {
  const user = await base44.auth.me().catch(() => null);
  if (user) {
    if (user.role !== 'admin') return { ok: false, response: Response.json({ error: 'Forbidden — admin only' }, { status: 403 }) };
    return { ok: true, user };
  }
  const isCron = !!(Deno.env.get('CRON_SECRET') && req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET'));
  const isScheduled = req.headers.get('x-base44-scheduled-function') === 'true';
  if (isCron || isScheduled) return { ok: true, user: { id: 'system', email: 'system@uride', role: 'admin' } };
  return { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const auth = await authorize(base44, req);
    if (!auth.ok) return auth.response;

    const now = new Date().toISOString();
    const results = { hosts_scanned: 0, agreements_created: 0, notifications_sent: 0, skipped_existing: 0, errors: [] };

    // Fetch all hosts (approved or any status — we want everyone)
    const hosts = await base44.asServiceRole.entities.Host.list('-created_date', 500);
    results.hosts_scanned = hosts.length;

    for (const host of hosts) {
      try {
        // Check for existing agreement
        const existing = await base44.asServiceRole.entities.HostPlatformAgreement.filter({ host_id: host.id }, '-updated_date', 1).catch(() => []);
        if (existing[0]) {
          results.skipped_existing++;
          continue;
        }

        // Resolve plan type
        const commerceProfiles = await base44.asServiceRole.entities.HostCommerceProfile.filter({ host_id: host.id }, '-updated_date', 1).catch(() => []);
        const plans = await base44.asServiceRole.entities.OperatorPlanConfiguration.filter({ host_id: host.id }, '-updated_date', 1).catch(() => []);
        const planType = commerceProfiles[0]?.plan_type || plans[0]?.active_mode || plans[0]?.selected_mode || 'marketplace_partner';
        const commissionRate = commerceProfiles[0]?.commission_rate ?? PLAN_COMMISSION[planType] ?? 0.08;
        const monthlyAmount = PLAN_MONTHLY[planType] ?? 0;
        const planLabel = PLAN_LABELS[planType] || 'Marketplace Partner';

        // Create pending agreement
        await base44.asServiceRole.entities.HostPlatformAgreement.create({
          host_id: host.id,
          host_email: host.email,
          host_name: host.business_name || host.full_name || host.email,
          plan_type: planType,
          plan_label: planLabel,
          commission_rate: commissionRate,
          monthly_subscription_amount: monthlyAmount,
          agreement_version: AGREEMENT_VERSION,
          agreement_html: '',
          status: 'pending_signature',
          signed_via: 'backfill',
          backfill_notification_sent: false,
        });
        results.agreements_created++;

        // Send notification directing host to sign
        const title = '📋 Action Required: Sign Your Platform Services Agreement';
        const message = `Hi ${host.full_name || host.business_name || 'Host'},\n\n` +
          `We've added a Platform Services Agreement that defines the responsibilities between you and uRide for your ${planLabel} plan. ` +
          `This agreement covers your commission rate (${(commissionRate * 100).toFixed(1)}%), payout terms, telematics authorization, and liability allocation.\n\n` +
          `Please review and sign it to keep your account in good standing. It takes about 2 minutes.\n\n` +
          `Sign here: ${APP_URL}/host/platform-agreement`;

        await base44.asServiceRole.functions.invoke('routePlatformNotification', {
          event_type: 'platform_agreement_signature_required',
          severity: 'warning',
          category: 'system',
          title,
          message,
          host_id: host.id,
          action_url: '/host/platform-agreement',
          source_function: 'backfillHostAgreements',
          metadata: { plan_type: planType, agreement_version: AGREEMENT_VERSION, backfill: true },
        }).catch((e) => {
          results.errors.push({ host_id: host.id, error: `Notification failed: ${e.message}` });
        });

        // Mark the agreement as notified
        const freshAgreements = await base44.asServiceRole.entities.HostPlatformAgreement.filter({ host_id: host.id }, '-updated_date', 1).catch(() => []);
        if (freshAgreements[0]) {
          await base44.asServiceRole.entities.HostPlatformAgreement.update(freshAgreements[0].id, {
            backfill_notification_sent: true,
            backfill_notified_at: now,
          }).catch(() => {});
        }

        results.notifications_sent++;
      } catch (e) {
        results.errors.push({ host_id: host.id, error: e.message });
      }
    }

    console.log(`[backfillHostAgreements] Scanned ${results.hosts_scanned} hosts — created ${results.agreements_created} agreements, sent ${results.notifications_sent} notifications, skipped ${results.skipped_existing} existing`);
    return Response.json({ ok: true, ...results, timestamp: now });
  } catch (error) {
    console.error('[backfillHostAgreements] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});