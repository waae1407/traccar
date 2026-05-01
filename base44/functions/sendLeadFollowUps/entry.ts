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

const LOGO_URL = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

function emailWrapper(headline, subtitle, bodyContent) {
  return `
<div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
  <div style="background: linear-gradient(135deg, #e91e8c, #7c3aed); padding: 32px 32px 28px; border-radius: 16px 16px 0 0; text-align: center;">
    <img src="${LOGO_URL}" alt="uRide" style="width: 56px; height: 56px; border-radius: 14px; border: 2px solid rgba(255,255,255,0.35); display: block; margin: 0 auto 10px;" />
    <div style="color: white; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 16px;">uRide</div>
    <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">${headline}</h1>
    <p style="color: rgba(255,255,255,0.8); margin: 6px 0 0; font-size: 14px;">${subtitle}</p>
  </div>
  <div style="background: #fafafa; padding: 28px 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
    ${bodyContent}
    <p style="margin: 24px 0 0; font-size: 12px; color: #9ca3af; text-align: center;">Questions? Reply to this email · uridehub.com</p>
  </div>
</div>`;
}

function buildEmail(name, weekNum, unsubToken, email) {
  const firstName = name?.split(" ")[0] || "there";
  const unsubUrl = `${APP_URL}/api/unsubscribeLead?email=${encodeURIComponent(email)}&token=${unsubToken}`;
  const headline = weekNum === 1 ? `Hey ${firstName}, your ride is waiting!` : `Still looking for a car, ${firstName}?`;

  const body = emailWrapper(headline, "Get on the road with uRide", `
    <p style="margin: 0 0 20px; font-size: 15px; color: #374151; line-height: 1.6;">Hi ${firstName},</p>
    <p style="margin: 0 0 24px; font-size: 15px; color: #374151; line-height: 1.6;">We noticed you created an account on uRide but haven't booked your vehicle yet. We'd love to help you get on the road!</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <p style="margin: 0 0 12px; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Why drivers choose uRide</p>
      <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #374151; line-height: 2;">
        <li><strong>$0 deposit</strong> — no money upfront</li>
        <li><strong>Flexible weekly payments</strong> — cancel anytime</li>
        <li><strong>Approved in 24 hours</strong> — fast and easy</li>
        <li><strong>Rent-to-Own</strong> — drive toward ownership</li>
        <li><strong>Uber &amp; Lyft ready</strong> vehicles available</li>
      </ul>
    </div>

    <div style="text-align: center; margin-bottom: 24px;">
      <a href="${APP_URL}/book-now" style="display: inline-block; background: linear-gradient(135deg, #e91e8c, #7c3aed); color: white; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Browse Available Vehicles →</a>
    </div>

    <p style="margin: 0; font-size: 13px; color: #374151; font-weight: 600;">— The uRide Team</p>
    <p style="margin: 16px 0 0; font-size: 11px; color: #9ca3af;">You're receiving this because you signed up at uRide. <a href="${unsubUrl}" style="color: #9ca3af;">Unsubscribe</a></p>
  `);

  return {
    subject: weekNum === 1 ? `Your perfect ride is waiting, ${firstName}` : `Still looking for a car, ${firstName}?`,
    body,
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