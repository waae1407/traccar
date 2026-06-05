import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
    if (plans?.[0]) {
      await base44.asServiceRole.entities.OperatorPlanConfiguration.update(plans[0].id, {
        status: 'active',
        active_mode: plans[0].selected_mode || plans[0].active_mode || 'fleetos_professional',
        fee_structure_acknowledged: true,
        fee_structure_acknowledged_at: plans[0].fee_structure_acknowledged_at || now,
        fee_structure_acknowledged_by: user.email,
        activated_at: plans[0].activated_at || now,
        activation_source: 'self_service',
        last_payment_status: 'not_required',
        billing_activation_pending: false,
        last_updated_at: now
      });
    }

    return Response.json({ ok: true, host_id, status: 'approved' });
  } catch (error) {
    console.error('[SelfServiceActivateHost] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});