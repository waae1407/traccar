# DOUBLE BOOKING AUDIT REPORT — 2018 TOYOTA Mirai

**Audit Date:** 2026-06-25  
**Incident:** Customer Robert Akenji created two overlapping bookings for same vehicle  
**Severity:** CRITICAL — Revenue loss, customer confusion, operational overhead

---

## ROOT CAUSE ANALYSIS

### What Happened

**Timeline:**
1. **2026-06-16**: Weekly booking created (`6a3c89d0a5c04c9ef4331083`) — $299/week, 06/16 to 06/23
2. **2026-06-20**: Daily booking created (`6a36378565addca789bc531d`) — $300/day, 06/20 to 06/23
3. **2026-06-24**: Customer submitted dropoff photos on daily booking
4. **2026-06-25**: Weekly booking still ACTIVE and billing — 2 days overdue

**Result:** Same vehicle had TWO active bookings simultaneously for overlapping dates.

---

## CODE AUDIT — Why System Allowed This

### ❌ GAP 1: `validateVehicleBooking` — No Availability Check

**File:** `functions/validateVehicleBooking.js`  
**Lines:** 22-52

**Current Logic:**
```javascript
// Only checks vehicle status
if (vehicle.status !== 'Available') {
  return Response.json({ blocked: true, ... });
}
```

**Missing:** No check for existing active bookings on the vehicle during requested dates.

**Impact:** Vehicle shows as "Available" even when already booked.

---

### ❌ GAP 2: `CheckoutFlow` — No Double Booking Prevention

**File:** `pages/checkout/CheckoutFlow.jsx`  
**Lines:** 217-239

**Current Logic:**
```javascript
// Only blocks if user has active booking (any vehicle)
const hardBlockingBooking = allUserBookings.find(
  (b) => HARD_BLOCK_STATUSES.includes(b.booking_status) && b.id !== booking?.id
);

if (user && !requestId && hardBlockingBooking) {
  return <ActiveBookingBlocker />;
}
```

**Issues:**
1. Only checks if **user** has active booking, not if **vehicle** is booked
2. Uses `HARD_BLOCK_STATUSES = ["approved", "confirmed", "active"]` — but `active` bookings should block new bookings on same vehicle
3. No date overlap validation

**Impact:** Customer can book same vehicle multiple times if they have no other active bookings.

---

### ❌ GAP 3: No Date Overlap Validation

**File:** `pages/checkout/CheckoutFlow.jsx`  
**Lines:** 270-338 (StepVehicle onSelect handler)

**Current Logic:**
```javascript
// Creates booking without checking vehicle availability
await createMutation.mutateAsync({
  vehicle_id: v.id,
  start_date: opts.startDate,
  end_date: opts.endDate,
  booking_status: "draft",
  ...
});
```

**Missing:** No query to check for existing bookings on same vehicle with overlapping dates.

**Impact:** System creates overlapping bookings silently.

---

### ❌ GAP 4: `BookNow` — No Real-Time Availability

**File:** `pages/BookNow.jsx`  
**Lines:** 171-198

**Current Logic:**
```javascript
const available = useMemo(() => {
  return vehicles.filter((v) => {
    if (v.status !== "Available") return false;
    // ... host approval, compliance checks ...
    return true;
  });
}, [vehicles, location, ...]);
```

**Missing:** No filter to exclude vehicles with active bookings during selected dates.

**Impact:** Already-booked vehicles appear available in marketplace.

---

## WHY THIS SPECIFIC INCIDENT HAPPENED

### Sequence of Events

1. **Week 1 (06/16-06/23):** Weekly booking created → Status: `active`
   - Customer never completed pickup inspection
   - Weekly billing continued ($299/week)
   - Vehicle status should have changed to "Rented" but remained "Available"

2. **Week 2 (06/20-06/23):** Daily booking created → Status: `return_pending_host_review`
   - Same customer, same vehicle
   - Different host (host_id mismatch: `6a3042f8ea66309b31779a36` vs `69f7f30892cbb98fb7f32537`)
   - Customer submitted dropoff photos
   - Admin note: "OVERDUE WARNING: Customer failed to complete pickup inspection"

