import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

/**
 * sendRentalSOS — Renter triggers SOS from the My Vehicle page (rental context).
 *
 * Unlike sendGPSPanicAlert (personal GPS, kill switch + alarm), this is for
 * rental vehicles where the host/platform controls the vehicle. This function:
 *   1. Finds the device via booking's vehicle_id
 *   2. Gets the renter's emergency contacts
 *   3. Sends SMS to primary contact with live GPS location
 *   4. Places an automated voice call to primary contact (Twilio Voice)
 *   5. Sends email to contacts with email + map link
 *   6. Creates an ActivityEvent for audit
 *   7. Notifies the renter via in-app notification
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { booking_id, device_id } = await req.json().catch(() => ({}));

    // ── 1. Find the device ──
    let device = null;
    if (device_id) {
      const devices = await base44.entities.TelematicsDevice.filter({ id: device_id }, '-created_date', 1);
      device = devices[0];
    } else if (booking_id) {
      const booking = await base44.entities.BookingRequest.get(booking_id);
      if (booking?.vehicle_id) {
        const devices = await base44.entities.TelematicsDevice.filter({ vehicle_id: booking.vehicle_id }, '-created_date', 1);
        device = devices[0];
      }
    }

    if (!device) {
      return Response.json({ error: 'No GPS device found for this vehicle' }, { status: 404 });
    }

    const lat = device.last_latitude;
    const lon = device.last_longitude;
    const hasLocation = lat != null && lon != null;
    const mapsUrl = hasLocation ? `https://www.google.com/maps?q=${lat},${lon}` : 'Location unavailable';
    const ownerName = user.full_name || user.email;
    const vehicleName = device.model || 'rental vehicle';

    // ── 2. Get emergency contacts ──
    const contacts = await base44.entities.GPSEmergencyContact.filter({ customer_user_id: user.id }, '-created_date', 10);
    if (contacts.length === 0) {
      return Response.json({ error: 'No emergency contact configured. Please set up SOS first.' }, { status: 400 });
    }

    const primaryContact = contacts.find((c) => c.is_primary) || contacts[0];
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
    const twilioAuth = 'Basic ' + btoa(`${accountSid}:${authToken}`);

    const smsBody = `🚨 EMERGENCY SOS from ${ownerName}. They triggered an SOS from their ${vehicleName}. Location: ${mapsUrl}. Please call them or contact emergency services immediately.`;

    let smsSent = false;
    let callSent = false;
    let emailSent = false;

    // ── 3. Send SMS to all contacts with SMS enabled ──
    for (const contact of contacts) {
      if (contact.receive_sms && contact.contact_phone) {
        try {
          const smsRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
            method: 'POST',
            headers: { 'Authorization': twilioAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ From: fromNumber, To: contact.contact_phone, Body: smsBody }),
          });
          if (smsRes.ok) smsSent = true;
        } catch (e) {
          console.error('[sendRentalSOS] SMS to', contact.contact_phone, 'failed:', e.message);
        }
      }
    }

    // ── 4. Place automated voice call to primary contact ──
    if (primaryContact.contact_phone) {
      try {
        const twiml = `<Response><Say voice="Polly.Joanna" loop="2">This is an emergency alert from uRide. ${ownerName} has triggered an S O S alert from their rental vehicle. Their location has been sent via text message. Please call them or contact emergency services immediately.</Say></Response>`;
        const callRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
          method: 'POST',
          headers: { 'Authorization': twilioAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ From: fromNumber, To: primaryContact.contact_phone, Twiml: twiml }),
        });
        if (callRes.ok) callSent = true;
      } catch (e) {
        console.error('[sendRentalSOS] Voice call failed:', e.message);
      }
    }

    // ── 5. Send email to contacts with email enabled ──
    for (const contact of contacts) {
      if (contact.receive_email && contact.contact_email) {
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: contact.contact_email,
            subject: `🚨 EMERGENCY SOS from ${ownerName}`,
            body: `${ownerName} triggered an SOS alert from their ${vehicleName}.\n\nVehicle location: ${mapsUrl}\n\nThis is an automated emergency alert. Please call them or contact emergency services immediately.\n\n— Sent from the uRide app`,
            from_name: 'uRide Emergency',
          });
          emailSent = true;
        } catch (e) {
          console.error('[sendRentalSOS] Email to', contact.contact_email, 'failed:', e.message);
        }
      }
    }

    // ── 6. Create audit event ──
    try {
      await base44.entities.ActivityEvent.create({
        event_type: 'admin.note_added',
        actor_email: user.email,
        actor_role: 'customer',
        target_entity: 'BookingRequest',
        target_id: booking_id || '',
        target_label: 'Rental SOS Alert',
        summary: `SOS triggered by ${ownerName}. SMS: ${smsSent}, Call: ${callSent}, Email: ${emailSent}, Location: ${hasLocation}`,
        source: 'customer_app',
        event_status: 'warning',
        metadata: { rental_sos: true, booking_id, device_id: device.id, lat, lon, maps_url: mapsUrl, contacts_notified: contacts.length, sms_sent: smsSent, call_sent: callSent, email_sent: emailSent },
      });
    } catch (e) {
      console.error('[sendRentalSOS] ActivityEvent failed:', e.message);
    }

    // ── 7. Notify the renter via in-app notification ──
    try {
      await base44.asServiceRole.functions.invoke('routePlatformNotification', {
        event_type: 'gps_panic_alert',
        severity: 'critical',
        category: 'alert',
        title: '🚨 SOS Alert Sent',
        message: `Emergency alert sent to ${primaryContact.contact_name}. ${smsSent ? 'Text ' : ''}${callSent ? 'Call ' : ''}${emailSent ? 'Email ' : ''}delivered. ${hasLocation ? 'Location shared.' : 'Location unavailable.'}`,
        customer_id: user.email,
        action_url: '/my-vehicle',
        metadata: { rental_sos: true, device_id: device.id, contacts_notified: contacts.length },
        source_function: 'sendRentalSOS',
      });
    } catch (e) {
      console.error('[sendRentalSOS] Owner notification failed:', e.message);
    }

    return Response.json({
      ok: true,
      sms_sent: smsSent,
      call_sent: callSent,
      email_sent: emailSent,
      contacts_notified: contacts.length,
      location: mapsUrl,
      has_location: hasLocation,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});