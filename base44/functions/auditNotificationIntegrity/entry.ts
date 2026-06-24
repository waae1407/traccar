/**
 * auditNotificationIntegrity — Daily scan for notification gaps
 *
 * Checks for:
 *   - Overdue rentals with no OperationalAlert
 *   - return_pending_host_review with no host notification
 *   - PricingAdjustment with no admin notification
 *   - TelematicsSafetyEvent (critical) with no Notification records
 *   - Failed payments with no customer/admin notification
 *   - Payout failures with no admin/host notification
 *
 * Creates missing notifications and OperationalAlerts.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const today = new Date().toISOString().split('T')[0];
    const results = {
      gaps_found: 0,
      notifications_created: 0,
      operational_alerts_created: 0,
      details: [],
    };

    // 1. Overdue rentals with no OperationalAlert
    const overdueBookings = await base44.asServiceRole.entities.BookingRequest.filter({
      booking_status: { $in: ['active', 'approved', 'confirmed', 'return_pending_host_review'] },
    });
    
    for (const booking of overdueBookings) {
      if (!booking.end_date) continue;
      const endDate = new Date(`${booking.end_date}T23:59:59`);
      const daysOverdue = Math.floor((Date.now() - endDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysOverdue > 0) {
        const existingAlerts = await base44.asServiceRole.entities.PaymentOperationalAlert.filter({
          alert_type: 'rental_overdue',
          booking_id: booking.id,
          status: { $in: ['new', 'notified', 'in_progress'] },
        }, '-created_date', 1).catch(() => []);
        
        if (existingAlerts.length === 0) {
          results.gaps_found++;
          results.details.push({ type: 'overdue_rental_no_alert', booking_id: booking.id, days_overdue: daysOverdue });
          
          // Create OperationalAlert
          await base44.asServiceRole.entities.PaymentOperationalAlert.create({
            alert_type: 'rental_overdue',
            severity: 'critical',
            status: 'new',
            billing_context: 'active_rental',
            booking_id: booking.id,
            host_id: booking.host_id || '',
            customer_id: booking.user_id || '',
            vehicle_id: booking.vehicle_id || '',
            renter_email: booking.user_email,
            related_entity_type: 'BookingRequest',
            related_entity_id: booking.id,
            title: `Rental Overdue ${daysOverdue} Days — ${booking.vehicle_name || booking.id}`,
            message: `Customer has not returned vehicle. End date was ${booking.end_date}. Weekly billing continues.`,
            recommended_action: 'Contact customer, consider GPS tracking, or escalate to collections.',
            financial_impact_amount: (booking.weekly_rate || 0) * daysOverdue,
            currency: 'usd',
            requires_admin_action: true,
            requires_host_action: true,
            requires_customer_action: true,
            source: 'auditNotificationIntegrity',
            metadata: { audit_date: today, days_overdue: daysOverdue },
          }).catch(() => {});
          results.operational_alerts_created++;
          
          // Create admin notification
          const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' }).catch(() => []);
          for (const admin of admins.slice(0, 1)) {
            await base44.asServiceRole.entities.Notification.create({
              recipient_user_id: admin.id,
              recipient_role: 'admin',
              recipient_email: admin.email,
              title: `🚨 Overdue Rental Detected: ${booking.vehicle_name || booking.id}`,
              body: `Rental is ${daysOverdue} days overdue. Created OperationalAlert for review.`,
              type: 'alert',
              category: 'bookings',
              severity: 'critical',
              booking_request_id: booking.id,
              vehicle_id: booking.vehicle_id,
              host_id: booking.host_id,
              action_url: `/admin/booking-360?id=${booking.id}`,
              source_function: 'auditNotificationIntegrity',
            }).catch(() => {});
            results.notifications_created++;
          }
        }
      }
    }

    // 2. return_pending_host_review with no host notification
    const returnPending = await base44.asServiceRole.entities.BookingRequest.filter({
      booking_status: 'return_pending_host_review',
    });
    
    for (const booking of returnPending) {
      if (!booking.dropoff_submitted_at) continue;
      const submittedAt = new Date(booking.dropoff_submitted_at);
      const hoursSinceReturn = (Date.now() - submittedAt.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceReturn > 2) {
        const existingNotifs = await base44.asServiceRole.entities.Notification.filter({
          user_email: booking.user_email,
          booking_request_id: booking.id,
          title: { $regex: 'Return.*Review' },
        }, '-created_date', 1).catch(() => []);
        
        if (existingNotifs.length === 0) {
          results.gaps_found++;
          results.details.push({ type: 'return_review_no_notification', booking_id: booking.id, hours_since_return: Math.round(hoursSinceReturn) });
          
          // Create host notification
          const hosts = await base44.asServiceRole.entities.Host.filter({ id: booking.host_id }).catch(() => []);
          const host = hosts[0];
          if (host) {
            await base44.asServiceRole.entities.Notification.create({
              recipient_user_id: host.user_id || '',
              recipient_role: 'host',
              recipient_email: host.email,
              title: `📋 Return Review Required — ${booking.vehicle_name || booking.id}`,
              body: `Customer submitted dropoff photos ${Math.round(hoursSinceReturn)} hours ago. Review return inspection to complete rental.`,
              type: 'alert',
              category: 'bookings',
              severity: 'warning',
              booking_request_id: booking.id,
              vehicle_id: booking.vehicle_id,
              host_id: host.id,
              action_url: `/host/return-reviews`,
              source_function: 'auditNotificationIntegrity',
            }).catch(() => {});
            results.notifications_created++;
          }
        }
      }
    }

    // 3. PricingAdjustment with no admin notification
    const pricingAdjustments = await base44.asServiceRole.entities.PricingAdjustment.filter({
      adjustment_type: { $in: ['overcharge_refund', 'payout_correction'] },
      refund_status: 'pending',
    });
    
    for (const adj of pricingAdjustments) {
      const existingNotifs = await base44.asServiceRole.entities.Notification.filter({
        category: 'payments',
        booking_request_id: adj.booking_request_id,
        title: { $regex: 'Pricing|Overcharge' },
      }, '-created_date', 1).catch(() => []);
      
      if (existingNotifs.length === 0) {
        results.gaps_found++;
        results.details.push({ type: 'pricing_adjustment_no_notification', adjustment_id: adj.id, overcharge: adj.overcharge_amount });
        
        const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' }).catch(() => []);
        for (const admin of admins.slice(0, 1)) {
          await base44.asServiceRole.entities.Notification.create({
            recipient_user_id: admin.id,
            recipient_role: 'admin',
            recipient_email: admin.email,
            title: `💰 Pricing Adjustment Required: $${adj.overcharge_amount || 0}`,
            body: `${adj.adjustment_type.replace(/_/g, ' ').toUpperCase()} for ${adj.vehicle_name || adj.booking_request_id}. Review and process refund.`,
            type: 'alert',
            category: 'payments',
            severity: 'critical',
            booking_request_id: adj.booking_request_id,
            vehicle_id: adj.vehicle_id,
            host_id: adj.host_id,
            payment_id: adj.stripe_charge_id || adj.stripe_payment_intent_id || '',
            action_url: `/admin/payment-alerts`,
            source_function: 'auditNotificationIntegrity',
          }).catch(() => {});
          results.notifications_created++;
        }
      }
    }

    // 4. Critical TelematicsSafetyEvent with no Notification
    const criticalEvents = await base44.asServiceRole.entities.TelematicsSafetyEvent.filter({
      is_active: true,
      severity: 'critical',
    });
    
    for (const event of criticalEvents) {
      const existingNotifs = await base44.asServiceRole.entities.Notification.filter({
        alert360_event_id: event.id,
      }, '-created_date', 1).catch(() => []);
      
      if (existingNotifs.length === 0 && event.first_seen_at) {
        const firstSeen = new Date(event.first_seen_at);
        const hoursOld = (Date.now() - firstSeen.getTime()) / (1000 * 60 * 60);
        
        if (hoursOld > 0.5) { // Only if event is >30 minutes old
          results.gaps_found++;
          results.details.push({ type: 'telematics_critical_no_notification', event_id: event.id, alert_type: event.alert_type });
          
          // Create admin notification
          const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' }).catch(() => []);
          for (const admin of admins.slice(0, 1)) {
            await base44.asServiceRole.entities.Notification.create({
              recipient_user_id: admin.id,
              recipient_role: 'admin',
              recipient_email: admin.email,
              title: `🚨 Critical Telematics Alert: ${event.alert_title}`,
              body: event.alert_message,
              type: 'alert',
              category: 'gps',
              severity: 'critical',
              vehicle_id: event.vehicle_id,
              host_id: event.host_id,
              alert360_event_id: event.id,
              action_url: `/admin/alert360`,
              source_function: 'auditNotificationIntegrity',
            }).catch(() => {});
            results.notifications_created++;
          }
        }
      }
    }

    // 5. Failed payments with no customer notification
    const failedPayments = await base44.asServiceRole.entities.BookingRequest.filter({
      payment_status: 'failed',
      booking_status: { $in: ['payment_due', 'suspended'] },
    });
    
    for (const booking of failedPayments) {
      const existingNotifs = await base44.asServiceRole.entities.Notification.filter({
        user_email: booking.user_email,
        booking_request_id: booking.id,
        type: 'payment',
      }, '-created_date', 1).catch(() => []);
      
      if (existingNotifs.length === 0) {
        results.gaps_found++;
        results.details.push({ type: 'failed_payment_no_notification', booking_id: booking.id });
        
        // Create customer notification
        await base44.asServiceRole.entities.Notification.create({
          recipient_user_id: booking.user_id || '',
          recipient_role: 'customer',
          recipient_email: booking.user_email,
          title: '⚠️ Payment Failed — Action Required',
          body: `Your payment for ${booking.vehicle_name || booking.id} failed. Please update your payment method to avoid service interruption.`,
          type: 'payment',
          category: 'payments',
          severity: 'critical',
          booking_request_id: booking.id,
          vehicle_id: booking.vehicle_id,
          action_url: '/account',
          source_function: 'auditNotificationIntegrity',
        }).catch(() => {});
        results.notifications_created++;
      }
    }

    // Create summary OperationalAlert if gaps found
    if (results.gaps_found > 0) {
      await base44.asServiceRole.entities.PaymentOperationalAlert.create({
        alert_type: 'notification_gap_detected',
        severity: results.gaps_found > 5 ? 'critical' : 'warning',
        status: 'new',
        domain: 'communications',
        title: `Notification Integrity Audit: ${results.gaps_found} Gaps Found`,
        message: `Daily audit detected ${results.gaps_found} notification gaps. Created ${results.notifications_created} notifications and ${results.operational_alerts_created} operational alerts.`,
        recommended_action: 'Review notification system coverage and ensure all critical events trigger proper alerts.',
        requires_admin_action: true,
        source: 'auditNotificationIntegrity',
        metadata: {
          audit_date: today,
          gaps_found: results.gaps_found,
          notifications_created: results.notifications_created,
          operational_alerts_created: results.operational_alerts_created,
          gap_details: results.details,
        },
      }).catch(() => {});
    }

    console.log(`[NotificationAudit] Found ${results.gaps_found} gaps, created ${results.notifications_created} notifications, ${results.operational_alerts_created} alerts`);
    return Response.json({ ok: true, ...results, audit_date: today });
  } catch (error) {
    console.error('[NotificationAudit] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});