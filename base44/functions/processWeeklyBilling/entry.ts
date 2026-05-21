import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-10-16" });

async function logEvent(base44, data) {
  try {
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: data.event_type,
      actor_id: data.actor_id || 'system',
      actor_email: data.actor_email || 'system',
      actor_role: data.actor_role || 'automation',
      target_entity: data.target_entity || '',
      target_id: data.target_id || '',
      host_id: data.host_id || '',
      booking_id: data.booking_id || '',
      vehicle_id: data.vehicle_id || '',
      customer_id: data.customer_id || '',
      summary: data.summary || '',
      metadata: data.metadata || {},
      source: data.source || 'automation',
      user_email: data.customer_id || 'system',
      event_title: data.summary || data.event_type,
      event_status: data.event_status || 'success',
      ...(data.dedupe_key ? { dedupe_key: data.dedupe_key } : {}),
    });
  } catch (e) {
    console.error('[AuditLog]', e.message);
  }
}

// MooveTrax kill switch — real API call
async function moovetraxKillSwitch(deviceId, enable) {
  const partnerApiKey = Deno.env.get("MOOVETRAX_PARTNER_API_KEY") || "";
  const command = enable ? "kill" : "unkill";
  const params = new URLSearchParams({ key: deviceId, ...(partnerApiKey && { partner_api_key: partnerApiKey }) });
  const url = `https://www.moovetrax.com/api/${command}?${params.toString()}`;
  console.log(`[MooveTrax] ${command.toUpperCase()} device: ${deviceId}`);
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  console.log(`[MooveTrax] Response: ${text}`);
  return { ok: res.ok, response: text };
}

