/**
 * handleAccidentReport — Accident detection reporting pipeline.
 *
 * Called from receiveTelematicsWebhook when a shock alarm or sudden-stop
 * pattern triggers a `possible_accident` safety event. Creates:
 *   1. EvidenceVault "black box" record with full telematics snapshot
 *   2. TelematicsIncident record for incident tracking
 *   3. Emergency contact notifications (SMS + email) with GPS location
 *   4. Audit ActivityEvent
 *
 * Can also be called directly for testing or manual accident reporting.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE = Deno.env.get("TWILIO_PHONE_NUMBER");

// ── Helpers ──────────────────────────────────────────────────────────────────

function toE164(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.startsWith("1") && digits.length === 11 ? `+${digits}` : `+1${digits}`;
}

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY || !to) return { ok: false, error: "NO_API_KEY_OR_RECIPIENT" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "uRide <alerts@uridehub.com>", to: [to], subject, html }),
    });
    const data = await res.json();
    return res.ok ? { ok: true, message_id: data.id } : { ok: false, error: data.message || "EMAIL_FAILED" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function sendSMS(to, text) {
  const phone = toE164(to);
  if (!phone) return { ok: false, error: "INVALID_PHONE" };
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE) return { ok: false, error: "TWILIO_NOT_CONFIGURED" };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: phone, From: TWILIO_PHONE, Body: text }),
    });
    const data = await res.json();
    return res.ok ? { ok: true, sid: data.sid } : { ok: false, error: data.message || "SMS_FAILED" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function googleMapsLink(lat, lon) {
  if (lat === undefined || lon === undefined) return "";
  return `https://www.google.com/maps?q=${lat},${lon}`;
}

// ── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const {
      device_id,
      vehicle_id,
      host_id,
      booking_id,
      customer_user_id,
      owner_user_id,
      latitude,
      longitude,
      speed,
      ignition_status,
      shock_detected,
      voltage,
      safety_event_id,
      telematics_snapshot = {},
      triggered_by = "shock_alarm",
    } = body;

    if (!device_id) return Response.json({ error: "device_id is required" }, { status: 400 });

    const now = new Date().toISOString();
    const mapsLink = googleMapsLink(latitude, longitude);
    const speedMph = Number(speed || 0);

    // ── 1. Create EvidenceVault "black box" accident report ──────────────────
    const reportContent = [
      "ACCIDENT AUTO-DETECTION REPORT",
      "================================",
      "",
      `Triggered by: ${triggered_by}`,
      `Date (UTC): ${now}`,
      `Device ID: ${device_id}`,
      `Vehicle ID: ${vehicle_id || "N/A"}`,
      `Host ID: ${host_id || "N/A"}`,
      `Booking ID: ${booking_id || "N/A"}`,
      "",
      "TELEMETRICS SNAPSHOT (BLACK BOX)",
      "--------------------------------",
      `Location: ${latitude}, ${longitude}`,
      `Google Maps: ${mapsLink || "N/A"}`,
      `Speed at impact: ${speedMph} mph`,
      `Ignition status: ${ignition_status || "unknown"}`,
      `Battery voltage: ${voltage ? voltage.toFixed(1) + "V" : "N/A"}`,
      `Shock sensor triggered: ${shock_detected ? "YES" : "NO"}`,
      `Safety event ID: ${safety_event_id || "N/A"}`,
      "",
      "ADDITIONAL TELEMETRICS",
      "--------------------------------",
      ...Object.entries(telematics_snapshot).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`),
    ].join("\n");

    const evidenceRecord = await base44.asServiceRole.entities.EvidenceVault.create({
      evidence_type: "ai_generated_report",
      title: `Accident Auto-Report — ${now}`,
      description: `Auto-detected accident via ${triggered_by}. Vehicle: ${vehicle_id || "unknown"}. Location: ${latitude}, ${longitude}. Speed: ${speedMph} mph. Ignition: ${ignition_status || "unknown"}.`,
      booking_request_id: booking_id || "",
      vehicle_id: vehicle_id || "",
      host_id: host_id || "",
      customer_id: customer_user_id || owner_user_id || "",
      evidence_date: now,
      telematics_snapshot: {
        device_id,
        latitude,
        longitude,
        speed: speedMph,
        ignition_status,
        shock_detected,
        voltage,
        safety_event_id,
        google_maps_link: mapsLink,
        triggered_by,
        ...telematics_snapshot,
      },
      ai_report_content: reportContent,
      ai_report_summary: `Possible accident detected via ${triggered_by} at ${latitude}, ${longitude}. Speed: ${speedMph} mph. Ignition: ${ignition_status || "unknown"}.`,
      ai_confidence_score: shock_detected ? 0.9 : 0.6,
      ai_findings: [
        shock_detected ? "Shock/impact sensor triggered by device accelerometer" : "Sudden stop pattern detected from speed telemetry",
        `Speed at time of event: ${speedMph} mph`,
        `Ignition status: ${ignition_status || "unknown"}`,
        `Battery voltage: ${voltage ? voltage.toFixed(1) + "V" : "N/A"}`,
      ],
      ai_recommendations: [
        "Verify vehicle and occupant safety immediately",
        "Contact the driver/renter to confirm they are okay",
        "If no response, consider dispatching emergency services to the location",
        "Review trip history for context on what led to the impact",
        "Preserve this evidence record for insurance purposes",
      ],
      status: "collected",
      is_immutable: true,
      created_by: "handleAccidentReport",
    });

    // ── 2. Create TelematicsIncident record ─────────────────────────────────
    const incident = await base44.asServiceRole.entities.TelematicsIncident.create({
      incident_type: "possible_accident",
      incident_title: `Possible Accident — ${now}`,
      incident_summary: `Shock/impact detected on device ${device_id}. Location: ${latitude}, ${longitude}. Speed: ${speedMph} mph. Ignition: ${ignition_status || "unknown"}.`,
      related_event_ids: safety_event_id ? [safety_event_id] : [],
      primary_event_id: safety_event_id || "",
      vehicle_id: vehicle_id || "",
      host_id: host_id || "",
      customer_id: customer_user_id || owner_user_id || "",
      booking_id: booking_id || "",
      severity: "critical",
      status: "open",
      first_seen_at: now,
      last_seen_at: now,
    });

    // ── 3. Notify emergency contacts (GPSEmergencyContact) ───────────────────
    // Emergency contacts are linked to the personal-mode owner's customer_user_id.
    // For rental vehicles, also check the booking's customer.
    const contactUserId = customer_user_id || owner_user_id || "";
    const emergencyContacts = contactUserId
      ? await base44.asServiceRole.entities.GPSEmergencyContact.filter({ customer_user_id: contactUserId }).catch(() => [])
      : [];

    const emergencyNotifications = [];

    for (const contact of emergencyContacts) {
      const smsText = `uRide EMERGENCY ALERT: Possible accident detected for your contact's vehicle at ${mapsLink || "unknown location"}. Speed: ${speedMph} mph. Please check on them immediately.`;
      const emailSubject = `🚨 EMERGENCY: Possible Accident Detected`;
      const emailHtml = `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto">
          <div style="background:#dc2626;padding:24px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="color:white;margin:0;font-size:20px;font-weight:800">🚨 EMERGENCY ALERT</h1>
          </div>
          <div style="background:#fef2f2;padding:24px;border:1px solid #fca5a5;border-top:none;border-radius:0 0 12px 12px">
            <p style="font-size:15px;color:#7f1d1d;margin:0 0 16px">A possible accident has been detected for your contact's vehicle.</p>
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
              <tr><td style="padding:4px 0;font-size:13px;color:#9ca3af">Location</td><td style="font-size:14px;color:#111;text-align:right"><a href="${mapsLink}" style="color:#dc2626">${mapsLink || "N/A"}</a></td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#9ca3af">Speed at Impact</td><td style="font-size:14px;color:#111;text-align:right">${speedMph} mph</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#9ca3af">Time</td><td style="font-size:14px;color:#111;text-align:right">${now}</td></tr>
            </table>
            <p style="font-size:14px;color:#7f1d1d;font-weight:600;margin:0">Please check on them immediately. If they do not respond, consider calling emergency services.</p>
          </div>
        </div>`;

      if (contact.receive_sms !== false && contact.contact_phone) {
        const smsResult = await sendSMS(contact.contact_phone, smsText);
        emergencyNotifications.push({ contact: contact.contact_name, channel: "sms", phone: contact.contact_phone, result: smsResult.ok ? "sent" : smsResult.error });
      }
      if (contact.receive_email !== false && contact.contact_email) {
        const emailResult = await sendEmail(contact.contact_email, emailSubject, emailHtml);
        emergencyNotifications.push({ contact: contact.contact_name, channel: "email", email: contact.contact_email, result: emailResult.ok ? "sent" : emailResult.error });
      }
    }

    // ── 4. Create audit ActivityEvent ───────────────────────────────────────
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: "gps.command_sent",
      actor_id: "handleAccidentReport",
      actor_role: "automation",
      target_entity: "TelematicsDevice",
      target_id: device_id,
      vehicle_id: vehicle_id || "",
      host_id: host_id || "",
      booking_id: booking_id || "",
      summary: `Accident auto-report generated. Evidence: ${evidenceRecord.id}. Incident: ${incident.id}. Emergency contacts notified: ${emergencyNotifications.length}.`,
      metadata: {
        evidence_vault_id: evidenceRecord.id,
        incident_id: incident.id,
        safety_event_id: safety_event_id || "",
        latitude,
        longitude,
        speed: speedMph,
        shock_detected,
        triggered_by,
        emergency_notifications: emergencyNotifications,
      },
      source: "automation",
      event_status: "success",
    }).catch(() => {});

    return Response.json({
      ok: true,
      evidence_vault_id: evidenceRecord.id,
      incident_id: incident.id,
      emergency_contacts_notified: emergencyNotifications.length,
      emergency_notifications: emergencyNotifications,
      google_maps_link: mapsLink,
      report_summary: {
        triggered_by,
        location: { latitude, longitude },
        speed_mph: speedMph,
        ignition_status,
        shock_detected,
        voltage,
        timestamp: now,
      },
    });
  } catch (error) {
    console.error("[handleAccidentReport] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});