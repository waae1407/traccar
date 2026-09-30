import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

/**
 * confirmGPSDeviceReturn — Admin confirms a returned GPS device.
 *
 * Flow:
 *   1. Mark GPSSubscription.device_returned_at
 *   2. Fully close the subscription (no device fee)
 *   3. Retire the TelematicsDevice
 *   4. Notify customer
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const { subscription_id, condition_notes } = await req.json();
    if (!subscription_id) return Response.json({ error: 'subscription_id is required' }, { status: 400 });

    const now = new Date();

    const subs = await base44.asServiceRole.entities.GPSSubscription.filter({ id: subscription_id }, '-created_date', 1);
    const sub = subs[0];
    if (!sub) return Response.json({ error: 'Subscription not found.' }, { status: 404 });
    if (sub.device_returned_at) return Response.json({ error: 'Device already marked as returned.' }, { status: 409 });

    // ── 1. Mark device returned ──
    await base44.asServiceRole.entities.GPSSubscription.update(sub.id, {
      device_returned_at: now.toISOString(),
      subscription_status: 'cancelled',
    });

    // ── 2. Retire the telematics device ──
    if (sub.device_id) {
      const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: sub.device_id }, '-created_date', 1);
      if (devices[0]) {
        await base44.asServiceRole.entities.TelematicsDevice.update(devices[0].id, {
          lifecycle_status: 'retired',
          retired_at: now.toISOString(),
          subscription_status: 'cancelled',
          controls_enabled: false,
          owner_user_id: null,
          owner_email: null,
        });
      }
    }

    // ── 3. Notify customer ──
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: sub.customer_email,
        subject: '✅ Device received — account closed',
        body: `Hi ${sub.customer_name || 'Customer'},\n\nWe've received your GPS device and confirmed its condition. Your account has been fully closed with no charges.\n\nThank you for trying Contactless360!\n\nThe Contactless360 Team`,
        from_name: 'Contactless360 GPS',
      });
    } catch (e) {
      console.error('[confirmGPSDeviceReturn] email failed:', e.message);
    }

    await base44.asServiceRole.entities.Notification.create({
      recipient_user_id: sub.customer_user_id,
      recipient_email: sub.customer_email,
      recipient_role: 'customer',
      title: '✅ Device Received — Account Closed',
      body: 'We received your GPS device. Your account is fully closed with no charges. Thanks for trying Contactless360!',
      type: 'success',
      category: 'subscriptions',
      severity: 'info',
      source_function: 'confirmGPSDeviceReturn',
    }).catch(() => {});

    // ── 4. Audit ──
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'booking.completed',
      actor_id: user.id,
      actor_email: user.email,
      actor_role: 'admin',
      target_entity: 'GPSSubscription',
      target_id: sub.id,
      summary: `GPS device return confirmed — subscription closed, no device fee`,
      metadata: {
        subscription_id: sub.id,
        condition_notes: condition_notes || '',
      },
      source: 'admin_panel',
      event_status: 'success',
    }).catch(() => {});

    return Response.json({ success: true, message: 'Device return confirmed. Account closed, no device fee.' });
  } catch (err) {
    console.error('[confirmGPSDeviceReturn]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});