// Send SMS via Twilio
async function sendSMS(to, message) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!accountSid || !authToken || !from || !to) return;
  const body = new URLSearchParams({ To: to, From: from, Body: message });
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
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

    // ── STATUS GUARD ──────────────────────────────────────────────────────────
    // WHITELIST: only process active/confirmed/approved bookings.
    // payment_due, grace_period, suspended are INTENTIONALLY excluded — those states
    // are owned by processGracePeriod. Charging them here would:
    //   • reset grace_period_started_at and lose retry context
    //   • cause duplicate Stripe charges during the grace window
    //   • send duplicate failure notifications to customers
    // This guard must never be relaxed without updating processGracePeriod coordination.
    const billingTargets = activeBookings.filter((b) => {
      if (!['approved', 'confirmed', 'active'].includes(b.booking_status)) return false;
      if (b.clean_return_status === 'approved_clean') return false; // rental ended
      if (!b.stripe_payment_method_id || !b.stripe_customer_id) return false;
      if (!b.start_date) return false;
      if (!b.next_billing_date) return false;

      const nextBilling = new Date(b.next_billing_date);
      nextBilling.setHours(0, 0, 0, 0);
      return nextBilling.getTime() === today.getTime();
    });

    // ── DEFERRED BILLING LOG ──────────────────────────────────────────────────
    // Find bookings in grace-period states whose next_billing_date is today.
    // They were skipped by the status guard above. Log once per day for ops visibility.
    const deferredTargets = activeBookings.filter((b) => {
      if (!['payment_due', 'grace_period'].includes(b.booking_status)) return false;
      if (!b.next_billing_date) return false;
      const nextBilling = new Date(b.next_billing_date);
      nextBilling.setHours(0, 0, 0, 0);
      return nextBilling.getTime() === today.getTime();
    });

    if (deferredTargets.length > 0) {
      const todayStr = today.toISOString().split('T')[0];
      // Fetch recent events once — avoids per-booking query in the loop
      const recentEvents = await base44.asServiceRole.entities.ActivityEvent.list('-created_date', 50);
      for (const deferred of deferredTargets) {
        const dedupeKey = `payment.retry_deferred_${deferred.id}_${todayStr}`;
        const alreadyLogged = recentEvents.some(e =>
          e.dedupe_key === dedupeKey &&
          (Date.now() - new Date(e.created_date).getTime()) < 25 * 60 * 60 * 1000
        );
        if (!alreadyLogged) {
          await logEvent(base44, {
            event_type: 'payment.retry_deferred',
            target_id: deferred.id,
            host_id: deferred.host_id || '',
            booking_id: deferred.id,
            vehicle_id: deferred.vehicle_id || '',
            customer_id: deferred.user_email || '',
            summary: `Weekly billing deferred — ${deferred.vehicle_name} is in "${deferred.booking_status}" state, managed by processGracePeriod`,
            metadata: {
              booking_status: deferred.booking_status,
              payment_failure_attempts: deferred.payment_failure_attempts,
              grace_period_ends_at: deferred.grace_period_ends_at,
              next_billing_date: deferred.next_billing_date,
              managed_by: 'processGracePeriod',
            },
            event_status: 'warning',
            dedupe_key: dedupeKey,
          });
        }
        console.log(`[WeeklyBilling] DEFERRED ${deferred.id} (${deferred.booking_status}) — skipped, owned by processGracePeriod`);
      }
    }

    console.log(`[WeeklyBilling] Found ${billingTargets.length} to charge today, ${deferredTargets.length} deferred (grace period)`);

    const results = [];

    for (const booking of billingTargets) {
      try {
        const weekNum = (booking.billing_week_number || 1) + 1;
        const referralCredit = booking.pending_referral_credit || 0;
        const baseAmount = Math.max(0, (booking.weekly_rate || 0) - referralCredit);

        // Gross up to cover Stripe fee (2.9% + $0.30) so host receives full weekly_rate
        // Formula: grossed = (base + 0.30) / (1 - 0.029)
        const grossedAmount = Math.round(((baseAmount + 0.30) / (1 - 0.029)) * 100) / 100;
        const stripeFee = Math.round((grossedAmount - baseAmount) * 100) / 100;
        const amount = grossedAmount;
        const amountCents = Math.round(amount * 100);

        console.log(`[WeeklyBilling] ${booking.id} base=$${baseAmount} stripeFee=$${stripeFee} total=$${amount}`);

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
            stripe_fee_amount: stripeFee,
            last_charged_gross: amount,
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

          // ── PAYMENT LOG ──
          await base44.asServiceRole.entities.PaymentLog.create({
            booking_request_id: booking.id,
            host_id: booking.host_id || "",
            customer_email: booking.user_email,
            customer_name: booking.customer_full_name || "",
            vehicle_id: booking.vehicle_id,
            vehicle_name: booking.vehicle_name || "",
            week_number: weekNum,
            amount: amount,
            payment_method: "stripe",
            stripe_payment_intent_id: paymentIntent.id,
            receipt_url: paymentIntent.charges?.data?.[0]?.receipt_url || "",
            status: "paid",
            recorded_by: "autopay",
            paid_at: new Date().toISOString(),
          });

          // Send receipt notification
          await base44.asServiceRole.entities.Notification.create({
            user_email: booking.user_email,
            title: `Week ${weekNum} Payment Received`,
            body: `$${amount.toFixed(2)} has been charged for your ${booking.vehicle_name} rental (includes $${stripeFee.toFixed(2)} processing fee). Next charge: ${nextBillingDate}.`,
            type: "payment",
            booking_request_id: booking.id,
          });

          // Send 24hr pre-charge warning for NEXT week
          await schedulePreChargeWarning(base44, booking, nextBillingDate, amount, weekNum + 1);

          results.push({ id: booking.id, status: "charged", week: weekNum });
          console.log(`[WeeklyBilling] ✓ Charged ${booking.id} Week ${weekNum} $${amount}`);
          await logEvent(base44, {
            event_type: 'payment.succeeded',
            actor_id: 'autopay',
            actor_email: 'autopay@uridehub.com',
            actor_role: 'automation',
            target_entity: 'BookingRequest',
            target_id: booking.id,
            host_id: booking.host_id || '',
            booking_id: booking.id,
            vehicle_id: booking.vehicle_id || '',
            customer_id: booking.user_email || '',
            summary: `Autopay week ${weekNum} — $${amount} charged for ${booking.vehicle_name || booking.id}`,
            metadata: { week_number: weekNum, amount, payment_intent_id: paymentIntent.id },
            source: 'automation',
          });
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
  // Phase 2A: No immediate GPS kill on first failure.
  // Grace period system (processGracePeriod) handles retries and suspension.
  //
  // This function is only reached for bookings that were active/confirmed/approved
  // (guaranteed by billingTargets status guard above). Defensive preservation guards
  // below protect against future code changes that might bypass the status filter.
  const now = new Date();
  const gracePeriodHours = parseInt(Deno.env.get("GRACE_PERIOD_HOURS") || "72");

  // ── GRACE PERIOD PRESERVATION GUARDS ──────────────────────────────────────
  // Never overwrite grace_period_started_at if already set — doing so would lose
  // the original failure timestamp and corrupt the 72h countdown in processGracePeriod.
  const graceStartedAt = booking.grace_period_started_at || now.toISOString();

  // Never reset grace_period_ends_at if still in the future — preserve the existing window.
  const existingGraceEnd = booking.grace_period_ends_at ? new Date(booking.grace_period_ends_at) : null;
  const graceEndsAt = (existingGraceEnd && existingGraceEnd > now)
    ? existingGraceEnd
    : new Date(now.getTime() + gracePeriodHours * 60 * 60 * 1000);

  await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
    payment_status: "failed",
    payment_failure_reason: reason,
    payment_failure_attempts: attemptNum,
    last_payment_failure_at: now.toISOString(),
    last_retry_at: now.toISOString(),
    booking_status: "payment_due",
    grace_period_started_at: graceStartedAt,
    grace_period_ends_at: graceEndsAt.toISOString(),
    // moovetrax_kill_active remains false — GPS kill only on suspension after grace period
  });

  // In-app notification — grace period language
  await base44.asServiceRole.entities.Notification.create({
    user_email: booking.user_email,
    title: "⚠️ Payment Failed — Action Required",
    body: `Your weekly payment for ${booking.vehicle_name} failed. You have ${gracePeriodHours} hours to resolve this before your rental is suspended. Please update your payment method. We will retry automatically.`,
    type: "payment",
    booking_request_id: booking.id,
  });

  // SMS
  if (booking.customer_phone) {
    await sendSMS(booking.customer_phone,
      `⚠️ uRide: Payment failed for ${booking.vehicle_name}. You have ${gracePeriodHours}h to resolve before suspension. Open the app to update your payment method.`
    );
  }

  // Email
  await base44.asServiceRole.integrations.Core.SendEmail({
    to: booking.user_email,
    subject: `⚠️ Payment Failed — ${gracePeriodHours} Hours to Resolve`,
    body: `Hi ${booking.customer_full_name || ""},\n\nYour weekly payment of $${booking.weekly_rate || ""} for ${booking.vehicle_name} failed.\n\n📌 What happens next:\n• We will retry your payment automatically every 24 hours\n• You have ${gracePeriodHours} hours to resolve this\n• Your vehicle remains active during the grace period\n• If unresolved after ${gracePeriodHours} hours, your rental will be suspended\n\n✅ To resolve now: open the app and update your payment method.\n\nThe uRide Team`,
  });

  await logEvent(base44, {
    event_type: 'payment.failed',
    actor_id: 'autopay',
    actor_email: 'autopay@uridehub.com',
    actor_role: 'automation',
    target_entity: 'BookingRequest',
    target_id: booking.id,
    host_id: booking.host_id || '',
    booking_id: booking.id,
    vehicle_id: booking.vehicle_id || '',
    customer_id: booking.user_email || '',
    summary: `Payment FAILED — grace period started (${gracePeriodHours}h window) for ${booking.vehicle_name || booking.id}`,
    metadata: { reason, attempt_num: attemptNum, grace_ends_at: graceEndsAt.toISOString(), vehicle_name: booking.vehicle_name },
    source: 'automation',
    event_status: 'error',
  });
}