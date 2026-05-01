// Scheduled daily — sends friendly reminders to users with incomplete bookings
// Targets: draft, pending_verification, pending_contract, pending_payment
// Stops automatically once booking moves to pending_review or beyond

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE = Deno.env.get("TWILIO_PHONE_NUMBER");
const APP_URL = "https://uridehub.com";

const ABANDONED_STATUSES = ["draft", "pending_verification", "pending_contract", "pending_payment"];

// How long ago the booking must have been last updated to qualify (hours)
const MIN_HOURS_STALE = 6;
const MAX_REMINDERS = 3; // Stop after 3 nudges

async function sendSMS(to, body) {
  if (!to || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE) return null;
  const cleaned = to.replace(/\D/g, "");
  const e164 = cleaned.startsWith("1") ? `+${cleaned}` : `+1${cleaned}`;
  if (e164.length < 11) return null;

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: e164, From: TWILIO_PHONE, Body: body }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "SMS failed");
  return data.sid;
}

function stepLabel(status) {
  const map = {
    draft: "vehicle selection",
    pending_verification: "ID verification",
    pending_contract: "contract signing",
    pending_payment: "payment",
  };
  return map[status] || "checkout";
}

function buildEmail(booking, reminderNum) {
  const name = booking.customer_full_name?.split(" ")[0] || "there";
  const resumeUrl = `${APP_URL}/checkout?request=${booking.id}`;
  const step = stepLabel(booking.booking_status);

  const subjects = [
    `You're almost there, ${name} — complete your uRide booking`,
    `Your vehicle is still waiting, ${name}`,
    `Last chance — your uRide booking expires soon`,
  ];
  const subject = subjects[reminderNum - 1] || subjects[0];

  const headlines = [
    "You're almost there!",
    "Your vehicle is still available",
    "This is your final reminder",
  ];
  const headline = headlines[reminderNum - 1] || headlines[0];

  const intros = [
    `You started booking the <strong>${booking.vehicle_name || "a vehicle"}</strong> but didn't finish the <strong>${step}</strong> step. It only takes a few minutes to complete.`,
    `Your <strong>${booking.vehicle_name || "vehicle"}</strong> is still reserved for you, but availability isn't guaranteed. Finish your booking now to lock it in.`,
    `We've held your spot for as long as we can. Complete your booking today or it may be released to another driver.`,
  ];
  const intro = intros[reminderNum - 1] || intros[0];

  const body = `
<div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #e91e8c, #7c3aed); padding: 28px 32px; border-radius: 16px 16px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">${headline}</h1>
    <p style="color: rgba(255,255,255,0.8); margin: 6px 0 0; font-size: 14px;">uRide · Complete Your Booking</p>
  </div>

  <!-- Body -->
  <div style="background: #fafafa; padding: 28px 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
    <p style="margin: 0 0 20px; font-size: 15px; color: #374151; line-height: 1.6;">Hi ${name},</p>
    <p style="margin: 0 0 24px; font-size: 15px; color: #374151; line-height: 1.6;">${intro}</p>

    <!-- Vehicle Card -->
    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <p style="margin: 0 0 12px; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Your Reserved Vehicle</p>
      <p style="margin: 0 0 16px; font-size: 18px; font-weight: 700; color: #111;">${booking.vehicle_name || "Reserved Vehicle"}</p>
      <table style="width: 100%; border-collapse: collapse;">
        ${booking.weekly_rate ? `<tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Weekly Rate</td><td style="padding: 6px 0; font-weight: 700; text-align: right; color: #111; font-size: 14px;">$${booking.weekly_rate}/week</td></tr>` : ""}
        <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Security Deposit</td><td style="padding: 6px 0; font-weight: 700; text-align: right; color: #16a34a; font-size: 14px;">$0 Required</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Credit Check</td><td style="padding: 6px 0; font-weight: 700; text-align: right; color: #16a34a; font-size: 14px;">Not Required</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Approval Time</td><td style="padding: 6px 0; font-weight: 700; text-align: right; color: #111; font-size: 14px;">Within 24 Hours</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Pending Step</td><td style="padding: 6px 0; font-weight: 700; text-align: right; color: #d97706; font-size: 14px; text-transform: capitalize;">${step}</td></tr>
      </table>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin-bottom: 24px;">
      <a href="${resumeUrl}"
        style="display: inline-block; background: linear-gradient(135deg, #e91e8c, #7c3aed); color: white; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none;">
        Continue My Booking →
      </a>
    </div>

    <!-- Why uRide -->
    <div style="background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 10px; padding: 16px; margin-bottom: 20px;">
      <p style="margin: 0 0 10px; font-size: 13px; font-weight: 700; color: #5b21b6;">Why drivers choose uRide</p>
      <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #374151; line-height: 1.8;">
        <li>No credit check required</li>
        <li>Cancel anytime — no long-term commitment</li>
        <li>Uber &amp; Lyft ready vehicles</li>
        <li>Rent-to-Own options available</li>
      </ul>
    </div>

    <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.6;">Questions? Just reply to this email and we'll help you get on the road.</p>
    <p style="margin: 16px 0 0; font-size: 13px; color: #374151; font-weight: 600;">— The uRide Team</p>
  </div>
</div>`;

  return { subject, body };
}

