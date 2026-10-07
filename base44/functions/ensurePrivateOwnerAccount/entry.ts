import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

/**
 * ensurePrivateOwnerAccount — Creates a lightweight "personal" Host record for
 * a private GPS customer so they can access the fleet dashboard, add vehicles,
 * and control their devices. Idempotent — safe to call on every dashboard load.
 *
 * A personal host (host_type='personal', status='approved') is NOT a rental
 * host — they cannot list vehicles or receive bookings. The dashboard menu
 * filters out renter tabs for personal hosts. When they're ready to rent,
 * convertToHost upgrades this record to a real host.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const email = (user.email || '').toLowerCase().trim();
    const existingHosts = await base44.asServiceRole.entities.Host.filter({ email }, '-created_date', 5);
    const existingHost = existingHosts.find((h) => h.email === email || h.user_id === user.id);

    // Already a real (non-personal) host — nothing to do
    if (existingHost && existingHost.host_type !== 'personal') {
      return Response.json({ ok: true, host_id: existingHost.id, already_host: true, host_type: existingHost.host_type });
    }

    // Personal host already exists
    if (existingHost && existingHost.host_type === 'personal') {
      return Response.json({ ok: true, host_id: existingHost.id, host_type: 'personal', created: false });
    }

    // Create personal host
    const now = new Date().toISOString();
    const host = await base44.asServiceRole.entities.Host.create({
      user_id: user.id,
      full_name: user.full_name || email,
      email,
      status: 'approved',
      host_type: 'personal',
      commission_rate: 0,
      city: '',
      state: '',
      approved_at: now,
      approved_by: 'system',
    });

    return Response.json({ ok: true, host_id: host.id, host_type: 'personal', created: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});