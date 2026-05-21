import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const url = new URL(req.url);
    const search = url.searchParams.get('search') || '';
    const thread_type = url.searchParams.get('thread_type') || '';
    const status = url.searchParams.get('status') || '';
    const priority = url.searchParams.get('priority') || '';
    const host_id = url.searchParams.get('host_id') || '';
    const customer_id = url.searchParams.get('customer_id') || '';
    const vehicle_id = url.searchParams.get('vehicle_id') || '';
    const booking_request_id = url.searchParams.get('booking_request_id') || '';
    const escalation = url.searchParams.get('escalation') === 'true';
    const unresolved = url.searchParams.get('unresolved') === 'true';
    const limit = parseInt(url.searchParams.get('limit') || '50');

    // Build query
    const query = {};
    if (thread_type) query.thread_type = thread_type;
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (host_id) query.host_id = host_id;
    if (customer_id) query.customer_id = customer_id;
    if (vehicle_id) query.vehicle_id = vehicle_id;
    if (booking_request_id) query.booking_request_id = booking_request_id;
    if (escalation) query.escalation_flag = true;
    if (unresolved) query.status = ['open', 'awaiting_host', 'awaiting_customer', 'awaiting_admin'];
    query.archived = false;

    let threads = await base44.entities.CommunicationThread.filter(query, '-last_message_at', limit);

    // Text search across subject and related entities
    if (search) {
      const q = search.toLowerCase();
      threads = threads.filter(t => {
        if (t.subject?.toLowerCase().includes(q)) return true;
        // Could expand to search booking IDs, vehicle VINs, host names, etc.
        return false;
      });
    }

    // Enrich with participant info
    const hostIds = [...new Set(threads.filter(t => t.host_id).map(t => t.host_id))];
    const customerIds = [...new Set(threads.filter(t => t.customer_id).map(t => t.customer_id))];

    const hosts = hostIds.length > 0 ? await base44.entities.Host.filter({ id: hostIds }, '', hostIds.length) : [];
    const customers = customerIds.length > 0 ? await base44.entities.Customer.filter({ email: customerIds }, '', customerIds.length) : [];

    const hostMap = Object.fromEntries(hosts.map(h => [h.id, h]));
    const customerMap = Object.fromEntries(customers.map(c => [c.email, c]));

    const enriched = threads.map(t => ({
      ...t,
      host_name: hostMap[t.host_id]?.full_name || t.host_id,
      customer_name: customerMap[t.customer_id]?.full_name || t.customer_id,
    }));

    return Response.json({ threads: enriched, total: enriched.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});