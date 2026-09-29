# Traccar Noran MT20 Ignition (ACC) Extraction Fix

## Problem
The Noran MT20 device sends an `bEnable` status byte as the first data byte in every position packet (0x0008, 0x0032), alarm packet (0x0003), and control response (0x8009). This byte contains both the GPS-valid flag (bit 0) and the ACC/ignition flag (bit 1).

Traccar's `NoranProtocolDecoder` only reads bit 0 for `position.setValid()` and discards the rest. As a result, the `ignition` attribute is never populated, and downstream consumers (Base44 sync, alerts, UI) cannot determine real ACC status.

**Symptom:** `ignition_status` in Base44 always falls back to `motion` (speed > 0), producing false "ignition ON" readings whenever the vehicle moves and false "OFF" whenever it stops — regardless of whether the key is actually in the ignition.

## Root Cause

**File:** `src/main/java/org/traccar/protocol/NoranProtocolDecoder.java`

Current code (line ~73):
```java
position.setValid(BitUtil.check(buf.readUnsignedByte(), 0));
```

This reads the `bEnable` byte but only checks bit 0 (GPS valid). Bit 1 (ACC/ignition) is thrown away.

## Solution

Capture the full `bEnable` byte and extract both bits:

```java
int bEnable = buf.readUnsignedByte();
position.setValid(BitUtil.check(bEnable, 0));
position.set(Position.KEY_IGNITION, BitUtil.check(bEnable, 1));
```

`Position.KEY_IGNITION` maps to the `ignition` attribute in the position JSON, which Base44's `syncTraccarDevicePositions` already reads via `attributes.ignition`.

### bEnable Bit Map (Noran MT20)

| Bit | Meaning |
|-----|---------|
| 0 | GPS position valid (1 = fix acquired) |
| 1 | ACC / ignition (1 = ON, 0 = OFF) |
| 2+ | Reserved / protocol-specific |

## What Changes

| Area | Before | After |
|------|--------|-------|
| `NoranProtocolDecoder.decode()` | `setValid(check(byte, 0))` — bit 1 discarded | `setValid` + `set(KEY_IGNITION, check(byte, 1))` |
| Traccar position attributes | `motion` only (speed-derived) | `ignition` (real ACC) + `motion` (speed-derived) |
| Base44 `syncTraccarDevicePositions` | Falls back to `motion` for ignition | Uses real `ignition` attribute; falls back to `motion` only if absent |

**No changes to Base44 sync code** — `ignitionStatus()` already reads `attributes.ignition ?? attributes.motion ?? attributes.acc`.

## Build & Deploy

```bash
# 1. Stop Traccar
sudo systemctl stop traccar

# 2. Backup
sudo cp /opt/traccar/tracker-server.jar /opt/traccar/tracker-server.jar.backup.$(date +%Y%m%d_%H%M%S)

# 3. Apply patch
cd /tmp/traccar-src
bash /path/to/apply_ignition_fix.sh

# 4. Build (2-5 min)
./gradlew clean assemble -x test

# 5. Deploy
sudo cp target/tracker-server.jar /opt/traccar/tracker-server.jar

# 6. Start
sudo systemctl start traccar

# 7. Verify — drive the vehicle, then check:
#    curl -u USER:PASS 'http://localhost:8082/api/positions?deviceId=2' | jq '.[0].attributes.ignition'
#    Should return true (while driving) or false (after key off)
```

## Verification

**Before patch:**
```json
{ "attributes": { "io1": 23, "fuel": 4, "distance": 165.4, "totalDistance": 17505945, "motion": true } }
```
No `ignition` field — Base44 guesses from `motion`.

**After patch:**
```json
{ "attributes": { "ignition": true, "io1": 23, "fuel": 4, "distance": 165.4, "totalDistance": 17505945, "motion": true } }
```
Real ACC status from the device hardware line.

## Risk Assessment

- **Low risk:** Only adds one `position.set()` call — does not change existing `setValid`, `alarm`, `speed`, `course`, `longitude`, `latitude`, or `time` parsing.
- **No data loss:** `bEnable` byte is already consumed by `readUnsignedByte()`; we just capture the return value instead of discarding it.
- **Backward compatible:** Old positions without `ignition` still work — Base44 sync falls back to `motion`.
- **No protocol lock violation:** This patches the Traccar server Java decoder, not Base44's `syncTraccarDevicePositions` function. Base44 sync code is unchanged.

## Related

- [NORAN_DEVICE_ID_FIX.md](./NORAN_DEVICE_ID_FIX.md) — device ID extraction for ACK packets
- [COMMAND_RELIABILITY_FIX.md](./COMMAND_RELIABILITY_FIX.md) — UDP session reliability