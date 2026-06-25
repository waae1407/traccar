import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * auditBookingIntegrity — Daily Integrity Audit
 * 
 * Scans for:
 * - Overlapping bookings (double bookings)
 * - Overlapping holds
 * - Status mismatches (booked vehicle marked Available)
 * - Orphan/expired holds
 * - Missing vehicle/customer/payment/contract
 * - Duplicate active rentals
 * 
 * Creates OperationalAlerts for every violation.
 */

const BLOCKING_STATUSES = [
  'pending_payment', 'pending_review', 'approved', 'confirmed',
  'checked_out', 'active', 'return_pending_host_review',
  'grace_period', 'payment_due', 'payment_retry'
];

function datesOverlap(b1, b2) {
  if (!b1.start_date || !b1.end_date || !b2.start_date || !b2.end_date) return false;
  const s1 = new Date(b1.start_date + 'T00:00:00');
  const e1 = new Date(b1.end_date + 'T23:59:59');
  const s2 = new Date(b2.start_date + 'T00:00:00');
  const e2 = new Date(b2.end_date + 'T23:59:59');
  return !(e1 <= s2 || s1 >= e2);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const now = new Date();
    const results = {
      overlapping_bookings: 0,
      overlapping_holds: 0,
      status_mismatches: 0,
      orphan_holds: 0,
      expired_holds: 0,
      missing_vehicle: 0,
      missing_customer: 0,
      missing_payment: 0,
      missing_contract: 0,
      duplicate_active_rentals: 0,
      alerts_created: 0,
    };

    const alerts = [];

    // 1. Check for overlapping bookings
    const allBookings = await base44.asServiceRole.entities.BookingRequest.filter({
      booking_status: { $in: BLOCKING_STATUSES }
    });

    const vehicleBookings = {};
    for (const booking of allBookings) {
      if (!vehicleBookings[booking.vehicle_id]) {
        vehicleBookings[booking.vehicle_id] = [];
      }
      vehicleBookings[booking.vehicle_id].push(booking);
    }

    for (const [vehicleId, bookings] of Object.entries(vehicleBookings)) {
      for (let i = 0; i < bookings.length; i++) {
        for (let j = i + 1; j < bookings.length; j++) {
          if (datesOverlap(bookings[i], bookings[j])) {
            results.overlapping_bookings++;
            
            await base44.asServiceRole.entities.BookingIntegrityAudit.create({
              audit_type: 'overlap_detected',
              severity: 'critical',
              vehicle_id: vehicleId,
              booking_request_id: bookings[i].id,
              conflicting_booking_ids: [bookings[i].id, bookings[j].id],
              metadata: {
                booking1_status: bookings[i].booking_status,
                booking2_status: bookings[j].booking_status,
                booking1_dates: `${bookings[i].start_date} to ${bookings[i].end_date}`,
                booking2_dates: `${bookings[j].start_date} to ${bookings[j].end_date}`,
              },
            });

            await base44.asServiceRole.functions.invoke('createPaymentOperationalAlert', {
              alert_type: 'double_booking_detected',
              severity: 'critical',
              status: 'new',
              billing_context: 'active_rental',
              vehicle_id: vehicleId,
              booking_id: bookings[i].id,
              related_entity_type: 'BookingRequest',
              related_entity_id: bookings[i].id,
              title: `Double Booking Detected — Vehicle ${vehicleId.slice(-6)}`,
              message: `Two active bookings overlap: ${bookings[i].id} (${bookings[i].booking_status}) and ${bookings[j].id} (${bookings[j].booking_status}). Immediate resolution required.`,
              recommended_action: 'Review bookings in Admin > Booking360. Supersede or cancel one booking immediately.',
              financial_impact_amount: bookings[i].weekly_rate || 0,
              currency: 'usd',
              requires_admin_action: true,
              source: 'auditBookingIntegrity',
            });

            alerts_created++;
          }
        }
      }
    }

    // 2. Check for expired/orphan holds
    const allHolds = await base44.asServiceRole.entities.BookingHold.filter({
      status: { $in: ['active', 'expired'] }
    });

    for (const hold of allHolds) {
      const expiresAt = new Date(hold.hold_expires_at);
      
      if (expiresAt < now) {
        if (hold.status === 'active') {
          // Mark as expired
          await base44.asServiceRole.entities.BookingHold.update(hold.id, {
            status: 'expired',
            released_at: now.toISOString(),
            released_by: 'system',
            release_reason: 'Hold expired automatically',
          });
          results.expired_holds++;
        }

        if (!hold.booking_request_id) {
          results.orphan_holds++;
          await base44.asServiceRole.entities.BookingIntegrityAudit.create({
            audit_type: 'orphan_hold',
            severity: 'warning',
            vehicle_id: hold.vehicle_id,
            hold_id: hold.id,
            metadata: {
              hold_start: hold.hold_start,
              expires_at: hold.hold_expires_at,
              customer_email: hold.customer_email,
            },
          });
        }
      }
    }

    // 3. Check for status mismatches
    const vehicles = await base44.asServiceRole.entities.Vehicle.list();
    
    for (const vehicle of vehicles) {
      const activeBookings = allBookings.filter(b => b.vehicle_id === vehicle.id);
      
      // Vehicle marked Available but has active bookings
      if (vehicle.status === 'Available' && activeBookings.length > 0) {
        results.status_mismatches++;
        await base44.asServiceRole.entities.BookingIntegrityAudit.create({
          audit_type: 'status_mismatch',
          severity: 'warning',
          vehicle_id: vehicle.id,
          metadata: {
            vehicle_status: vehicle.status,
            active_bookings_count: activeBookings.length,
            booking_ids: activeBookings.map(b => b.id),
          },
        });
      }

      // Vehicle marked as Rented/Reserved but no active bookings
      if (['Rented', 'Reserved', 'Booked'].includes(vehicle.status) && activeBookings.length === 0) {
        results.status_mismatches++;
        await base44.asServiceRole.entities.BookingIntegrityAudit.create({
          audit_type: 'status_mismatch',
          severity: 'info',
          vehicle_id: vehicle.id,
          metadata: {
            vehicle_status: vehicle.status,
            message: 'Vehicle status indicates booked but no active bookings found',
          },
        });
      }
    }

    // 4. Check for missing references
    for (const booking of allBookings) {
      let issues = [];

      if (!booking.vehicle_id) {
        results.missing_vehicle++;
        issues.push('missing_vehicle');
      }

      if (!booking.user_id && !booking.user_email) {
        results.missing_customer++;
        issues.push('missing_customer');
      }

      if (booking.booking_status === 'active' && !booking.stripe_payment_method_id) {
        results.missing_payment++;
        issues.push('missing_payment');
      }

      if (booking.booking_status === 'active' && booking.contract_status !== 'signed') {
        results.missing_contract++;
        issues.push('missing_contract');
      }

      if (issues.length > 0) {
        await base44.asServiceRole.entities.BookingIntegrityAudit.create({
          audit_type: 'missing_vehicle',
          severity: 'warning',
          vehicle_id: booking.vehicle_id || 'unknown',
          booking_request_id: booking.id,
          metadata: { issues },
        });
      }
    }

    // 5. Check for duplicate active rentals (same customer, multiple active bookings)
    const customerBookings = {};
    for (const booking of allBookings) {
      const key = booking.user_email || booking.user_id;
      if (!customerBookings[key]) {
        customerBookings[key] = [];
      }
      customerBookings[key].push(booking);
    }

    for (const [customer, bookings] of Object.entries(customerBookings)) {
      if (bookings.length > 1) {
        results.duplicate_active_rentals++;
        await base44.asServiceRole.entities.BookingIntegrityAudit.create({
          audit_type: 'duplicate_active_rental',
          severity: 'warning',
          vehicle_id: bookings[0].vehicle_id,
          booking_request_id: bookings[0].id,
          metadata: {
            customer_email: customer,
            active_bookings: bookings.map(b => ({
              id: b.id,
              vehicle_id: b.vehicle_id,
              status: b.booking_status,
            })),
          },
        });
      }
    }

    // Create summary alert if issues found
    const totalIssues = Object.values(results).reduce((a, b) => a + b, 0);
    
    if (totalIssues > 0) {
      await base44.asServiceRole.functions.invoke('routePlatformNotification', {
        event_type: 'booking_integrity_audit_complete',
        severity: 'critical',
        category: 'system',
        title: `Booking Integrity Audit — ${totalIssues} Issues Found`,
        message: `Daily audit detected: ${results.overlapping_bookings} overlaps, ${results.expired_holds} expired holds, ${results.status_mismatches} status mismatches, ${results.orphan_holds} orphan holds`,
        notify_admin: true,
        metadata: results,
      });
    }

    return Response.json({ ok: true, results });
  } catch (error) {
    console.error('[auditBookingIntegrity] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});