import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ACTIVE_STATUSES = new Set(['open', 'awaiting_host', 'awaiting_customer', 'awaiting_admin']);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const {
      search = '', thread_type = '', status = '', priority = '', host_id = '', customer_id = '',
      vehicle_id = '', booking_request_id = '', dispute_id = '', escalation = false,
      unresolved = false, unread = false, attachments = false, limit = 100
    } = payload;

    const isAdmin = user.role === 'admin';
    const hostsForUser = await base44.entities.Host.filter({ email: user.email }, '-created_date', 1);
    const currentHost = hostsForUser[0] || null;

    const query = { archived: false };
    if (thread_type) query.thread_type = thread_type;
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (vehicle_id) query.vehicle_id = vehicle_id;
    if (booking_request_id) query.booking_request_id = booking_request_id;
    if (dispute_id) query.dispute_id = dispute_id;
    if (escalation) query.escalation_flag = true;

    if (isAdmin) {
      if (host_id) query.host_id = host_id;
      if (customer_id) query.customer_id = customer_id;
    } else if (currentHost) {
      query.host_id = currentHost.id;
    } else {
      query.customer_id = user.email;
    }

    let threads = await base44.entities.CommunicationThread.filter(query, '-last_message_at', Math.min(Number(limit) || 100, 300));

    if (unresolved) threads = threads.filter(t => ACTIVE_STATUSES.has(t.status));
    if (attachments) threads = threads.filter(t => (t.attachment_count || 0) > 0);
    if (unread) {
      const unreadField = isAdmin ? 'unread_count_admin' : currentHost ? 'unread_count_host' : 'unread_count_customer';
      threads = threads.filter(t => (t[unreadField] || 0) > 0);
    }

    if (search) {
      const q = search.toLowerCase();
      const checked = await Promise.all(threads.map(async (thread) => {
        if ((thread.subject || '').toLowerCase().includes(q)) return thread;
        if ((thread.booking_request_id || '').toLowerCase().includes(q)) return thread;
        if ((thread.vehicle_id || '').toLowerCase().includes(q)) return thread;
        if ((thread.dispute_id || '').toLowerCase().includes(q)) return thread;
        const messages = await base44.entities.CommunicationMessage.filter({ thread_id: thread.id }, '-created_date', 50);
        return messages.some(m => (m.body || '').toLowerCase().includes(q)) ? thread : null;
      }));
      threads = checked.filter(Boolean);
    }

    const objectIdPattern = /^[a-f\d]{24}$/i;
    const hostIds = [...new Set(threads.map(t => t.host_id).filter(id => id && objectIdPattern.test(id)))];
    const customerEmails = [...new Set(threads.map(t => t.customer_id).filter(Boolean))];
    const vehicleIds = [...new Set(threads.map(t => t.vehicle_id).filter(id => id && objectIdPattern.test(id)))];

    const hosts = hostIds.length ? await base44.entities.Host.filter({ id: hostIds }, '', hostIds.length) : [];
    const customers = customerEmails.length ? await base44.entities.Customer.filter({ email: customerEmails }, '', customerEmails.length) : [];
    const vehicles = vehicleIds.length ? await base44.entities.Vehicle.filter({ id: vehicleIds }, '', vehicleIds.length) : [];

    const hostMap = Object.fromEntries(hosts.map(h => [h.id, h]));
    const customerMap = Object.fromEntries(customers.map(c => [c.email, c]));
    const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, v]));

    const enriched = threads.map(t => {
      const vehicle = vehicleMap[t.vehicle_id];
      return {
        ...t,
        host_name: hostMap[t.host_id]?.business_name || hostMap[t.host_id]?.full_name || t.host_id,
        customer_name: customerMap[t.customer_id]?.full_name || t.customer_id,
        vehicle_label: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : t.vehicle_id,
        vehicle_vin: vehicle?.vin,
        my_unread_count: isAdmin ? (t.unread_count_admin || 0) : currentHost ? (t.unread_count_host || 0) : (t.unread_count_customer || 0),
      };
    });

    return Response.json({ threads: enriched, total: enriched.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});