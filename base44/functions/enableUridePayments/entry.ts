import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { host_id } = await req.json();
    if (!host_id) return Response.json({ error: 'Missing host_id' }, { status: 400 });

    const host = await base44.asServiceRole.entities.Host.get(host_id);
    const isOwner = host?.email === user.email || host?.user_id === user.id;
    if (!host || (!isOwner && user.role !== 'admin')) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2023-10-16' });
    let accountId = host.stripe_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: host.email,
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        business_type: 'individual',
        metadata: { host_id, platform: 'uride', feature: 'uride_payments' }
      });
      accountId = account.id;
      await base44.asServiceRole.entities.Host.update(host_id, { stripe_account_id: accountId });
    }

    const now = new Date().toISOString();
    const settings = await base44.asServiceRole.entities.HostPaymentSettings.filter({ host_id });
    if (settings?.[0]) {
      await base44.asServiceRole.entities.HostPaymentSettings.update(settings[0].id, { stripe_connect_started_at: now, last_updated_at: now });
    } else {
      await base44.asServiceRole.entities.HostPaymentSettings.create({ host_id, user_id: host.user_id || user.id, payment_mode: 'own_payments', uride_payments_enabled: false, stripe_connect_started_at: now, last_updated_at: now });
    }

    const origin = req.headers.get('origin') || 'https://uridehub.com';
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/host/business-operations?uride_payments_refresh=1`,
      return_url: `${origin}/host/business-operations?uride_payments_return=1`,
      type: 'account_onboarding'
    });

    return Response.json({ url: accountLink.url, account_id: accountId });
  } catch (error) {
    console.error('[EnableUridePayments] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});