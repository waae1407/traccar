# Kill Switch Safety Guard — Design Spec

## Purpose

Prevent starter-kill commands (`disable_starter`) from being sent to a moving vehicle.
A kill sent while the engine is running is either pointless (the starter isn't cranking)
or dangerous (if the device/wiring also interrupts ignition/fuel). The guard blocks the
command, notifies the initiator, and optionally parks the command for auto-dispatch when
the vehicle stops.

## Guard Logic

**Rule:** Block `disable_starter` if the vehicle has any measurable speed.

| Speed | Ignition | Verdict | Reason |
|-------|----------|--------|--------|
| 0 | off | ✅ Allow | Parked, engine off — normal state |
| 0 | on | ✅ Allow | Idling (red light, warming up) — starter not cranking |
| >0 | on | ❌ Block | Vehicle is moving with engine on |
| >0 | off | ❌ Block | Anomalous (towing/coasting) — don't trust the state |
| unknown | unknown | ✅ Allow | No telemetry — fail open (payment enforcement must work) |

**Threshold:** `speed > 0` (any positive speed blocks). GPS jitter on a parked vehicle
reports 0 mph (Traccar rounds to integer), so a zero threshold is safe. If jitter becomes
an issue, raise to `speed >= 1` (1 mph).

**Ignition as secondary signal:** When speed is 0, ignition is irrelevant (both on and
off are safe). When speed > 0, the block fires regardless of ignition. Ignition is
useful for the `enforceLockStarterSync` caller which already pre-checks ignition — the
guard is a second layer.

## Bypass Flag

`bypass_safety_guard: true` in the request body skips the guard entirely.

**Only valid caller:** `checkGeofenceAlerts` with `auto_kill_on_breach` (theft recovery).
This is an explicit, audited escalation — the admin or geofence config chose to kill a
possibly-moving stolen vehicle. The bypass is logged with `safety_guard_bypassed: true`
in the TelematicsCommand audit record.

**All other callers** (manual, payment enforcement, lock-sync) → guard active, no bypass.

## Caller Matrix

| Caller | Guard | Moving vehicle | Parked-command queue | Notifications |
|--------|-------|----------------|---------------------|----------------|
| Manual (UI) | Active | Popup: park-or-cancel | Yes, if user picks park | Sent: popup. Completed: email + popup |
| Payment enforcement (`processWeeklyBilling`) | Active | Silent retry next cycle | No (self-healing via cron) | Completed: customer SMS + email |
| Lock-sync (`enforceLockStarterSync`) | Active | Silent drop (next lock re-fires) | No | None (too frequent) |
| Theft recovery (`checkGeofenceAlerts` auto_kill) | Bypassed | Kills immediately | N/A | Sent: owner SMS. Completed: owner email + admin email |

## Parked-Command Queue

When a manual kill is blocked because the vehicle is moving, the user can choose
"Park command — send when stopped." This creates a `TelematicsCommand` record with
`queue_status: 'parked_pending_stop'` and a `parked_expires_at` timestamp (15 min TTL).

**Dispatch:** `dispatchParkedKillCommands` runs every 2 minutes via workflow. For each
parked command:
1. Load the device. If `speed === 0` → dispatch the kill (reuse `sendTelematicsCommand`
   with `bypass_safety_guard: true` since we already verified it's stopped).
2. If `parked_expires_at` has passed → mark as `expired`.
3. If the booking has transitioned (ended, cancelled) → cancel the parked command.

**Auto-cancel conditions:**
- Parked command TTL expires (15 min)
- Booking transitions to a non-active state
- Device goes offline for >5 min (can't confirm stop)

## Two-Phase Reporting

### Phase 1 — Kill Sent (instant, in `sendTelematicsCommand`)
- **Manual:** App popup/toast to initiator (already exists via CommandProgressOverlay)
- **ActivityEvent:** `gps.kill_sent` (already in event taxonomy)
- **No email/SMS yet** — command hasn't succeeded, premature to notify customer

### Phase 2 — Kill Completed (async, when device 0x8009 response arrives)
- **ActivityEvent:** `gps.kill_confirmed` (already exists)
- **Email:** To the relevant party (durable record)
- **SMS:** To customer for payment-enforcement kills (actionable: "pay to restore")
- **App popup:** If initiator is in-app (via realtime subscription or push)
- **On failure/timeout:** `gps.kill_failed` + email to admin for manual follow-up

### Notification Routing by Caller

| Caller | Sent | Completed | Channels |
|--------|------|-----------|----------|
| Manual (host/admin) | Initiator popup | Initiator email | Email + popup |
| Payment enforcement | — (silent) | Customer SMS + email, admin email | SMS + email |
| Lock-sync | — (silent) | — (expected behavior) | None |
| Theft recovery | Owner popup + SMS | Owner email + admin email | SMS + email + popup |

## Implementation Files

| File | Change |
|------|--------|
| `base44/entities/TelematicsCommand.jsonc` | Add `parked_pending_stop` to queue_status, `parked_expires_at`, `safety_guard_reason`, `safety_guard_bypassed` fields |
| `base44/functions/sendTelematicsCommand/entry.ts` | Add safety guard check before dispatching `disable_starter` |
| `base44/functions/dispatchParkedKillCommands/entry.ts` | New — dispatches parked kills when vehicle stops |
| `base44/workflows/Dispatch Parked Kill Commands — Every 2min.jsonc` | New — scheduled workflow |
| `base44/functions/checkGeofenceAlerts/entry.ts` | Pass `bypass_safety_guard: true` for auto_kill_on_breach |
| `src/components/telematics/KillSwitchSafetyPopup.jsx` | New — popup with park-or-cancel choice |
| `src/components/command-center/VehicleCommandControls.jsx` | Handle `blocked_moving` response, show popup |