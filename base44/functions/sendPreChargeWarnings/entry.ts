import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // Find bookings billing tomorrow
    const activeBookings = await base44.asServiceRole.entities.BookingRequest.filter({
      autopay_enabled: true,
    });

    const warningTargets = activeBookings.filter((b) => {
      if (!["approved", "confirmed", "active"].includes(b.booking_status)) return false;
      if (b.clean_return_status === "approved_clean") return false;
      return b.next_billing_date === tomorrowStr;
    });

    console.log(`[PreChargeWarnings] Sending ${warningTargets.length} 24hr warnings`);

    for (const booking of warningTargets) {
      const weekNum = (booking.billing_week_number || 1) + 1;
      const amount = booking.weekly_rate || 0;

      await base44.asServiceRole.entities.Notification.create({
        user_email: booking.user_email,
        title: `📅 Upcoming Charge Tomorrow — $${amount}`,
        body: `Your Week ${weekNum} rental payment of $${amount} for ${booking.vehicle_name} will be charged tomorrow. Make sure your card is up to date.`,
        type: "payment",
        booking_request_id: booking.id,
      });

      // Also send email
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: booking.user_email,
        subject: `Upcoming charge tomorrow: $${amount} — ${booking.vehicle_name}`,
        body: `
          <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #1a1a2e;">Upcoming Rental Payment</h2>
            <p>Hi ${booking.customer_full_name || "there"},</p>
            <p>This is a reminder that your <strong>Week ${weekNum}</strong> rental payment of <strong>$${amount}</strong> for your <strong>${booking.vehicle_name}</strong> will be automatically charged tomorrow.</p>
            <p>If you need to update your payment method or have any questions, please contact us immediately.</p>
            <p style="color: #666; font-size: 12px; margin-top: 24px;">
              To end your rental, complete the drop-off photo inspection in the uRide app. Billing stops automatically once your photos are reviewed and approved.
            </p>
          </div>
        `,
      });
    }

    return Response.json({ ok: true, warnings_sent: warningTargets.length });
  } catch (error) {
    console.error("[PreChargeWarnings] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});