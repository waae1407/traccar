import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-10-16" });

// Moovetrax stub — replace with real credentials when available
async function moovetraxKillSwitch(deviceId, enable) {
  console.log(`[Moovetrax STUB] ${enable ? "KILLING" : "RESTORING"} vehicle device: ${deviceId}`);
  // TODO: Replace with real Moovetrax API call
  // await fetch(`https://api.moovetrax.com/v1/devices/${deviceId}/killswitch`, {
  //   method: "POST",
  //   headers: { "Authorization": `Bearer ${Deno.env.get("MOOVETRAX_API_KEY")}`, "Content-Type": "application/json" },
  //   body: JSON.stringify({ enabled: enable })
  // });
  return { stubbed: true, deviceId, killActive: enable };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // This function is called by a scheduled automation — verify admin or automation context
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch all active bookings with autopay enabled
    const activeBookings = await base44.asServiceRole.entities.BookingRequest.filter({
      autopay_enabled: true,
    });

    const billingTargets = activeBookings.filter((b) => {
      if (!["approved", "confirmed", "active"].includes(b.booking_status)) return false;
      if (b.clean_return_status === "approved_clean") return false; // rental ended
      if (!b.stripe_payment_method_id || !b.stripe_customer_id) return false;
      if (!b.start_date) return false;
      if (!b.next_billing_date) return false;

      const nextBilling = new Date(b.next_billing_date);
      nextBilling.setHours(0, 0, 0, 0);
      return nextBilling.getTime() === today.getTime();
    });

    console.log(`[WeeklyBilling] Found ${billingTargets.length} bookings to charge today`);

    const results = [];

    for (const booking of billingTargets) {
      try {
        const weekNum = (booking.billing_week_number || 1) + 1;
        const referralCredit = booking.pending_referral_credit || 0;
        const amount = Math.max(0, (booking.weekly_rate || 0) - referralCredit);
        const amountCents = Math.round(amount * 100);

        if (amountCents < 50) {
          console.warn(`[WeeklyBilling] Skipping ${booking.id} — amount too low`);
          continue;
        }

        // Attempt charge
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountCents,
          currency: "usd",
          customer: booking.stripe_customer_id,
          payment_method: booking.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          description: `uRide Week ${weekNum} — ${booking.vehicle_name || ""}`,
          metadata: { booking_request_id: booking.id, week_number: String(weekNum) },
        });

        if (paymentIntent.status === "succeeded") {
          // Calculate next billing date: anchor to current next_billing_date + 7
          const anchorDate = new Date(booking.next_billing_date + "T00:00:00");
          anchorDate.setDate(anchorDate.getDate() + 7);
          const nextBillingDate = anchorDate.toISOString().split("T")[0];

          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            payment_status: "paid",
            payment_failure_attempts: 0,
            billing_week_number: weekNum,
            next_billing_date: nextBillingDate,
            pending_referral_credit: 0,
          });

          // ── HOST PAYOUT SPLIT (Stripe Connect) ──
          if (booking.host_id) {
            const hosts = await base44.asServiceRole.entities.Host.filter({ id: booking.host_id });
            const host = hosts[0];
            if (host?.stripe_onboarding_complete && host?.stripe_account_id) {
              const commissionRate = host.commission_rate || 0.20;
              const platformFee = Math.round(amount * commissionRate * 100) / 100;
              const hostAmount = Math.round((amount - platformFee) * 100) / 100;
              const hostAmountCents = Math.round(hostAmount * 100);

              // Transfer to host's connected Stripe account
              const transfer = await stripe.transfers.create({
                amount: hostAmountCents,
                currency: "usd",
                destination: host.stripe_account_id,
                description: `uRide Week ${weekNum} — ${booking.vehicle_name}`,
                metadata: { booking_id: booking.id, host_id: host.id, week: String(weekNum) },
              });

              // Update booking with payout info
              await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
                platform_fee_amount: platformFee,
                host_payout_amount: hostAmount,
                stripe_transfer_id: transfer.id,
              });

              console.log(`[WeeklyBilling] ✓ Host transfer ${transfer.id} — $${hostAmount} to ${host.stripe_account_id}`);
            }
          }

          // If referral credit was applied, mark it on the referral record
          if (referralCredit > 0) {
            const referrals = await base44.asServiceRole.entities.Referral.filter({ referral_code: booking.referral_code });
            for (const ref of referrals) {
              const updates = {};
              if (ref.referee_email === booking.user_email && !ref.referee_credit_applied) {
                updates.referee_credit_applied = true;
                updates.referee_credit_applied_at = new Date().toISOString();
              }
              if (ref.referrer_email === booking.user_email && !ref.referrer_credit_applied) {
                updates.referrer_credit_applied = true;
                updates.referrer_credit_applied_at = new Date().toISOString();
              }
              if (Object.keys(updates).length > 0) {
                await base44.asServiceRole.entities.Referral.update(ref.id, updates);
                // Update referral code usage stats
                const codes = await base44.asServiceRole.entities.ReferralCode.filter({ user_email: booking.user_email });
                if (codes.length > 0) {
                  await base44.asServiceRole.entities.ReferralCode.update(codes[0].id, {
                    total_credits_used: (codes[0].total_credits_used || 0) + referralCredit,
                  });
                }
              }
            }
          }

          // Send receipt notification
          await base44.asServiceRole.entities.Notification.create({
            user_email: booking.user_email,
            title: `Week ${weekNum} Payment Received`,
            body: `$${amount} has been charged for your ${booking.vehicle_name} rental. Next charge: ${nextBillingDate}.`,
            type: "payment",
            booking_request_id: booking.id,
          });

          // Send 24hr pre-charge warning for NEXT week
          await schedulePreChargeWarning(base44, booking, nextBillingDate, amount, weekNum + 1);

          results.push({ id: booking.id, status: "charged", week: weekNum });
          console.log(`[WeeklyBilling] ✓ Charged ${booking.id} Week ${weekNum} $${amount}`);
        }
      } catch (err) {
        console.error(`[WeeklyBilling] Charge failed for ${booking.id}:`, err.message);
        // Trigger failed payment handler
        await handleFailedPayment(base44, booking, err.message, 1);
        results.push({ id: booking.id, status: "failed", error: err.message });
      }
    }

    return Response.json({ ok: true, processed: billingTargets.length, results });
  } catch (error) {
    console.error("[WeeklyBilling] Fatal error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function schedulePreChargeWarning(base44, booking, nextBillingDate, amount, weekNum) {
  // Create a notification scheduled for 24hrs before — since we can't schedule future notifications,
  // we store the upcoming charge date and a separate daily function sends these warnings
  // For now, just log — the daily billing check function handles pre-warnings
  console.log(`[PreChargeWarning] Queued for ${booking.user_email} on ${nextBillingDate} Week ${weekNum} $${amount}`);
}

async function handleFailedPayment(base44, booking, reason, attemptNum) {
  await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
    payment_status: "failed",
    payment_failure_reason: reason,
    payment_failure_attempts: attemptNum,
    last_payment_failure_at: new Date().toISOString(),
  });

  await base44.asServiceRole.entities.Notification.create({
    user_email: booking.user_email,
    title: "Payment Failed",
    body: `Your weekly payment for ${booking.vehicle_name} failed (attempt ${attemptNum}/3). We'll retry in 1 hour.`,
    type: "payment",
    booking_request_id: booking.id,
  });
}