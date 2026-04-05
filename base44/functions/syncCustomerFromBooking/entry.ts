import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Full CRM Sync — triggered by BookingRequest create/update automation.
 * 
 * Syncs the following CRM records from a BookingRequest:
 *   1. Customer  — profile, contact info, status
 *   2. Booking   — booking record for reports/dashboard
 *   3. Payment   — payment record (first payment + recurring)
 * 
 * Uses email as the unique key for Customer, and booking_request_id stored
 * in Booking.notes as the idempotency key to avoid duplicates.
 */

const SYNC_STATUSES = ["pending_review", "approved", "confirmed", "active", "completed", "cancelled"];

function bookingStatusToCrmStatus(bookingStatus) {
  if (bookingStatus === "active") return "Active";
  if (bookingStatus === "completed") return "Completed";
  if (bookingStatus === "cancelled") return "Cancelled";
  return "Approved";
}

function bookingStatusToBookingCrmStatus(bookingStatus) {
  if (bookingStatus === "active") return "Active";
  if (bookingStatus === "completed") return "Completed";
  if (bookingStatus === "cancelled") return "Cancelled";
  return "Reserved";
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const booking = payload.data;

    if (!booking) return Response.json({ skipped: true, reason: "no data" });
    if (!SYNC_STATUSES.includes(booking.booking_status)) {
      return Response.json({ skipped: true, reason: `status '${booking.booking_status}' not eligible` });
    }
    if (!booking.user_email || !booking.customer_full_name) {
      return Response.json({ skipped: true, reason: "missing email or name" });
    }

    const companyFilter = booking.company_id ? { company_id: booking.company_id } : {};
    const result = { booking_request_id: booking.id };

    // ─── 1. UPSERT CUSTOMER ────────────────────────────────────────────────────
    const existingCustomers = await base44.asServiceRole.entities.Customer.filter({
      email: booking.user_email,
      ...companyFilter,
    });

    const customerData = {
      full_name: booking.customer_full_name,
      phone: booking.customer_phone || "",
      email: booking.user_email,
      address: booking.customer_address || "",
      employer: booking.employer || "",
      status: bookingStatusToCrmStatus(booking.booking_status),
      ...(booking.company_id && { company_id: booking.company_id }),
    };

    let customerId;
    if (existingCustomers.length > 0) {
      await base44.asServiceRole.entities.Customer.update(existingCustomers[0].id, customerData);
      customerId = existingCustomers[0].id;
      result.customer = { action: "updated", id: customerId };
      console.log(`[syncCRM] Updated Customer ${customerId}`);
    } else {
      const created = await base44.asServiceRole.entities.Customer.create(customerData);
      customerId = created.id;
      result.customer = { action: "created", id: customerId };
      console.log(`[syncCRM] Created Customer ${customerId}`);
    }

    // ─── 2. UPSERT BOOKING (CRM) ──────────────────────────────────────────────
    // Use booking_request_id stored in notes as idempotency key
    const existingBookings = await base44.asServiceRole.entities.Booking.filter({
      customer_id: customerId,
      vehicle_id: booking.vehicle_id,
    });
    // Find the one tied to this specific booking request
    const linkedBooking = existingBookings.find((b) => b.notes && b.notes.includes(booking.id));

    const bookingData = {
      customer_id: customerId,
      customer_name: booking.customer_full_name,
      vehicle_id: booking.vehicle_id,
      vehicle_name: booking.vehicle_name || "",
      booking_type: booking.booking_type,
      start_date: booking.start_date || new Date().toISOString().split("T")[0],
      end_date: booking.end_date || null,
      pickup_location: booking.city || "",
      status: bookingStatusToBookingCrmStatus(booking.booking_status),
      notes: `booking_request:${booking.id}`,
      ...(booking.company_id && { company_id: booking.company_id }),
    };

    let crmBookingId;
    if (linkedBooking) {
      await base44.asServiceRole.entities.Booking.update(linkedBooking.id, bookingData);
      crmBookingId = linkedBooking.id;
      result.booking = { action: "updated", id: crmBookingId };
      console.log(`[syncCRM] Updated Booking ${crmBookingId}`);
    } else {
      const created = await base44.asServiceRole.entities.Booking.create(bookingData);
      crmBookingId = created.id;
      result.booking = { action: "created", id: crmBookingId };
      console.log(`[syncCRM] Created Booking ${crmBookingId}`);
    }

    // ─── 3. UPSERT PAYMENT ────────────────────────────────────────────────────
    // Only create/update a payment record when the booking has been paid
    if (booking.payment_status === "paid" && booking.total_due_now > 0) {
      const existingPayments = await base44.asServiceRole.entities.Payment.filter({
        booking_id: crmBookingId,
      });
      // Find the first/initial payment tied to this booking
      const firstPayment = existingPayments.find((p) => p.payment_type === "Rental" || p.payment_type === "Deposit");

      const paymentData = {
        customer_id: customerId,
        customer_name: booking.customer_full_name,
        booking_id: crmBookingId,
        amount: booking.total_due_now,
        payment_type: "Rental",
        payment_method: "Card",
        status: "Paid",
        paid_date: booking.agreement_accepted_at
          ? booking.agreement_accepted_at.split("T")[0]
          : new Date().toISOString().split("T")[0],
        due_date: booking.start_date || new Date().toISOString().split("T")[0],
        ...(booking.company_id && { company_id: booking.company_id }),
      };

      if (firstPayment) {
        await base44.asServiceRole.entities.Payment.update(firstPayment.id, paymentData);
        result.payment = { action: "updated", id: firstPayment.id };
        console.log(`[syncCRM] Updated Payment ${firstPayment.id}`);
      } else {
        const created = await base44.asServiceRole.entities.Payment.create(paymentData);
        result.payment = { action: "created", id: created.id };
        console.log(`[syncCRM] Created Payment ${created.id}`);
      }
    } else {
      result.payment = { action: "skipped", reason: `payment_status=${booking.payment_status}` };
    }

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error('[syncCRM] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});