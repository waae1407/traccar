/**
 * sendStripeConnectReminders
 *
 * Sends email + SMS reminders to non-FleetOS hosts who have not completed
 * Stripe Connect onboarding. FleetOS Professional hosts use their own
 * Stripe account, so they are excluded.
 *
 * Deduplication: checks for a Notification with event_type
 * 'stripe_connect_reminder' sent to the same host within the last 24h.
 *
 * Can be triggered by:
 *   - Scheduled automation (asServiceRole, no user context)
 *   - Admin manual run (admin auth)
 *   - Single-host test via { host_id }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const DEFAULT_FROM = "uRide <noreply@uridehub.com>";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

const REMINDER_COOLDOWN_HOURS = 24;

async function sendEmailDirect(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) { console.error("[sendStripeConnectReminders] No RESEND_API_KEY"); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: DEFAULT_FROM, to: [to], subject, html }),
    });
    if (!res.ok) { const d = await res.json(); console.error("[sendStripeConnectReminders] Email failed:", d.message); return false; }
    return true;
  } catch (e) { console.error("[sendStripeConnectReminders] Email error:", e.message); return false; }
}

async function sendSmsDirect(to: string, body: string) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) { console.error("[sendStripeConnectReminders] No Twilio creds"); return false; }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: { "Authorization": "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: TWILIO_PHONE_NUMBER, To: to, Body: body }),
    });
    if (!res.ok) { const d = await res.json(); console.error("[sendStripeConnectReminders] SMS failed:", d.message); return false; }
    return true;
  } catch (e) { console.error("[sendStripeConnectReminders] SMS error:", e.message); return false; }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Auth: allow admin or scheduled automation
  const user = await base44.auth.me().catch(() => null);
  const isScheduler = !user && req.headers.get('x-base44-automation');
  if (user && user.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const singleHostId = body.host_id || null;

  // 1. Find hosts with incomplete Stripe onboarding
  const hosts = singleHostId
    ? await base44.asServiceRole.entities.Host.filter({ id: singleHostId })
    : await base44.asServiceRole.entities.Host.filter({ stripe_onboarding_complete: false }, '-created_date', 200);

  const results: any[] = [];
  const cooldownMs = REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000;
  const now = new Date();

  for (const host of hosts) {
    const result: any = { host_id: host.id, email: host.email, status: 'skipped' };

    // Skip if already onboarded (safety check for single-host runs)
    if (host.stripe_onboarding_complete) {
      result.status = 'skipped_already_connected';
      results.push(result);
      continue;
    }

    // Check commerce profile — skip FleetOS Professional
    let isFleetOS = false;
    try {
      const profiles = await base44.asServiceRole.entities.HostCommerceProfile.filter({ host_id: host.id }, '-updated_date', 1);
      if (profiles[0]?.plan_type === 'fleetos_professional') isFleetOS = true;
    } catch (_) { /* if we can't check, proceed */ }

    // Also check operator plan as fallback
    if (!isFleetOS) {
      try {
        const plans = await base44.asServiceRole.entities.OperatorPlanConfiguration.filter({ host_id: host.id }, '-updated_date', 1);
        const mode = plans[0]?.active_mode || plans[0]?.selected_mode;
        if (mode === 'fleetos_professional') isFleetOS = true;
      } catch (_) { /* proceed */ }
    }

    if (isFleetOS) {
      result.status = 'skipped_fleetos';
      results.push(result);
      continue;
    }

    // Deduplication: check for recent reminder notification
    try {
      const recent = await base44.asServiceRole.entities.Notification.filter({
        recipient_email: host.email,
        event_type: 'stripe_connect_reminder',
      }, '-created_date', 1);

      if (recent[0]?.created_date) {
        const lastSent = new Date(recent[0].created_date);
        if (now.getTime() - lastSent.getTime() < cooldownMs) {
          result.status = 'skipped_recently_sent';
          results.push(result);
          continue;
        }
      }
    } catch (_) { /* proceed */ }

    // Send email
    const emailSubject = "Action Required: Set up your payouts to get paid";
    const emailHtml = `
      <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <div style="background: linear-gradient(135deg, #fef9c3 0%, #fde68a 60%, #fcd34d 100%); border-radius: 16px; padding: 24px; border: 1px solid #fcd34d; transform: rotate(-1deg);">
          <p style="font-size: 10px; font-weight: 900; color: #92400e; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 8px;">Action Required</p>
          <h2 style="font-size: 20px; font-weight: 900; color: #451a03; margin: 0 0 12px;">Your payouts are paused</h2>
          <p style="font-size: 14px; color: #78350f; line-height: 1.5; margin: 0 0 16px;">
            Hi ${host.full_name?.split(' ')[0] || 'there'},<br/><br/>
            You haven't connected your bank account yet. Your rental earnings can't be paid out until Stripe is set up.
            It takes 2 minutes — connect your bank and you're done.
          </p>
          <a href="https://uridehub.com/host/payouts" style="display: inline-block; background: #d97706; color: white; font-weight: 900; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-size: 14px;">Connect My Bank →</a>
        </div>
        <p style="font-size: 12px; color: #9ca3af; margin-top: 16px; text-align: center;">uRide Fleet Partner Portal</p>
      </div>
    `;
    const emailSent = await sendEmailDirect(host.email, emailSubject, emailHtml);

    // Send SMS if phone exists
    let smsSent = false;
    if (host.phone) {
      const smsBody = `uRide: Your payouts are paused! Connect your bank account to receive your rental earnings. Tap here: https://uridehub.com/host/payouts`;
      smsSent = await sendSmsDirect(host.phone, smsBody);
    }

    // Create Notification record
    try {
      await base44.asServiceRole.entities.Notification.create({
        recipient_email: host.email,
        recipient_role: 'host',
        recipient_user_id: host.user_id || '',
        recipient_phone: host.phone || '',
        title: 'Your payouts are paused — connect Stripe to get paid',
        body: 'You haven\'t connected your bank account yet. Your rental earnings can\'t be paid out until Stripe is set up.',
        type: 'payment',
        category: 'payouts',
        severity: 'critical',
        event_type: 'stripe_connect_reminder',
        related_entity_type: 'Host',
        related_entity_id: host.id,
        host_id: host.id,
        action_url: '/host/payouts',
        delivery_status: emailSent || smsSent ? 'sent' : 'failed',
        channels_attempted: ['email', ...(host.phone ? ['sms'] : [])],
        channels_successful: [...(emailSent ? ['email'] : []), ...(smsSent ? ['sms'] : [])],
        source_function: 'sendStripeConnectReminders',
      });
    } catch (e) { console.error('[sendStripeConnectReminders] Notification create failed:', e.message); }

    result.status = 'sent';
    result.email_sent = emailSent;
    result.sms_sent = smsSent;
    results.push(result);
  }

  const summary = {
    total_scanned: results.length,
    sent: results.filter(r => r.status === 'sent').length,
    skipped: results.filter(r => r.status.startsWith('skipped')).length,
    results,
  };

  return Response.json(summary);
});