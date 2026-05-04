// Scheduled — sends role-aware email + SMS to leads who haven't converted yet
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE = Deno.env.get("TWILIO_PHONE_NUMBER");
const APP_URL = "https://uridehub.com";
const LOGO_URL = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

// Max touches before stopping: 4 for customers, 5 for hosts
const CUSTOMER_MAX_TOUCHES = 4;
const HOST_MAX_TOUCHES = 5;

async function sendSMS(to, body) {
  if (!to || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE) return null;
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

// ── CUSTOMER EMAILS ──────────────────────────────────────────────────────────
const CUSTOMER_TOUCHES = [
  {
    subject: (name) => `Your perfect ride is waiting, ${name}`,
    headline: (name) => `Hey ${name}, your ride is waiting!`,
    subtitle: "Get on the road with uRide",
    body: (name, unsubUrl) => `
      <p style="margin: 0 0 20px; font-size: 15px; color: #374151; line-height: 1.6;">Hi ${name},</p>
      <p style="margin: 0 0 24px; font-size: 15px; color: #374151; line-height: 1.6;">You created a uRide account but haven't booked your vehicle yet. We'd love to help you get on the road!</p>
      <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="margin: 0 0 12px; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Why drivers choose uRide</p>
        <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #374151; line-height: 2;">
          <li><strong>$0 deposit</strong> — no money upfront</li>
          <li><strong>Flexible weekly payments</strong> — cancel anytime</li>
          <li><strong>Approved in minutes</strong> — fast and easy</li>
          <li><strong>Rent-to-Own</strong> — drive toward ownership</li>
          <li><strong>Uber &amp; Lyft ready</strong> vehicles available</li>
        </ul>
      </div>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${APP_URL}/book-now" style="display: inline-block; background: linear-gradient(135deg, #e91e8c, #7c3aed); color: white; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Browse Available Vehicles →</a>
      </div>
      <p style="margin: 0; font-size: 13px; color: #374151; font-weight: 600;">— The uRide Team</p>
      <p style="margin: 16px 0 0; font-size: 11px; color: #9ca3af;">You're receiving this because you signed up at uRide. <a href="${unsubUrl}" style="color: #9ca3af;">Unsubscribe</a></p>
    `,
  },
  {
    subject: (name) => `Still looking for a car, ${name}?`,
    headline: (name) => `Still looking, ${name}?`,
    subtitle: "Flexible rentals — no credit check needed",
    body: (name, unsubUrl) => `
      <p style="margin: 0 0 20px; font-size: 15px; color: #374151; line-height: 1.6;">Hi ${name},</p>
      <p style="margin: 0 0 24px; font-size: 15px; color: #374151; line-height: 1.6;">Your uRide account is ready and waiting. Weekly rentals starting from just $199 — no credit check, no hidden fees.</p>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${APP_URL}/book-now" style="display: inline-block; background: linear-gradient(135deg, #e91e8c, #7c3aed); color: white; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Find My Vehicle →</a>
      </div>
      <p style="margin: 0; font-size: 13px; color: #374151; font-weight: 600;">— The uRide Team</p>
      <p style="margin: 16px 0 0; font-size: 11px; color: #9ca3af;"><a href="${unsubUrl}" style="color: #9ca3af;">Unsubscribe</a></p>
    `,
  },
  {
    subject: (name) => `${name}, Uber & Lyft drivers love uRide`,
    headline: (name) => `Drivers like you are earning with uRide`,
    subtitle: "Get Uber/Lyft ready in minutes",
    body: (name, unsubUrl) => `
      <p style="margin: 0 0 20px; font-size: 15px; color: #374151; line-height: 1.6;">Hi ${name},</p>
      <p style="margin: 0 0 24px; font-size: 15px; color: #374151; line-height: 1.6;">Hundreds of gig workers are using uRide to stay on the road with flexible weekly rentals and a path to ownership. Don't miss out.</p>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${APP_URL}/book-now" style="display: inline-block; background: linear-gradient(135deg, #e91e8c, #7c3aed); color: white; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Book My Vehicle →</a>
      </div>
      <p style="margin: 0; font-size: 13px; color: #374151; font-weight: 600;">— The uRide Team</p>
      <p style="margin: 16px 0 0; font-size: 11px; color: #9ca3af;"><a href="${unsubUrl}" style="color: #9ca3af;">Unsubscribe</a></p>
    `,
  },
  {
    subject: (name) => `Last chance — we saved your spot, ${name}`,
    headline: (name) => `We saved your spot, ${name}`,
    subtitle: "Don't let it go cold",
    body: (name, unsubUrl) => `
      <p style="margin: 0 0 20px; font-size: 15px; color: #374151; line-height: 1.6;">Hi ${name},</p>
      <p style="margin: 0 0 24px; font-size: 15px; color: #374151; line-height: 1.6;">This is our final reminder — your uRide account is still active and vehicles are available in your area. Book today and get on the road this week.</p>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${APP_URL}/book-now" style="display: inline-block; background: linear-gradient(135deg, #e91e8c, #7c3aed); color: white; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Book Now →</a>
      </div>
      <p style="margin: 0; font-size: 13px; color: #374151; font-weight: 600;">— The uRide Team</p>
      <p style="margin: 16px 0 0; font-size: 11px; color: #9ca3af;"><a href="${unsubUrl}" style="color: #9ca3af;">Unsubscribe</a></p>
    `,
  },
];

// ── HOST EMAILS ──────────────────────────────────────────────────────────────
const HOST_TOUCHES = [
  {
    subject: (name) => `Welcome to uRide Hosts, ${name} — let's get you set up`,
    headline: (name) => `${name}, your rental business starts here`,
    subtitle: "Turn your vehicle into automated income",
    body: (name, unsubUrl) => `
      <p style="margin: 0 0 20px; font-size: 15px; color: #374151; line-height: 1.6;">Hi ${name},</p>
      <p style="margin: 0 0 24px; font-size: 15px; color: #374151; line-height: 1.6;">You're approved on uRide — but your booking application isn't live yet. Hosts who launch their store start getting customers faster. Here's how to get started in minutes:</p>
      <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="margin: 0 0 12px; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Why hosts choose uRide</p>
        <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #374151; line-height: 2.2;">
          <li>🏪 <strong>Your own booking application</strong> — fully branded with your logo, colors &amp; vehicles, live in minutes</li>
          <li>💰 <strong>Scheduled payouts</strong> — Stripe deposits sent directly to your bank on your schedule</li>
          <li>⚡ <strong>Approved in minutes</strong> — list your first vehicle and start earning today</li>
          <li>🔗 <strong>Share your link, get bookings</strong> — send customers directly to your personal rental app</li>
          <li>🤖 <strong>Zero manual work</strong> — automated billing, contracts, receipts, expenses, maintenance logs, customer management, and reports — all in one place</li>
          <li>📈 <strong>Grow at your own pace</strong> — whether you have 1 vehicle or 100, uRide scales with you</li>
        </ul>
      </div>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${APP_URL}/host/brand" style="display: inline-block; background: linear-gradient(135deg, #e91e8c, #7c3aed); color: white; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Launch My Booking App Now →</a>
      </div>
      <p style="margin: 0; font-size: 13px; color: #374151; font-weight: 600;">— The uRide Team</p>
      <p style="margin: 16px 0 0; font-size: 11px; color: #9ca3af;"><a href="${unsubUrl}" style="color: #9ca3af;">Unsubscribe</a></p>
    `,
  },
  {
    subject: (name) => `${name}, your rental booking app is one click away`,
    headline: (name) => `Your branded booking app is waiting, ${name}`,
    subtitle: "Build it in minutes — no tech skills needed",
    body: (name, unsubUrl) => `
      <p style="margin: 0 0 20px; font-size: 15px; color: #374151; line-height: 1.6;">Hi ${name},</p>
      <p style="margin: 0 0 24px; font-size: 15px; color: #374151; line-height: 1.6;">Did you know you can have a fully branded rental booking application — with your own logo, colors, and vehicles — live in under 5 minutes? Customers book directly through your personal link.</p>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${APP_URL}/host/brand" style="display: inline-block; background: linear-gradient(135deg, #e91e8c, #7c3aed); color: white; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Build My Booking App →</a>
      </div>
      <p style="margin: 0; font-size: 13px; color: #374151; font-weight: 600;">— The uRide Team</p>
      <p style="margin: 16px 0 0; font-size: 11px; color: #9ca3af;"><a href="${unsubUrl}" style="color: #9ca3af;">Unsubscribe</a></p>
    `,
  },
  {
    subject: (name) => `Hosts on uRide get paid automatically — are you set up, ${name}?`,
    headline: (name) => `Get paid automatically, ${name}`,
    subtitle: "Scheduled payouts, zero manual work",
    body: (name, unsubUrl) => `
      <p style="margin: 0 0 20px; font-size: 15px; color: #374151; line-height: 1.6;">Hi ${name},</p>
      <p style="margin: 0 0 24px; font-size: 15px; color: #374151; line-height: 1.6;">Active hosts on uRide receive scheduled Stripe payouts directly to their bank — automatically. No invoicing, no chasing payments, no manual work. Set it up once and earn on autopilot.</p>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${APP_URL}/host/payouts" style="display: inline-block; background: linear-gradient(135deg, #e91e8c, #7c3aed); color: white; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Set Up My Payouts →</a>
      </div>
      <p style="margin: 0; font-size: 13px; color: #374151; font-weight: 600;">— The uRide Team</p>
      <p style="margin: 16px 0 0; font-size: 11px; color: #9ca3af;"><a href="${unsubUrl}" style="color: #9ca3af;">Unsubscribe</a></p>
    `,
  },
  {
    subject: (name) => `${name}, your vehicle could be earning right now`,
    headline: (name) => `Your vehicle is sitting idle, ${name}`,
    subtitle: "Let uRide put it to work",
    body: (name, unsubUrl) => `
      <p style="margin: 0 0 20px; font-size: 15px; color: #374151; line-height: 1.6;">Hi ${name},</p>
      <p style="margin: 0 0 24px; font-size: 15px; color: #374151; line-height: 1.6;">Every week your vehicle sits without a renter is revenue left on the table. List it on uRide today — customers in your area are actively looking to book right now.</p>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${APP_URL}/host/vehicles" style="display: inline-block; background: linear-gradient(135deg, #e91e8c, #7c3aed); color: white; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Add My Vehicle →</a>
      </div>
      <p style="margin: 0; font-size: 13px; color: #374151; font-weight: 600;">— The uRide Team</p>
      <p style="margin: 16px 0 0; font-size: 11px; color: #9ca3af;"><a href="${unsubUrl}" style="color: #9ca3af;">Unsubscribe</a></p>
    `,
  },
  {
    subject: (name) => `Final reminder — we saved your host spot, ${name}`,
    headline: (name) => `Don't let your rental business stall, ${name}`,
    subtitle: "We're here when you're ready",
    body: (name, unsubUrl) => `
      <p style="margin: 0 0 20px; font-size: 15px; color: #374151; line-height: 1.6;">Hi ${name},</p>
      <p style="margin: 0 0 24px; font-size: 15px; color: #374151; line-height: 1.6;">This is our final check-in. Your uRide host account is still active and ready to go. Launch your booking application, add your vehicle, and start earning — all in under 10 minutes.</p>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${APP_URL}/host/dashboard" style="display: inline-block; background: linear-gradient(135deg, #e91e8c, #7c3aed); color: white; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Go to My Dashboard →</a>
      </div>
      <p style="margin: 0; font-size: 13px; color: #374151; font-weight: 600;">— The uRide Team</p>
      <p style="margin: 16px 0 0; font-size: 11px; color: #9ca3af;"><a href="${unsubUrl}" style="color: #9ca3af;">Unsubscribe</a></p>
    `,
  },
];

function buildCustomerEmail(name, touchIndex, unsubUrl) {
  const touch = CUSTOMER_TOUCHES[Math.min(touchIndex, CUSTOMER_TOUCHES.length - 1)];
  const firstName = name?.split(" ")[0] || "there";
  return {
    subject: touch.subject(firstName),
    body: emailWrapper(touch.headline(firstName), touch.subtitle, touch.body(firstName, unsubUrl)),
  };
}

function buildHostEmail(name, touchIndex, unsubUrl) {
  const touch = HOST_TOUCHES[Math.min(touchIndex, HOST_TOUCHES.length - 1)];
  const firstName = name?.split(" ")[0] || "there";
  return {
    subject: touch.subject(firstName),
    body: emailWrapper(touch.headline(firstName), touch.subtitle, touch.body(firstName, unsubUrl)),
  };
}

function buildCustomerSMS(name, touchIndex, unsubUrl) {
  const firstName = name?.split(" ")[0] || "there";
  return touchIndex === 0
    ? `Hey ${firstName}! 👋 You signed up for uRide but haven't booked yet. $0 deposit, approved in minutes. Browse rides: ${APP_URL}/book-now\nReply STOP to unsubscribe.`
    : `Hi ${firstName}! 🚗 Your uRide account is ready — flexible weekly rentals with $0 deposit. Get started: ${APP_URL}/book-now\nReply STOP to unsubscribe.`;
}

function buildHostSMS(name, touchIndex, unsubUrl) {
  const firstName = name?.split(" ")[0] || "there";
  return touchIndex === 0
    ? `Hey ${firstName}! 🚗 Your uRide host account is approved but your booking app isn't live yet. Launch in minutes: ${APP_URL}/host/brand\nReply STOP to unsubscribe.`
    : `Hi ${firstName}! 💰 Hosts on uRide earn on autopilot with scheduled payouts. Get set up: ${APP_URL}/host/dashboard\nReply STOP to unsubscribe.`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all subscribed leads
    const leads = await base44.asServiceRole.entities.LeadFollowUp.filter({ subscribed: true });
    console.log(`[LeadFollowUp] ${leads.length} subscribed leads`);

    // Get all users to check roles
    const allUsers = await base44.asServiceRole.entities.User.list("-created_date", 500);
    const userRoleMap = {};
    for (const u of allUsers) {
      if (u.email) userRoleMap[u.email] = u.role;
    }

    // Get all hosts to check if store is live
    const allHosts = await base44.asServiceRole.entities.Host.list("-created_date", 300);
    const hostStoreMap = {};
    for (const h of allHosts) {
      if (h.email) hostStoreMap[h.email] = h;
    }

    // Get all brand settings to check store publish status
    const allBrands = await base44.asServiceRole.entities.HostBrandSettings.list("-created_date", 300);
    const brandByHostId = {};
    for (const b of allBrands) {
      brandByHostId[b.host_id] = b;
    }

    // Get all bookings to check who has booked
    const allBookings = await base44.asServiceRole.entities.BookingRequest.list("-created_date", 500);
    const bookedEmails = new Set(
      allBookings
        .filter(b => !["draft", "cancelled"].includes(b.booking_status))
        .map(b => b.user_email)
        .filter(Boolean)
    );

    const results = [];

    for (const lead of leads) {
      const role = lead.user_role || userRoleMap[lead.user_email] || "user";
      const isHost = role === "host";
      const touchIndex = lead.follow_up_count || 0;
      const maxTouches = isHost ? HOST_MAX_TOUCHES : CUSTOMER_MAX_TOUCHES;
      const unsubUrl = `${APP_URL}/api/unsubscribeLead?email=${encodeURIComponent(lead.user_email)}&token=${lead.unsubscribe_token}`;

      // Stop if max touches reached
      if (touchIndex >= maxTouches) {
        console.log(`[LeadFollowUp] Skipping ${lead.user_email} — max touches (${maxTouches}) reached`);
        continue;
      }

      // For customers: stop if they've booked
      if (!isHost && bookedEmails.has(lead.user_email)) {
        console.log(`[LeadFollowUp] Skipping ${lead.user_email} — customer has booking`);
        await base44.asServiceRole.entities.LeadFollowUp.update(lead.id, { subscribed: false });
        continue;
      }

      // For hosts: stop if their store is live and they have bookings
      if (isHost) {
        const hostRecord = hostStoreMap[lead.user_email];
        if (hostRecord) {
          const brand = brandByHostId[hostRecord.id];
          if (brand?.published_status === "live" && bookedEmails.has(lead.user_email)) {
            console.log(`[LeadFollowUp] Skipping ${lead.user_email} — host store is live with bookings`);
            await base44.asServiceRole.entities.LeadFollowUp.update(lead.id, { subscribed: false });
            continue;
          }
        }
      }

      // Build role-appropriate email & SMS
      const { subject, body } = isHost
        ? buildHostEmail(lead.user_name, touchIndex, unsubUrl)
        : buildCustomerEmail(lead.user_name, touchIndex, unsubUrl);

      const smsBody = isHost
        ? buildHostSMS(lead.user_name, touchIndex, unsubUrl)
        : buildCustomerSMS(lead.user_name, touchIndex, unsubUrl);

      let emailSent = false;
      let smsSent = false;
      let emailError = null;
      let smsError = null;

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

      if (lead.user_phone) {
        try {
          await sendSMS(lead.user_phone, smsBody);
          smsSent = true;
        } catch (e) {
          smsError = e.message;
          console.error(`[LeadFollowUp] SMS failed for ${lead.user_email}:`, e.message);
        }
      }

      await base44.asServiceRole.entities.LeadFollowUp.update(lead.id, {
        follow_up_count: touchIndex + 1,
        last_contacted_at: new Date().toISOString(),
      });

      results.push({ email: lead.user_email, role, touchIndex: touchIndex + 1, emailSent, smsSent, emailError, smsError });
    }

    console.log(`[LeadFollowUp] Processed ${results.length} leads`);
    return Response.json({ ok: true, processed: results.length, results });
  } catch (error) {
    console.error("[LeadFollowUp] Fatal error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});