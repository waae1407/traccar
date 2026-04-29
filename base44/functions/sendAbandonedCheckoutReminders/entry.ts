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
  const urgency = reminderNum === 1
    ? "You're almost there!"
    : reminderNum === 2
    ? "Your vehicle is still waiting for you 🚗"
    : "Last chance — grab your ride before it's gone! ⏰";

  return {
    subject: `${urgency} Complete your uRide booking`,
    body: `
Hi ${name}!

${urgency}

You started booking the ${booking.vehicle_name || "a vehicle"} on uRide but got stuck at the **${step}** step. It only takes a few minutes to finish!

🚗 Your vehicle: ${booking.vehicle_name || "Reserved vehicle"}
💰 Weekly rate: $${booking.weekly_rate || "—"}/week
✅ $0 deposit required
⚡ Get approved within 24 hours

👉 Pick up where you left off: ${resumeUrl}

Why uRide drivers love us:
• No credit check required
• Cancel anytime — no long-term commitment
• Uber & Lyft ready vehicles
• Rent-to-Own options available

Don't let this deal slip away — vehicles go fast!

Drive with confidence,
The uRide Team 🚗

---
Questions? Reply to this email and we'll help you get on the road.
    `.trim(),
  };
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