3. **Conflict:** Both bookings active simultaneously
   - Weekly booking: Still billing, not returned
   - Daily booking: Return pending review
   - Vehicle status: "Return Pending Host Review" (from daily booking)

---

## CRITICAL GAPS IDENTIFIED

### 1. Vehicle Status Not Updated on Booking
- ✅ Vehicle status should change to "Rented" or "Unavailable" when booking becomes `active`
- ❌ Currently: Vehicle remains "Available" even with active booking

### 2. No Date Overlap Validation
- ✅ System should reject bookings that overlap with existing active bookings
- ❌ Currently: No date validation at checkout

### 3. No Vehicle Availability Query
- ✅ `validateVehicleBooking` should check for active bookings during requested dates
- ❌ Currently: Only checks vehicle.status field

### 4. No Host Assignment Validation
- ✅ System should flag when same vehicle has different host assignments
- ❌ Currently: No validation, creates host payout conflicts

---

## PREVENTION MEASURES

### IMMEDIATE FIXES (Required)

#### 1. Add Date Overlap Validation to `validateVehicleBooking`

**New Function Logic:**
```javascript
// Check for existing active bookings on this vehicle during requested dates
const existingBookings = await base44.asServiceRole.entities.BookingRequest.filter({
  vehicle_id,
  booking_status: { $in: ["approved", "confirmed", "active"] },
});

// Check date overlap
const hasOverlap = existingBookings.some(b => {
  if (!b.start_date || !b.end_date) return false;
  const requestedStart = new Date(start_date);
  const requestedEnd = new Date(end_date);
  const existingStart = new Date(b.start_date);
  const existingEnd = new Date(b.end_date);
  
  // Overlap if: requestedStart <= existingEnd AND requestedEnd >= existingStart
  return requestedStart <= existingEnd && requestedEnd >= existingStart;
});

if (hasOverlap) {
  return Response.json({ blocked: true, reason: "Vehicle not available for selected dates" });
}
```

#### 2. Update Vehicle Status on Booking Activation

**New Automation:** Trigger on `BookingRequest` update where `booking_status` changes to `active`
```javascript
// Update vehicle status to "Rented"
await base44.asServiceRole.entities.Vehicle.update(booking.vehicle_id, {
  status: "Rented"
});
```

#### 3. Add Real-Time Availability to `BookNow`

**Filter Enhancement:**
```javascript
const available = useMemo(() => {
  return vehicles.filter((v) => {
    if (v.status !== "Available") return false;
    // NEW: Check for active bookings
    if (activeBookingsByVehicle[v.id]) return false;
    // ... existing checks ...
    return true;
  });
}, [vehicles, activeBookingsByVehicle, ...]);
```

#### 4. Add Checkout Guard

**CheckoutFlow Enhancement:**
```javascript
// Before creating booking, check vehicle availability
const { data: availability } = await base44.functions.invoke('validateVehicleBooking', {
  vehicle_id: v.id,
  start_date: opts.startDate,
  end_date: opts.endDate,
});

if (availability.blocked) {
  setComplianceError(availability.reason);
  return;
}
```

---

### MEDIUM-TERM FIXES (Recommended)

#### 5. Add Unique Constraint on Vehicle + Date Range

**Database Schema Enhancement:**
- Add unique index on `(vehicle_id, start_date, end_date)` with overlap detection
- Requires PostgreSQL exclusion constraint or application-level locking

#### 6. Add Booking Conflict Detection Automation

**Scheduled Function (Daily):**
```javascript
// Scan for overlapping bookings
const allActive = await base44.asServiceRole.entities.BookingRequest.filter({
  booking_status: { $in: ["approved", "confirmed", "active"] }
});

const conflicts = [];
for (let i = 0; i < allActive.length; i++) {
  for (let j = i + 1; j < allActive.length; j++) {
    if (allActive[i].vehicle_id === allActive[j].vehicle_id) {
      // Check date overlap
      if (datesOverlap(allActive[i], allActive[j])) {
        conflicts.push({ booking1: allActive[i], booking2: allActive[j] });
      }
    }
  }
}

if (conflicts.length > 0) {
  // Alert admin
  await base44.asServiceRole.functions.invoke('routePlatformNotification', {
    event_type: 'double_booking_detected',
    severity: 'critical',
    title: `Double Booking Detected — ${conflicts.length} conflicts`,
    ...
  });
}
```

