import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Called by entity automation when a BookingRequest is created or updated.
// Upserts a Customer record from the booking's profile data once payment is submitted.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const booking = payload.data;

    if (!booking) return Response.json({ skipped: true, reason: "no data" });

    // Only sync when booking reaches pending_review (payment done) or beyond
    const SYNC_STATUSES = ["pending_review", "approved", "confirmed", "active", "completed"];
    if (!SYNC_STATUSES.includes(booking.booking_status)) {
      return Response.json({ skipped: true, reason: `status ${booking.booking_status} not eligible` });
    }

    if (!booking.user_email || !booking.customer_full_name) {
      return Response.json({ skipped: true, reason: "missing email or name" });
    }

    // Check if a Customer already exists for this email + company
    const filter = { email: booking.user_email };
    if (booking.company_id) filter.company_id = booking.company_id;

    const existing = await base44.asServiceRole.entities.Customer.filter(filter);

    const customerData = {
      full_name: booking.customer_full_name,
      phone: booking.customer_phone || "",
      email: booking.user_email,
      address: booking.customer_address || "",
      employer: booking.employer || "",
      status: booking.booking_status === "active" ? "Active" : booking.booking_status === "completed" ? "Completed" : "Approved",
      ...(booking.company_id && { company_id: booking.company_id }),
    };

    if (existing.length > 0) {
      // Update existing customer record
      await base44.asServiceRole.entities.Customer.update(existing[0].id, customerData);
      console.log(`[syncCustomer] Updated customer ${existing[0].id} for ${booking.user_email}`);
      return Response.json({ updated: true, customer_id: existing[0].id });
    } else {
      // Create new customer record
      const created = await base44.asServiceRole.entities.Customer.create(customerData);
      console.log(`[syncCustomer] Created customer ${created.id} for ${booking.user_email}`);
      return Response.json({ created: true, customer_id: created.id });
    }
  } catch (error) {
    console.error('[syncCustomer] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});