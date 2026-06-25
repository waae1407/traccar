import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// FAST-COMMIT LOCK: 90 seconds max at final Submit/Pay only
// NO holds during browsing or checkout navigation

/**
 * manageBookingCommitLock — Fast-Commit Inventory Lock (60-120 seconds ONLY)
 * 
 * CRITICAL: This is NOT a reservation system. Locks are created ONLY at final
 * Submit/Pay button click, lasting 90 seconds max. No holds during browsing/checkout.
 * 
 * Operations:
 * - create_or_reuse: Create 90s lock at final payment submit (idempotent by session_id)
 * - release: Release lock (customer cancelled/abandoned)
 * - convert: Lock → BookingRequest (payment succeeded)
 * - expire: System releases expired locks (>90s old)
 */

const COMMIT_LOCK_TTL_SECONDS = 90; // 60-120s max per fast-commit spec

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { operation, vehicle_id, session_id, booking_request_id } = body;

    // Allow 'expire' operation without auth (system cleanup by scheduled automation)
    if (operation !== 'expire') {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (operation !== 'expire' && !vehicle_id) {
      return Response.json({ error: 'vehicle_id required' }, { status: 400 });
    }

    const now = new Date();

    if (operation === 'create_or_reuse') {
      // FAST-COMMIT: Only create lock at final Submit/Pay, NOT during browsing
      // Check for existing active lock on this vehicle (another customer submitting)
      const existingLocks = await base44.asServiceRole.entities.BookingHold.filter({
        vehicle_id,
        status: 'active',
        hold_expires_at: { $gt: now.toISOString() }
      });

      // Check if THIS session already has a lock (double-click protection)
      const sessionLocks = existingLocks.filter(lock => lock.session_id === session_id);
      if (sessionLocks.length > 0) {
        // Reuse existing lock for same session (prevents duplicate PaymentIntent)
        return Response.json({
          ok: true,
          hold_id: sessionLocks[0].id,
          expires_at: sessionLocks[0].hold_expires_at,
          reused: true,
          message: 'Existing lock reused for same session',
        });
      }

      // Different customer has active lock → block briefly
      if (existingLocks.length > 0) {
        return Response.json({
          ok: false,
          error: 'VEHICLE_BEING_SUBMITTED',
          hold_id: existingLocks[0].id,
          expires_at: existingLocks[0].hold_expires_at,
          message: 'Another renter is submitting this vehicle right now. Please try again in a moment.',
        });
      }

      // Validate vehicle availability (don't block on Reserved status from legacy logic)
      const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: vehicle_id });
      const vehicle = vehicles[0];
      
      if (!vehicle) {
        return Response.json({ ok: false, error: 'VEHICLE_NOT_FOUND' });
      }
      
      // Only Compliance Hold should block (not Reserved from legacy checkout)
      if (vehicle.status === 'Compliance Hold') {
        return Response.json({ ok: false, error: 'VEHICLE_COMPLIANCE_HOLD' });
      }

      // Create fast-commit lock (90 seconds max)
      const expiresAt = new Date(now.getTime() + COMMIT_LOCK_TTL_SECONDS * 1000);
      
      const lock = await base44.asServiceRole.entities.BookingHold.create({
        vehicle_id,
        session_id: session_id || crypto.randomUUID(),
        customer_id: user.id,
        customer_email: user.email,
        hold_start: now.toISOString(),
        hold_expires_at: expiresAt.toISOString(),
        status: 'active',
        release_reason: null,
      });

      // DO NOT change vehicle status to Reserved — vehicle stays Available during final submit
      // Status only changes after successful payment/booking

      return Response.json({
        ok: true,
        hold_id: lock.id,
        expires_at: expiresAt.toISOString(),
        lock_ttl_seconds: COMMIT_LOCK_TTL_SECONDS,
        message: 'Fast-commit lock acquired',
      });
    }

    if (operation === 'release') {
      const locks = await base44.asServiceRole.entities.BookingHold.filter({
        id: session_id || booking_request_id,
        status: 'active'
      });

      if (locks.length === 0) {
        return Response.json({ ok: false, error: 'LOCK_NOT_FOUND' });
      }

      const lock = locks[0];

      // Release lock
      await base44.asServiceRole.entities.BookingHold.update(lock.id, {
        status: 'released',
        released_at: now.toISOString(),
        released_by: user.id || 'system',
        release_reason: 'Payment failed or checkout abandoned',
      });

      // DO NOT change vehicle status — vehicle was never set to Reserved
      // Vehicle remains Available throughout checkout

      return Response.json({ ok: true, hold_id: lock.id, released: true, message: 'Lock released' });
    }

    if (operation === 'convert') {
      if (!booking_request_id) {
        return Response.json({ error: 'booking_request_id required for convert' }, { status: 400 });
      }

      const locks = await base44.asServiceRole.entities.BookingHold.filter({
        vehicle_id,
        status: 'active'
      });

      if (locks.length === 0) {
        return Response.json({ ok: false, error: 'NO_ACTIVE_LOCK' });
      }

      const lock = locks[0];

      // Convert lock to booking (payment succeeded)
      await base44.asServiceRole.entities.BookingHold.update(lock.id, {
        status: 'converted',
        booking_request_id,
        released_at: now.toISOString(),
        released_by: 'system',
        release_reason: 'Payment succeeded — converted to booking',
      });

      // DO NOT change vehicle status here — let booking status automation handle it
      // Vehicle will transition: Available → Booked (approved) → Active Rental (active)

      return Response.json({ ok: true, hold_id: lock.id, booking_request_id, converted: true, message: 'Lock converted to booking' });
    }

    if (operation === 'expire') {
      // System operation — expire all locks older than TTL (90 seconds)
      const expiredLocks = await base44.asServiceRole.entities.BookingHold.filter({
        status: 'active',
        hold_expires_at: { $lte: now.toISOString() }
      });

      let expired = 0;
      for (const lock of expiredLocks) {
        await base44.asServiceRole.entities.BookingHold.update(lock.id, {
          status: 'expired',
          released_at: now.toISOString(),
          released_by: 'system',
          release_reason: 'Fast-commit lock expired (>90s)',
        });

        // DO NOT change vehicle status — vehicle was never set to Reserved
        // Vehicle remains Available throughout checkout

        expired++;
      }

      return Response.json({ ok: true, expired_locks_released: expired, message: 'Expired locks cleared' });
    }

    return Response.json({ error: 'Invalid operation. Use: create_or_reuse, release, convert, expire' }, { status: 400 });
  } catch (error) {
    console.error('[manageBookingHold] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});