#### 7. Add Host Assignment Validation

**Validation Rule:**
```javascript
// Prevent booking if vehicle host_id differs from booking host_id
if (booking.host_id !== vehicle.host_id) {
  throw new Error('Host mismatch — vehicle assigned to different host');
}
```

---

## TESTING SCENARIOS

### Before Deployment

1. ✅ Create booking for Vehicle A (06/25 - 07/02)
2. ✅ Attempt second booking for Vehicle A (06/28 - 07/05) → **Should be blocked**
3. ✅ Attempt booking for Vehicle A (07/03 - 07/10) → **Should succeed** (no overlap)
4. ✅ Attempt booking for Vehicle B (same dates) → **Should succeed** (different vehicle)
5. ✅ Vehicle A status should change to "Rented" when booking becomes active
6. ✅ Vehicle A should not appear in BookNow during active rental period

### Edge Cases

1. ✅ Same-day turnover (booking ends 06/25, new booking starts 06/25) → **Should succeed**
2. ✅ Gap between bookings (booking ends 06/25, new booking starts 06/26) → **Should succeed**
3. ✅ Overlap by 1 day (booking ends 06/25, new booking starts 06/24) → **Should be blocked**
4. ✅ Admin override allowed for edge cases (manual approval workflow)

---

## RESOLUTION FOR CURRENT INCIDENT

### Immediate Actions Required

1. **Supersede Weekly Booking** (`6a3c89d0a5c04c9ef4331083`)
   ```javascript
   await base44.asServiceRole.entities.BookingRequest.update('6a3c89d0a5c04c9ef4331083', {
     is_superseded: true,
     superseded_by_booking_id: '6a36378565addca789bc531d',
     closure_reason: 'superseded',
     booking_status: 'cancelled',
     admin_notes: 'Superseded by daily booking 6a36378565addca789bc531d — double booking prevented by system gap'
   });
   ```

2. **Complete Return Review** for Daily Booking (`6a36378565addca789bc531d`)
   - Host must review dropoff photos
   - Approve return → booking status → `completed`
   - Vehicle status → `Available`

3. **Clear Operational Alerts**
   - 2 `rental_overdue` alerts for superseded booking → Mark as resolved

4. **Refund Overcharge** (if weekly billing continued past 06/20)
   - Calculate overcharge: $299 × (days after daily booking started)
   - Create `PricingAdjustment` record
   - Process refund via Stripe

---

## METRICS TO TRACK

### Post-Fix Monitoring

1. **Double Booking Attempts Blocked** — Count per day
2. **Vehicle Availability Accuracy** — % of "Available" vehicles truly available
3. **Checkout Abandonment Rate** — Should not increase due to validation
4. **Customer Support Tickets** — "Why can't I book?" should remain low
5. **Host Complaints** — Should decrease (no more double-booked vehicles)

---

## DEPLOYMENT CHECKLIST

- [ ] Deploy `validateVehicleBooking` with date overlap check
- [ ] Deploy vehicle status automation (active booking → "Rented")
- [ ] Update `BookNow` to filter out vehicles with active bookings
- [ ] Update `CheckoutFlow` to call validation before creating booking
- [ ] Add admin override for edge cases
- [ ] Create double booking detection automation (daily scan)
- [ ] Test all scenarios in staging
- [ ] Deploy to production
- [ ] Monitor metrics for 7 days
- [ ] Resolve current Mirai incident

---

## CONCLUSION

**Root Cause:** Missing date overlap validation in booking flow  
**Impact:** Revenue loss, customer confusion, operational overhead  
**Fix:** Add comprehensive availability checking at multiple layers  
**Timeline:** Immediate fix deployable within 24 hours

**This incident should never happen again once fixes are deployed.**

---

**Prepared By:** Base44 AI Audit System  
**Reviewed By:** [Pending Platform Engineering Review]  
**Status:** Awaiting Fix Deployment