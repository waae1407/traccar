import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

const ACTIVATION_BASE_URL = 'https://uridehub.com';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const imei = String(body.imei || body.device_id || '').trim();
    const customerEmail = String(body.customer_email || '').trim().toLowerCase();
    const customerPhone = String(body.customer_phone || '').replace(/[^0-9+]/g, '');

    if (!imei) return Response.json({ error: 'IMEI is required' }, { status: 400 });
    if (!customerEmail) return Response.json({ error: 'Customer email is required' }, { status: 400 });

    // Verify the device exists
    let device = null;
    const byUniqueId = await base44.asServiceRole.entities.TelematicsDevice.filter({ unique_id: imei });
    if (byUniqueId[0]) {
      device = byUniqueId[0];
    } else {
      const byImei = await base44.asServiceRole.entities.TelematicsDevice.filter({ device_imei: imei });
      if (byImei[0]) device = byImei[0];
    }
    if (!device) return Response.json({ error: 'Device not found' }, { status: 404 });

    // Build the activation link with IMEI and email pre-filled
    const activationLink = `${ACTIVATION_BASE_URL}/gps/activate?imei=${encodeURIComponent(imei)}&email=${encodeURIComponent(customerEmail)}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #f8f8fa; padding: 32px 20px;">
        <div style="background: white; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06);">
          <div style="background: linear-gradient(135deg, #e91e8c, #7c3aed); padding: 40px 32px; text-align: center;">
            <h1 style="color: white; font-size: 28px; font-weight: 900; margin: 0;">Your GPS is Installed! 🎉</h1>
            <p style="color: rgba(255,255,255,0.85); font-size: 16px; margin: 8px 0 0;">Contactless360 device ${imei} is ready for activation</p>
          </div>
          <div style="padding: 32px;">
            <p style="color: #333; font-size: 16px; line-height: 1.6;">Great news — your Contactless360 GPS device has been professionally installed and is ready to activate.</p>
            <p style="color: #333; font-size: 16px; line-height: 1.6;">Click the button below to start your 7-day free trial. After the trial, your subscription is just $14.99/month and you can cancel anytime.</p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${activationLink}" style="display: inline-block; background: linear-gradient(135deg, #e91e8c, #7c3aed); color: white; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 16px; text-decoration: none; box-shadow: 0 4px 16px rgba(233,30,140,0.3);">Activate My GPS</a>
            </div>
            <p style="color: #999; font-size: 13px; text-align: center; margin: 16px 0 0;">Or copy this link:<br><span style="color: #666; word-break: break-all;">${activationLink}</span></p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 28px 0;">
            <p style="color: #999; font-size: 12px; line-height: 1.5;">If you didn't expect this email, you can safely ignore it. This link is unique to your device and email address.</p>
          </div>
        </div>
        <p style="color: #bbb; font-size: 11px; text-align: center; margin-top: 16px;">© 2026 Contactless360 by uRideHub</p>
      </div>
    `;

    await base44.asServiceRole.functions.invoke('sendEmail', {
      to: customerEmail,
      subject: 'Activate Your Contactless360 GPS Subscription',
      html,
    });

    // Log the nudge event
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'gps.command_sent',
      actor_email: customerEmail,
      actor_role: 'system',
      target_entity: 'TelematicsDevice',
      target_id: device.id,
      target_label: imei,
      summary: `GPS activation nudge email sent to ${customerEmail} for device ${imei}`,
      metadata: { imei, customer_email: customerEmail, customer_phone: customerPhone, activation_link: activationLink },
      source: 'automation',
      event_status: 'success',
    }).catch(() => null);

    return Response.json({ ok: true, message: 'Activation nudge email sent', sent_to: customerEmail, device_id: device.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});