function buildSMS(booking, reminderNum) {
  const name = booking.customer_full_name?.split(" ")[0] || "there";
  const resumeUrl = `${APP_URL}/checkout?request=${booking.id}`;
  const step = stepLabel(booking.booking_status);

  if (reminderNum === 1) {
    return `Hey ${name}! 👋 You left your uRide booking at the ${step} step. Finish in 2 mins → ${resumeUrl}`;
  } else if (reminderNum === 2) {
    return `${name}, your ${booking.vehicle_name || "vehicle"} is still available! $0 deposit, approved in 24hrs. Complete your booking: ${resumeUrl}`;
  } else {
    return `⏰ Last reminder, ${name}! Your uRide booking is almost done. Lock in your rate before it's gone: ${resumeUrl}`;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();

    // Fetch all abandoned bookings
    const allBookings = await base44.asServiceRole.entities.BookingRequest.list("-updated_date", 500);

    const abandoned = allBookings.filter((b) => {
      if (!ABANDONED_STATUSES.includes(b.booking_status)) return false;
      if (!b.user_email) return false;
      if (b.abandoned_checkout) return false; // already marked done

      const lastUpdate = new Date(b.updated_date || b.created_date);
      const hoursAgo = (now - lastUpdate) / (1000 * 60 * 60);
      if (hoursAgo < MIN_HOURS_STALE) return false; // Too fresh

      const remindersSent = b.abandoned_reminder_count || 0;
      if (remindersSent >= MAX_REMINDERS) return false; // Max reached

      return true;
    });

    console.log(`[AbandonedCheckout] Found ${abandoned.length} abandoned bookings to nudge`);

    const results = [];

    for (const booking of abandoned) {
      const reminderNum = (booking.abandoned_reminder_count || 0) + 1;
      const { subject, body } = buildEmail(booking, reminderNum);
      const smsText = buildSMS(booking, reminderNum);

      let emailSent = false;
      let smsSent = false;

      // Send email
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: booking.user_email,
          subject,
          body,
          from_name: "uRide",
        });
        emailSent = true;
      } catch (e) {
        console.error(`[AbandonedCheckout] Email failed for ${booking.user_email}:`, e.message);
      }

      // Send SMS if phone available
      if (booking.customer_phone) {
        try {
          await sendSMS(booking.customer_phone, smsText);
          smsSent = true;
        } catch (e) {
          console.error(`[AbandonedCheckout] SMS failed for ${booking.user_email}:`, e.message);
        }
      }

      // Update booking with reminder count + timestamp
      await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
        abandoned_reminder_count: reminderNum,
        last_abandoned_reminder_at: now.toISOString(),
        // Mark as abandoned_checkout=true after 3 reminders so we stop nudging
        ...(reminderNum >= MAX_REMINDERS ? { abandoned_checkout: true } : {}),
      });

      results.push({
        booking_id: booking.id,
        user_email: booking.user_email,
        status: booking.booking_status,
        reminderNum,
        emailSent,
        smsSent,
      });

      console.log(`[AbandonedCheckout] Nudge #${reminderNum} sent to ${booking.user_email} (${booking.booking_status})`);
    }

    return Response.json({ ok: true, processed: results.length, results });
  } catch (error) {
    console.error("[AbandonedCheckout] Fatal error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});