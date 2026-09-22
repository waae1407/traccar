import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

/**
 * processGPSSubscriptionStatus — Daily GPS subscription grace-period manager.
 *
 * Tiered deactivation:
 *   Day 0:   Payment fails → subscription_status = past_due, past_due_since set
 *   Day 1-4: Dunning emails (Day 1, Day 5, Day 15). Controls still work. Tracking active.
 *   Day 5:   Disable all remote controls (controls_enabled=false, subscription_status=control_disabled). Tracking stays active.
 *   Day 15:  Final warning email. Tracking still active.
 *   Day 30:  Full deactivation (subscription_status=deactivated). Tracking stops.
 *
 * Also handles reactivation: when subscription returns to active, re-enable controls.
 *
 * Triggered by: daily cron (CRON_SECRET) or admin.
 */

const GRACE_CONTROL_DISABLE_DAYS = 5;
const GRACE_TRACKING_DISABLE_DAYS = 30;
const DUNNING_DAYS = [1, 5, 15];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const cronSecret = url.searchParams.get('secret');
    const isCron = cronSecret === Deno.env.get('CRON_SECRET');

    if (!isCron) {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const now = new Date();
    const results = { checked: 0, dunning_sent: 0, controls_disabled: 0, tracking_disabled: 0, reactivated: 0, errors: [] };

    // Get all subscriptions that are not active/cancelled/paused
    const subs = await base44.asServiceRole.entities.GPSSubscription.filter({
      subscription_status: { $in: ['past_due', 'control_disabled', 'deactivated', 'unpaid'] },
    }, '-created_date', 500);

    results.checked = subs.length;

    for (const sub of subs) {
      try {
        const pastDueSince = sub.past_due_since ? new Date(sub.past_due_since) : null;
        if (!pastDueSince) continue;

        const daysPastDue = Math.floor((now.getTime() - pastDueSince.getTime()) / (1000 * 60 * 60 * 24));

        // ── Dunning emails ──
        if (DUNNING_DAYS.includes(daysPastDue) && sub.dunning_email_count < DUNNING_DAYS.indexOf(daysPastDue) + 1) {
          const subject = daysPastDue >= 15
            ? 'FINAL WARNING: Your GPS subscription will be deactivated'
            : daysPastDue >= 5
            ? 'ACTION REQUIRED: Your GPS remote controls have been disabled'
            : 'Payment Failed: Update your payment method to keep your GPS active';

          const body = daysPastDue >= 15
            ? `Your GPS subscription has been past due for ${daysPastDue} days. Your device tracking will be deactivated in ${GRACE_TRACKING_DISABLE_DAYS - daysPastDue} days. Please update your payment method immediately at your account page to avoid permanent deactivation.`
            : daysPastDue >= 5
            ? `Your GPS subscription payment has been past due for ${daysPastDue} days. Remote controls (lock, unlock, kill switch, alarm) have been disabled. Tracking is still active. Please update your payment method to restore all features.`
            : `Your GPS subscription payment failed. You have a ${GRACE_CONTROL_DISABLE_DAYS}-day grace period before remote controls are disabled. Tracking remains active. Please update your payment method.`;

          try {
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: sub.customer_email,
              subject,
              body,
              from_name: 'Contactless360 GPS',
            });
          } catch (e) {
            results.errors.push(`Email to ${sub.customer_email}: ${e.message}`);
          }

          await base44.asServiceRole.entities.GPSSubscription.update(sub.id, {
            dunning_email_count: (sub.dunning_email_count || 0) + 1,
            last_dunning_email_at: now.toISOString(),
          });
          results.dunning_sent++;
        }

        // ── Day 5: Disable controls ──
        if (daysPastDue >= GRACE_CONTROL_DISABLE_DAYS && sub.subscription_status === 'past_due') {
          await base44.asServiceRole.entities.GPSSubscription.update(sub.id, {
            subscription_status: 'control_disabled',
            control_disabled_at: now.toISOString(),
          });

          // Disable controls on the device
          if (sub.device_id) {
            const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: sub.device_id }, '-created_date', 1);
            if (devices[0]) {
              await base44.asServiceRole.entities.TelematicsDevice.update(devices[0].id, {
                controls_enabled: false,
              });
            }
          }
          results.controls_disabled++;
        }

        // ── Day 30: Full deactivation ──
        if (daysPastDue >= GRACE_TRACKING_DISABLE_DAYS && sub.subscription_status !== 'deactivated') {
          await base44.asServiceRole.entities.GPSSubscription.update(sub.id, {
            subscription_status: 'deactivated',
            tracking_disabled_at: now.toISOString(),
          });

          // Notify owner of full deactivation
          try {
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: sub.customer_email,
              subject: 'Your GPS device has been deactivated',
              body: `Your GPS subscription has been past due for ${daysPastDue} days and your device has been deactivated. Tracking and remote controls are no longer available. To reactivate, update your payment method and contact support.`,
              from_name: 'Contactless360 GPS',
            });
          } catch (e) {
            results.errors.push(`Deactivation email: ${e.message}`);
          }
          results.tracking_disabled++;
        }
      } catch (e) {
        results.errors.push(`Sub ${sub.id}: ${e.message}`);
      }
    }

    // ── Reactivation check: subscriptions that returned to active ──
    const reactivatable = await base44.asServiceRole.entities.GPSSubscription.filter({
      subscription_status: 'active',
      payment_status: 'paid',
      control_disabled_at: { $exists: true },
    }, '-created_date', 100);

    for (const sub of reactivatable) {
      try {
        await base44.asServiceRole.entities.GPSSubscription.update(sub.id, {
          control_disabled_at: null,
          tracking_disabled_at: null,
          past_due_since: null,
          dunning_email_count: 0,
          reactivated_at: now.toISOString(),
        });

        if (sub.device_id) {
          const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: sub.device_id }, '-created_date', 1);
          if (devices[0]) {
            await base44.asServiceRole.entities.TelematicsDevice.update(devices[0].id, {
              controls_enabled: true,
            });
          }
        }

        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: sub.customer_email,
            subject: 'Your GPS controls are active again',
            body: 'Your payment has been processed successfully. All remote controls and tracking features have been restored.',
            from_name: 'Contactless360 GPS',
          });
        } catch (e) {
          results.errors.push(`Reactivation email: ${e.message}`);
        }

        results.reactivated++;
      } catch (e) {
        results.errors.push(`Reactivation ${sub.id}: ${e.message}`);
      }
    }

    return Response.json({ ok: true, ...results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});