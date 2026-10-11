import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * backfillOrphanedPaymentLogs
 *
 * Finds all PaymentLog records with missing vehicle_id or host_id and
 * backfills them from the linked BookingRequest record.
 *
 * Root cause: Multiple payment creation paths (processWeeklyBilling, stripeWebhook,
 * backfillPaymentLogs) trusted that booking.vehicle_id was always populated.
 * In edge cases (booking created without vehicle, race condition during update),
 * the PaymentLog was created with no vehicle_id — making it invisible in
 * per-vehicle P&L reports.
 *
 * This function is a one-time corrective measure. The preventive fix is in the
 * creation paths themselves (vehicle_id resolution + guards).
 *
 * Admin-only.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    // Find all PaymentLogs with missing vehicle_id or host_id
    // We need to fetch a broad set and filter client-side since we can't
    // query for "field is empty" directly — we use $exists + null check.
    const allLogs = await base44.asServiceRole.entities.PaymentLog.list('-paid_at', 500);

    const orphaned = allLogs.filter(
      (p) => !p.vehicle_id || !p.host_id
    );

    console.log(`[BackfillOrphaned] Found ${orphaned.length} PaymentLogs with missing vehicle_id or host_id (out of ${allLogs.length} total)`);

    let fixed = 0;
    let stillOrphaned = 0;
    const details = [];

    for (const log of orphaned) {
      const updates: any = {};
      let booking = null;

      // Resolve from booking
      if (log.booking_request_id) {
        const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: log.booking_request_id });
        booking = bookings[0];
      }

      if (booking) {
        // Fix vehicle_id
        if (!log.vehicle_id && booking.vehicle_id) {
          updates.vehicle_id = booking.vehicle_id;
        }
        // Fix host_id
        if (!log.host_id && booking.host_id) {
          updates.host_id = booking.host_id;
        }
        // Fix vehicle_name if also missing
        if (!log.vehicle_name && booking.vehicle_name) {
          updates.vehicle_name = booking.vehicle_name;
        }
        // If vehicle_id still missing, try to resolve from Vehicle entity by host
        if (!updates.vehicle_id && !log.vehicle_id && booking.host_id) {
          try {
            const hostVehicles = await base44.asServiceRole.entities.Vehicle.filter({ host_id: booking.host_id }, '-updated_date', 1);
            if (hostVehicles[0]) {
              updates.vehicle_id = hostVehicles[0].id;
              updates.vehicle_name = `${hostVehicles[0].year || ''} ${hostVehicles[0].make || ''} ${hostVehicles[0].model || ''}`.trim();
            }
          } catch (_) { /* best-effort */ }
        }
      }

      if (Object.keys(updates).length > 0) {
        await base44.asServiceRole.entities.PaymentLog.update(log.id, updates);
        fixed++;
        details.push({
          payment_log_id: log.id,
          booking_request_id: log.booking_request_id,
          amount: log.amount,
          fixed_fields: Object.keys(updates),
          updates,
        });
        console.log(`[BackfillOrphaned] Fixed ${log.id} — ${JSON.stringify(updates)}`);
      } else {
        stillOrphaned++;
        details.push({
          payment_log_id: log.id,
          booking_request_id: log.booking_request_id,
          amount: log.amount,
          error: 'Could not resolve vehicle_id or host_id from booking',
        });
        console.warn(`[BackfillOrphaned] Could not fix ${log.id} — booking has no vehicle_id either`);
      }
    }

    return Response.json({
      ok: true,
      total_scanned: allLogs.length,
      orphaned_found: orphaned.length,
      fixed,
      still_orphaned: stillOrphaned,
      details,
    });
  } catch (error) {
    console.error('[BackfillOrphaned] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});