import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { host_id } = await req.json();
    if (!host_id) return Response.json({ error: 'Missing host_id' }, { status: 400 });

    const hosts = await base44.asServiceRole.entities.Host.filter({ id: host_id });
    const host = hosts?.[0];
    const isOwner = host?.email === user.email || host?.user_id === user.id;
    if (!host) return Response.json({ error: 'Host not found' }, { status: 404 });
    if (!isOwner && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const now = new Date().toISOString();
    const users = await base44.asServiceRole.entities.User.filter({ email: host.email });
    if (users?.[0] && users[0].role !== 'admin') {
      await base44.asServiceRole.entities.User.update(users[0].id, { role: 'host' });
    }

    await base44.asServiceRole.entities.Host.update(host_id, {
      status: 'approved',
      approved_at: host.approved_at || now,
      approved_by: 'self_service',
      verification_status: host.verification_status || 'not_started'
    });

    const plans = await base44.asServiceRole.entities.OperatorPlanConfiguration.filter({ host_id });
    const plan = plans?.[0];
    if (plan) {
      const selectedMode = plan.selected_mode || plan.active_mode || 'marketplace_partner';
      const paidPlan = ['fleetos_professional', 'hybrid_growth'].includes(selectedMode);

      await base44.asServiceRole.entities.OperatorPlanConfiguration.update(plan.id, {
        // Never block hosts during activation — paid plan billing is deferred to post-onboarding
        status: paidPlan ? 'setup_pending' : 'active',
        active_mode: selectedMode,
        fee_structure_acknowledged: true,
        fee_structure_acknowledged_at: plan.fee_structure_acknowledged_at || now,
        fee_structure_acknowledged_by: user.email,
        activated_at: plan.activated_at || now,
        activation_source: 'self_service',
        last_payment_status: paidPlan ? 'not_required' : (plan.last_payment_status || 'not_required'),
        payment_required: false,
        billing_activation_pending: false,
        subscription_required_later: paidPlan,
        subscription_activation_stage: paidPlan ? 'post_onboarding' : null,
        onboarding_complete: true,
        last_updated_at: now
      });
    }

    return Response.json({ ok: true, host_id, status: 'approved' });
  } catch (error) {
    console.error('[SelfServiceActivateHost] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});