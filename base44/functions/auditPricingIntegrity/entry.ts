import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    // Fetch all active booking requests
    const activeStatuses = ['active', 'approved', 'confirmed', 'payment_due', 'grace_period', 'return_pending_host_review', 'under_review', 'pending_payment'];
    const allBookings = [];
    for (const status of activeStatuses) {
      const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ booking_status: status }, '-updated_date', 500);
      allBookings.push(...bookings);
    }

    const violations = [];
    let checked = 0;

    for (const booking of allBookings) {
      checked++;
      if (!booking.weekly_rate || !booking.start_date || !booking.end_date) continue;

      const rentalDays = Math.max(1, Math.ceil((new Date(booking.end_date + 'T12:00:00') - new Date(booking.start_date + 'T12:00:00')) / 86400000));
      const chargedAmount = booking.total_due_now || booking.first_payment_amount || 0;
      if (!chargedAmount) continue;

      const weeklyRate = booking.weekly_rate;
      const monthlyRate = booking.monthly_rate || 0;
      const issues = [];

      // Rule 1: weekly_rate used as daily rate
      if (rentalDays > 1) {
        const perDayRate = chargedAmount / rentalDays;
        if (Math.abs(perDayRate - weeklyRate) < 0.01) {
          issues.push(`CRITICAL: Weekly rate $${weeklyRate} used as daily rate for ${rentalDays} days = $${chargedAmount}`);
        }
      }

      // Rule 2: under 7 days exceeds weekly rate
      if (rentalDays < 7 && chargedAmount > weeklyRate) {
        const overcharge = Math.round((chargedAmount - weeklyRate) * 100) / 100;
        issues.push(`OVERCHARGE: $${chargedAmount} for ${rentalDays} days exceeds weekly rate $${weeklyRate} by $${overcharge}`);
      }

      // Rule 3: under 28 days exceeds monthly rate
      if (rentalDays < 28 && monthlyRate > 0 && chargedAmount > monthlyRate) {
        const overcharge = Math.round((chargedAmount - monthlyRate) * 100) / 100;
        issues.push(`OVERCHARGE: $${chargedAmount} for ${rentalDays} days exceeds monthly rate $${monthlyRate} by $${overcharge}`);
      }

      if (issues.length > 0) {
        violations.push({
          booking_id: booking.id,
          vehicle_name: booking.vehicle_name,
          user_email: booking.user_email,
          rental_days: rentalDays,
          weekly_rate: weeklyRate,
          charged_amount: chargedAmount,
          issues,
        });

        // Create operational alert for each violation
        await base44.asServiceRole.functions.invoke('createPaymentOperationalAlert', {
          alert_type: 'unknown_billing_context',
          severity: 'critical',
          billing_context: 'rental_payment',
          booking_id: booking.id,
          host_id: booking.host_id || '',
          customer_id: booking.user_id || '',
          renter_email: booking.user_email || '',
          vehicle_id: booking.vehicle_id || '',
          related_entity_type: 'BookingRequest',
          related_entity_id: booking.id,
          title: `Pricing Overcharge Detected: ${booking.vehicle_name || booking.id}`,
          message: issues.join('; '),
          recommended_action: `Review booking ${booking.id} and issue refund if customer was overcharged. Correct total_due_now to the proper prorated amount.`,
          financial_impact_amount: Math.max(0, chargedAmount - weeklyRate),
          currency: 'usd',
          source: 'auditPricingIntegrity',
        }).catch(() => {});

        // Send admin notification email
        await base44.asServiceRole.functions.invoke('sendCriticalNotification', {
          title: `Pricing Violation: ${booking.vehicle_name || booking.id}`,
          body: `Booking ${booking.id} for ${booking.user_email} has pricing issues:\n\n${issues.join('\n')}\n\nCharged: $${chargedAmount} for ${rentalDays} days\nWeekly rate: $${weeklyRate}\n\nAction required: Review and refund the overcharge.`,
          category: 'payments',
          severity: 'critical',
          action_url: `/admin/booking-360?id=${booking.id}`,
        }).catch(() => {});
      }
    }

    console.log(`[Pricing Audit] Checked ${checked} bookings, found ${violations.length} violations`);

    return Response.json({
      checked,
      violations_found: violations.length,
      violations,
    });
  } catch (error) {
    console.error('[auditPricingIntegrity] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});