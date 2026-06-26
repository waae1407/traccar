import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2023-10-16' });

const WEBHOOK_URL = 'https://uridehub.com/api/apps/69cdfc01c15011a821c6ee7e/functions/stripeWebhook';

const REQUIRED_EVENTS = [
  'checkout.session.completed',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'transfer.failed',
  'payout.failed',
  'payout.canceled',
  'setup_intent.succeeded',
  'account.updated',
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const results = { manualPayouts: null, webhookEndpoint: null, errors: [] };

    // ── 1. Switch platform account to MANUAL payouts ──────────────────────────
    // stripe.accounts.update() only works on connected accounts — for the platform's
    // own account, we must call the API directly via fetch.
    try {
      const account = await stripe.accounts.retrieve();
      const currentSchedule = account.settings?.payouts?.schedule?.interval;

      if (currentSchedule === 'manual') {
        results.manualPayouts = { status: 'already_manual', account_id: account.id };
      } else {
        // Direct API call — Stripe SDK blocks updating your own account
        const response = await fetch(`https://api.stripe.com/v1/accounts/${account.id}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            'settings[payouts][schedule][interval]': 'manual',
          }),
        });
        const updated = await response.json();
        if (updated.error) {
          throw new Error(updated.error.message);
        }
        results.manualPayouts = {
          status: 'switched_to_manual',
          account_id: updated.id,
          previous_schedule: currentSchedule,
          new_schedule: updated.settings?.payouts?.schedule?.interval,
        };
      }
    } catch (e) {
      results.errors.push({ step: 'manual_payouts', error: e.message });
    }

    // ── 2. Create or verify the webhook endpoint ──────────────────────────────
    try {
      const existingEndpoints = await stripe.webhookEndpoints.list({ limit: 100 });
      const matching = existingEndpoints.data.find(ep => ep.url === WEBHOOK_URL);

      if (matching) {
        // Verify all required events are subscribed
        const missingEvents = REQUIRED_EVENTS.filter(e => !matching.enabled_events.includes(e));
        if (missingEvents.length > 0) {
          const updated = await stripe.webhookEndpoints.update(matching.id, {
            enabled_events: REQUIRED_EVENTS,
          });
          results.webhookEndpoint = {
            status: 'updated_events',
            id: updated.id,
            url: updated.url,
            enabled_events: updated.enabled_events,
            missing_events_added: missingEvents,
          };
        } else {
          results.webhookEndpoint = {
            status: 'already_configured',
            id: matching.id,
            url: matching.url,
            enabled_events: matching.enabled_events,
          };
        }
      } else {
        // Create new webhook endpoint
        const created = await stripe.webhookEndpoints.create({
          url: WEBHOOK_URL,
          enabled_events: REQUIRED_EVENTS,
          description: 'uRide Platform — Payment360 webhook',
        });
        results.webhookEndpoint = {
          status: 'created',
          id: created.id,
          url: created.url,
          enabled_events: created.enabled_events,
          secret_prefix: created.secret?.slice(0, 10) + '...',
          note: 'Save the full secret as STRIPE_WEBHOOK_SECRET in Base44 secrets.',
        };
      }
    } catch (e) {
      results.errors.push({ step: 'webhook_endpoint', error: e.message });
    }

    // ── 3. Log the action ──────────────────────────────────────────────────────
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'admin.override',
      actor_id: user.id,
      actor_email: user.email,
      actor_role: 'admin',
      target_entity: 'StripeAccount',
      summary: `Stripe payout configuration fixed: ${results.manualPayouts?.status || 'failed'} payouts, ${results.webhookEndpoint?.status || 'failed'} webhook`,
      metadata: results,
      source: 'admin_panel',
      event_status: results.errors.length > 0 ? 'warning' : 'success',
    }).catch(() => {});

    return Response.json(results);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});