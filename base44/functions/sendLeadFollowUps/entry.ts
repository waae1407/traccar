// Scheduled weekly — sends email + SMS to leads who haven't booked yet
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE = Deno.env.get("TWILIO_PHONE_NUMBER");
const APP_URL = "https://uridehub.com";

async function sendSMS(to, body) {
  if (!to || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE) return null;
  // Normalize phone number
  const cleaned = to.replace(/\D/g, "");
  const e164 = cleaned.startsWith("1") ? `+${cleaned}` : `+1${cleaned}`;
  if (e164.length < 11) return null;

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: e164, From: TWILIO_PHONE, Body: body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "SMS failed");
  return data.sid;
}

function buildEmail(name, weekNum, unsubToken, email) {
  const firstName = name?.split(" ")[0] || "there";
  const unsubUrl = `${APP_URL}/api/unsubscribeLead?email=${encodeURIComponent(email)}&token=${unsubToken}`;
  return {
    subject: weekNum === 1
      ? `👋 Hey ${firstName}, your perfect ride is waiting!`
      : `🚗 Still looking for a car, ${firstName}?`,
    body: `
Hi ${firstName}!

We noticed you created an account on uRide but haven't booked your vehicle yet — and we'd love to help you get on the road! 🚀

Here's why uRide drivers love us:
✅ $0 deposit required — no money upfront
✅ Weekly flexible payments — cancel anytime
✅ Approved in as little as 24 hours
✅ Rent-to-Own option available — drive toward ownership

Whether you're driving for Uber, Lyft, or just need reliable daily transportation, we've got a vehicle for you.

👉 Browse Available Vehicles: ${APP_URL}/book-now

Questions? Reply to this email or text us — we're here to help.

Drive with confidence,
The uRide Team 🚗

---
You're receiving this because you signed up at uRide.
To stop receiving these messages: ${unsubUrl}
    `.trim(),
  };
}

function buildSMS(name, weekNum, unsubToken, email) {
  const firstName = name?.split(" ")[0] || "there";
  const unsubUrl = `${APP_URL}/api/unsubscribeLead?email=${encodeURIComponent(email)}&token=${unsubToken}`;
  return weekNum === 1
    ? `Hey ${firstName}! 👋 You signed up for uRide but haven't booked yet. $0 deposit, approved in 24hrs. Browse rides: ${APP_URL}/book-now\nReply STOP or visit ${unsubUrl} to unsubscribe.`
    : `Hi ${firstName}! 🚗 Your uRide account is ready — flexible weekly rentals with $0 deposit. Get started: ${APP_URL}/book-now\nReply STOP or visit ${unsubUrl} to unsubscribe.`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all subscribed leads
    const leads = await base44.asServiceRole.entities.LeadFollowUp.filter({ subscribed: true });
    console.log(`[LeadFollowUp] ${leads.length} subscribed leads`);

    // Get all booking requests to check who has booked
    const allBookings = await base44.asServiceRole.entities.BookingRequest.list("-created_date", 500);
    const bookedEmails = new Set(
      allBookings
        .filter(b => !["draft", "cancelled"].includes(b.booking_status))
        .map(b => b.user_email)
        .filter(Boolean)
    );

    const results = [];

    for (const lead of leads) {
      // Skip if they've booked
      if (bookedEmails.has(lead.user_email)) {
        console.log(`[LeadFollowUp] Skipping ${lead.user_email} — has booking`);
        continue;
      }

      const weekNum = (lead.follow_up_count || 0) + 1;
      const { subject, body } = buildEmail(lead.user_name, weekNum, lead.unsubscribe_token, lead.user_email);
      const smsBody = buildSMS(lead.user_name, weekNum, lead.unsubscribe_token, lead.user_email);

      let emailSent = false;
      let smsSent = false;
      let emailError = null;
      let smsError = null;

      // Send email
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: lead.user_email,
          subject,
          body,
          from_name: "uRide",
        });
        emailSent = true;
      } catch (e) {
        emailError = e.message;
        console.error(`[LeadFollowUp] Email failed for ${lead.user_email}:`, e.message);
      }

      // Send SMS if phone available
      if (lead.user_phone) {
        try {
          await sendSMS(lead.user_phone, smsBody);
          smsSent = true;
        } catch (e) {
          smsError = e.message;
          console.error(`[LeadFollowUp] SMS failed for ${lead.user_email}:`, e.message);
        }
      }

      // Update lead record
      await base44.asServiceRole.entities.LeadFollowUp.update(lead.id, {
        follow_up_count: weekNum,
        last_contacted_at: new Date().toISOString(),
      });

      results.push({ email: lead.user_email, weekNum, emailSent, smsSent, emailError, smsError });
    }

    console.log(`[LeadFollowUp] Processed ${results.length} leads`);
    return Response.json({ ok: true, processed: results.length, results });
  } catch (error) {
    console.error("[LeadFollowUp] Fatal error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});