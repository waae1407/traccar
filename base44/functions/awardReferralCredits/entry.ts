// Triggered by entity automation when BookingRequest status changes to "active"
// Awards $25 credit to both referrer and referee
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const booking = payload?.data;
    if (!booking?.id) return Response.json({ ok: true, skipped: "no booking data" });
    if (booking.booking_status !== "active") return Response.json({ ok: true, skipped: "not active" });
    if (!booking.referral_code) return Response.json({ ok: true, skipped: "no referral code" });

    // Find the referral record
    const referrals = await base44.asServiceRole.entities.Referral.filter({ referral_code: booking.referral_code, referee_email: booking.user_email });
    if (referrals.length === 0) return Response.json({ ok: true, skipped: "referral record not found" });

    const referral = referrals[0];
    if (referral.status === "credited" || referral.status === "voided") {
      return Response.json({ ok: true, skipped: "already processed" });
    }

    const now = new Date().toISOString();

    // 1. Give referee $25 off their current (this) booking
    await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
      pending_referral_credit: 25,
    });

    // 2. Give referrer $25 credit on their active booking (if any)
    const referrerBookings = await base44.asServiceRole.entities.BookingRequest.filter({ user_email: referral.referrer_email });
    const activeReferrerBooking = referrerBookings.find(b => ["approved", "confirmed", "active"].includes(b.booking_status));
    if (activeReferrerBooking) {
      const existingCredit = activeReferrerBooking.pending_referral_credit || 0;
      await base44.asServiceRole.entities.BookingRequest.update(activeReferrerBooking.id, {
        pending_referral_credit: existingCredit + 25,
      });
    } else {
      // Store credit on referral code for next booking
      const codes = await base44.asServiceRole.entities.ReferralCode.filter({ user_email: referral.referrer_email });
      if (codes.length > 0) {
        await base44.asServiceRole.entities.ReferralCode.update(codes[0].id, {
          total_credits_earned: (codes[0].total_credits_earned || 0) + 25,
        });
      }
    }

    // 3. Update referral record
    await base44.asServiceRole.entities.Referral.update(referral.id, {
      status: "credited",
      booking_request_id: booking.id,
      referee_credit_applied: false, // will be set true by billing function
      referrer_credit_applied: !!activeReferrerBooking,
      referee_credit_applied_at: null,
      referrer_credit_applied_at: activeReferrerBooking ? now : null,
    });

    // 4. Update referrer's code stats
    const codes = await base44.asServiceRole.entities.ReferralCode.filter({ code: booking.referral_code });
    if (codes.length > 0) {
      await base44.asServiceRole.entities.ReferralCode.update(codes[0].id, {
        total_credits_earned: (codes[0].total_credits_earned || 0) + 25,
      });
    }

    // 5. Notify both parties
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: referral.referrer_email,
      subject: "🎉 You earned $25 — Your referral just booked!",
      body: `Hi ${referral.referrer_name || "there"}!\n\nGreat news — ${referral.referee_name || "your friend"} just activated their uRide rental using your referral link!\n\nYour $25 "Rent for Free" credit has been applied and will automatically reduce your next weekly payment.\n\nKeep sharing your link to stack more credits. Drive for free!\n\nThe uRide Team 🚗`,
      from_name: "uRide",
    }).catch(() => {});

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: booking.user_email,
      subject: "🎁 Your $25 referral discount is active!",
      body: `Hi ${booking.customer_full_name?.split(" ")[0] || "there"}!\n\nYour $25 referral discount has been applied and will automatically reduce your next weekly payment.\n\nWelcome to the uRide family — and don't forget, you can now earn credits too by sharing your own referral link!\n\nThe uRide Team 🚗`,
      from_name: "uRide",
    }).catch(() => {});

    console.log(`[ReferralCredits] Awarded credits for booking ${booking.id}, referral ${referral.id}`);
    return Response.json({ ok: true, credited: true, referral_id: referral.id });
  } catch (error) {
    console.error("[ReferralCredits] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});