import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

/**
 * Billing Health Watchdog — detects abnormal payment/billing situations
 * and alerts admins + hosts so nothing slips through silently.
 *
 * Detects:
 * 1. Missed billing: next_billing_date is today/past, booking active, no payment collected
 * 2. No payment method: autopay enabled but no stripe_payment_method_id
 * 3. No next_billing_date: active booking with billing not configured
 * 4. Stale payment_due: in payment_due >24h with no recovery window initialized
 * 5. Billing overdue: next_billing_date >7 days past, booking still active
 * 6. Paid booking missing payment log: payment_status paid but no PaymentLog for current week
 *
 * Runs hourly via GitHub Actions cron. Uses dedupe keys to avoid alert fatigue.
 */

async function authorize(base44, body, req) {
  const user = await base44.auth.me().catch(() => null);
  if (user) {
    if (user.role !== 'admin') {
      return { allowed: false, response: Response.json({ error: 'Forbidden: billing audit is admin-only' }, { status: 403 }) };
    }
    return { allowed: true, isManual: true };
  }
  const isCron = !!(Deno.env.get('CRON_SECRET') && req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET'));
  if (isCron) return { allowed: true, isManual: false };
  return { allowed: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
}

function daysBetween(dateA, dateB) {
  return Math.floor((dateA.getTime() - dateB.getTime()) / (1000 * 60 * 60 * 24));
}

function hasStructuredClosureControl(booking) {
  const closedStatuses = ['cancelled', 'completed', 'closed', 'superseded', 'stale', 'duplicate', 'replaced', 'manually_closed'];
  const closureReasons = ['superseded', 'stale_booking', 'duplicate_booking', 'replaced_booking', 'manually_closed', 'auto_cancelled'];
  return booking.is_superseded === true ||
    !!booking.superseded_by_booking_id ||
    closedStatuses.includes(String(booking.booking_status || '').trim()) ||
    closureReasons.includes(String(booking.closure_reason || '').trim()) ||
    booking.clean_return_status === 'approved_clean';
}

async function hasExistingAlert(base44, alertType, bookingId) {
  const existing = await base44.asServiceRole.entities.PaymentOperationalAlert.filter({
    alert_type: alertType,
    booking_id: bookingId,
  }, '-created_date', 5);
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return existing.some(a => a.created_date && new Date(a.created_date) > cutoff && a.status !== 'resolved' && a.status !== 'dismissed');
}

async function raiseAlert(base44, payload) {
  if (await hasExistingAlert(base44, payload.alert_type, payload.booking_id || '')) return false;
  try {
    await base44.asServiceRole.functions.invoke('createPaymentOperationalAlert', payload);
  } catch (e) {
    console.error('[BillingWatchdog] alert creation failed:', e.message);
  }
  return true;
}

async function notify(base44, payload) {
  try {
    await base44.asServiceRole.functions.invoke('routePlatformNotification', payload);
  } catch (e) {
    console.error('[BillingWatchdog] notification failed:', e.message);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const auth = await authorize(base44, body, req);
    if (!auth.allowed) return auth.response;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const results = { scanned: 0, missed_billing: 0, no_payment_method: 0, no_billing_date: 0, stale_payment_due: 0, billing_overdue: 0, paid_missing_log: 0, alerts_sent: 0 };

    // Fetch all bookings that could have billing activity
    const bookings = await base44.asServiceRole.entities.BookingRequest.filter({
      autopay_enabled: true,
    });

    // Also fetch recent payment logs once for batch checking
    const recentPaymentLogs = await base44.asServiceRole.entities.PaymentLog.list('-paid_at', 200);

    for (const booking of bookings) {
      results.scanned++;

      // Skip closed/superseded bookings
      if (hasStructuredClosureControl(booking)) continue;
      if (!['approved', 'confirmed', 'active', 'checked_out', 'payment_due', 'grace_period', 'suspended'].includes(booking.booking_status)) continue;

      let hostEmail = '';
      if (booking.host_id) {
        const hosts = await base44.asServiceRole.entities.Host.filter({ id: booking.host_id });
        hostEmail = hosts[0]?.email || '';
      }

      // ── CHECK 1: No payment method on file ──
      if (!booking.stripe_payment_method_id || !booking.stripe_customer_id) {
        const raised = await raiseAlert(base44, {
          alert_type: 'payment_method_missing',
          severity: 'high',
          billing_context: 'weekly_billing',
          booking_id: booking.id,
          host_id: booking.host_id || '',
          customer_id: booking.user_id || '',
          vehicle_id: booking.vehicle_id || '',
          renter_email: booking.user_email || '',
          host_email: hostEmail,
          related_entity_type: 'BookingRequest',
          related_entity_id: booking.id,
          title: 'Autopay enabled but no payment method on file',
          message: `Booking ${booking.vehicle_name || booking.id} has autopay enabled but is missing a Stripe payment method. Weekly billing cannot charge this customer.`,
          recommended_action: 'Customer must add a payment method in Account → Payment Methods, or host collects payment manually.',
          financial_impact_amount: booking.weekly_rate || 0,
          currency: 'usd',
          requires_admin_action: true,
          requires_customer_action: true,
          source: 'auditBillingHealth',
        });
        if (raised) {
          results.no_payment_method++;
          results.alerts_sent++;
          await notify(base44, {
            event_type: 'billing_health_payment_method_missing',
            severity: 'critical',
            category: 'payments',
            title: '⚠️ Autopay booking missing payment method',
            message: `${booking.vehicle_name || booking.id} — customer ${booking.user_email} has autopay on but no card on file. Billing cannot run.`,
            booking_id: booking.id,
            customer_id: booking.user_id || '',
            host_id: booking.host_id || '',
            action_url: '/admin/payment-alerts',
            notify_admin: true,
          });
        }
      }

      // ── CHECK 2: No next_billing_date on active booking ──
      if (['active', 'checked_out', 'confirmed', 'approved'].includes(booking.booking_status) && !booking.next_billing_date) {
        const raised = await raiseAlert(base44, {
          alert_type: 'unknown_billing_context',
          severity: 'high',
          billing_context: 'weekly_billing',
          booking_id: booking.id,
          host_id: booking.host_id || '',
          customer_id: booking.user_id || '',
          vehicle_id: booking.vehicle_id || '',
          renter_email: booking.user_email || '',
          host_email: hostEmail,
          related_entity_type: 'BookingRequest',
          related_entity_id: booking.id,
          title: 'Active booking has no next billing date',
          message: `Booking ${booking.vehicle_name || booking.id} is active but has no next_billing_date set. Weekly billing will never trigger for this booking.`,
          recommended_action: 'Admin must set next_billing_date to the upcoming Monday to start the billing cycle.',
          financial_impact_amount: booking.weekly_rate || 0,
          currency: 'usd',
          requires_admin_action: true,
          source: 'auditBillingHealth',
        });
        if (raised) {
          results.no_billing_date++;
          results.alerts_sent++;
          await notify(base44, {
            event_type: 'billing_health_no_billing_date',
            severity: 'critical',
            category: 'payments',
            title: '⚠️ Active booking has no billing date',
            message: `${booking.vehicle_name || booking.id} — next_billing_date is not set. Billing will never trigger.`,
            booking_id: booking.id,
            host_id: booking.host_id || '',
            action_url: '/admin/payment-alerts',
            notify_admin: true,
          });
        }
      }

      // ── CHECK 3: Missed billing — next_billing_date is today/past, no payment collected ──
      if (booking.next_billing_date && ['active', 'checked_out', 'confirmed', 'approved'].includes(booking.booking_status)) {
        const nextBilling = new Date(booking.next_billing_date + 'T00:00:00');
        const daysPast = daysBetween(now, nextBilling);

        if (daysPast >= 0) {
          // Check if a PaymentLog exists for this billing period
          const hasPaymentForPeriod = recentPaymentLogs.some(log =>
            log.booking_request_id === booking.id &&
            log.billing_period_start === booking.next_billing_date
          );

          if (!hasPaymentForPeriod && booking.payment_status !== 'paid') {
            const isOverdue = daysPast >= 7;
            const alertType = 'weekly_billing_failed';
            const severity = isOverdue ? 'critical' : 'high';
            const title = isOverdue
              ? `Billing overdue ${daysPast} days — no payment collected`
              : `Missed billing — next_billing_date was ${booking.next_billing_date}`;
            const message = isOverdue
              ? `Booking ${booking.vehicle_name || booking.id} has next_billing_date ${booking.next_billing_date} (${daysPast} days ago) but no payment was collected. The weekly billing cron may have been skipped.`
              : `Booking ${booking.vehicle_name || booking.id} was due for billing on ${booking.next_billing_date} but no payment was collected today. The billing cron may not have run.`;

            const raised = await raiseAlert(base44, {
              alert_type: alertType,
              severity,
              billing_context: 'weekly_billing',
              booking_id: booking.id,
              host_id: booking.host_id || '',
              customer_id: booking.user_id || '',
              vehicle_id: booking.vehicle_id || '',
              renter_email: booking.user_email || '',
              host_email: hostEmail,
              related_entity_type: 'BookingRequest',
              related_entity_id: booking.id,
              title,
              message,
              recommended_action: isOverdue
                ? 'Run processWeeklyBilling manually for this booking. Verify GitHub Actions cron is not skipped.'
                : 'Verify the billing cron ran today. If skipped, run processWeeklyBilling manually.',
              financial_impact_amount: booking.weekly_rate || 0,
              currency: 'usd',
              requires_admin_action: true,
              retry_attempts: booking.payment_failure_attempts || 0,
              source: 'auditBillingHealth',
            });
            if (raised) {
              if (isOverdue) results.billing_overdue++; else results.missed_billing++;
              results.alerts_sent++;
              await notify(base44, {
                event_type: 'billing_health_missed_billing',
                severity: 'critical',
                category: 'payments',
                title: isOverdue ? `🚨 Billing ${daysPast} days overdue` : '⚠️ Missed billing run detected',
                message: `${booking.vehicle_name || booking.id} — ${booking.user_email} — due ${booking.next_billing_date}. No payment collected. Cron may have been skipped.`,
                booking_id: booking.id,
                customer_id: booking.user_id || '',
                host_id: booking.host_id || '',
                action_url: '/admin/payment-alerts',
                notify_admin: true,
                metadata: { days_past: daysPast, next_billing_date: booking.next_billing_date, weekly_rate: booking.weekly_rate },
              });
            }
          }
        }
      }

      // ── CHECK 4: Stale payment_due — no recovery window initialized ──
      if (booking.booking_status === 'payment_due' && booking.payment_status === 'failed') {
        if (!booking.payment_failure_started_at || !booking.starter_disable_scheduled_at) {
          const raised = await raiseAlert(base44, {
            alert_type: 'weekly_billing_failed',
            severity: 'critical',
            billing_context: 'weekly_billing',
            booking_id: booking.id,
            host_id: booking.host_id || '',
            customer_id: booking.user_id || '',
            vehicle_id: booking.vehicle_id || '',
            renter_email: booking.user_email || '',
            host_email: hostEmail,
            related_entity_type: 'BookingRequest',
            related_entity_id: booking.id,
            title: 'Payment due but recovery window not initialized',
            message: `Booking ${booking.vehicle_name || booking.id} is in payment_due/failed state but has no payment_failure_started_at or starter_disable_scheduled_at. processGracePeriod may not be running.`,
            recommended_action: 'Verify processGracePeriod cron is running. Manually trigger if needed.',
            financial_impact_amount: booking.weekly_rate || 0,
            currency: 'usd',
            requires_admin_action: true,
            source: 'auditBillingHealth',
          });
          if (raised) {
            results.stale_payment_due++;
            results.alerts_sent++;
            await notify(base44, {
              event_type: 'billing_health_stale_payment_due',
              severity: 'critical',
              category: 'payments',
              title: '⚠️ Stale payment_due — recovery not initialized',
              message: `${booking.vehicle_name || booking.id} — in payment_due but processGracePeriod hasn\'t initialized the recovery window.`,
              booking_id: booking.id,
              host_id: booking.host_id || '',
              action_url: '/admin/payment-alerts',
              notify_admin: true,
            });
          }
        }
      }

      // ── CHECK 5: Paid booking missing payment log for current week ──
      if (booking.payment_status === 'paid' && booking.next_billing_date && ['active', 'checked_out'].includes(booking.booking_status)) {
        const hasLogForWeek = recentPaymentLogs.some(log =>
          log.booking_request_id === booking.id &&
          log.status === 'paid' &&
          log.billing_period_end === booking.next_billing_date
        );
        // Only flag if billing_week_number > 1 (week 1 is checkout, not weekly billing)
        if (!hasLogForWeek && (booking.billing_week_number || 1) > 1) {
          const raised = await raiseAlert(base44, {
            alert_type: 'unknown_billing_context',
            severity: 'medium',
            billing_context: 'weekly_billing',
            booking_id: booking.id,
            host_id: booking.host_id || '',
            customer_id: booking.user_id || '',
            vehicle_id: booking.vehicle_id || '',
            renter_email: booking.user_email || '',
            host_email: hostEmail,
            related_entity_type: 'BookingRequest',
            related_entity_id: booking.id,
            title: 'Paid booking missing payment log for current week',
            message: `Booking ${booking.vehicle_name || booking.id} shows payment_status=paid but no PaymentLog exists for the current billing period ending ${booking.next_billing_date}.`,
            recommended_action: 'Run backfillPaymentLogs or verify the payment was actually collected.',
            financial_impact_amount: booking.weekly_rate || 0,
            currency: 'usd',
            requires_admin_action: true,
            source: 'auditBillingHealth',
          });
          if (raised) {
            results.paid_missing_log++;
            results.alerts_sent++;
          }
        }
      }
    }

    console.log(`[BillingWatchdog] Scanned ${results.scanned} bookings — alerts: ${results.alerts_sent} (missed:${results.missed_billing} overdue:${results.billing_overdue} no_pm:${results.no_payment_method} no_date:${results.no_billing_date} stale:${results.stale_payment_due} missing_log:${results.paid_missing_log})`);
    return Response.json({ ok: true, ...results });
  } catch (error) {
    console.error('[BillingWatchdog] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});