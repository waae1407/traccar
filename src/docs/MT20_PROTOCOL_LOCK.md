# Noran MT20 Protocol Lock

Status: LOCKED — production ready, tested and working

## Rule
The currently implemented Noran MT20 protocol logic is considered working and must not be changed silently.

Any change to existing MT20 command building, packet wrapping, decoding, field mapping, command IDs, byte ordering, Traccar payload formatting, or production send behavior requires explicit owner approval first.

Before making any change to working MT20 protocol code, the assistant must clearly state:

> This changes already-tested and working MT20 protocol behavior.

The assistant must then explain exactly:

1. Which file/function will change
2. What protocol behavior will change
3. Why the change is needed
4. What risk it introduces
5. How it will be tested

The owner must review and either accept or reject before implementation.

## Protected current areas
The following existing logic is protected:

- `functions/sendTelematicsCommand`
  - MT20 packet wrapping
  - `sData[50]` command generation
  - command action mappings for lock, unlock, horn, lights, horn/lights, starter disable, starter restore
  - Traccar custom command payload formatting
  - production command routing for `traccar_noran_mt20`

- `functions/syncTraccarDevicePositions`
  - MT20/Noran packet decoding
  - position, ignition, voltage, GPS, and status parsing

- `pages/admin/AdminTelematicsCommandTest.jsx`
  - production-ready command verification workflow
  - lookup, supported command display, send buttons, command result display, and command history behavior

- `components/telematics/command-test/*`
  - command test UI controls, confirmation states, result labels, and history rendering

- Any installer/admin command test behavior that relies on the current MT20 implementation

## Allowed without approval
These are safe as long as they do not modify working MT20 behavior:

- Creating new documentation
- Creating a new separate MT20 reference library that is not wired into production paths
- Adding tests or sample vectors that only read/compare expected output
- Adding admin UI labels or warnings that do not alter command payloads

## Not allowed without approval
Do not change these without explicit owner approval:

- Existing action mappings
- Existing packet length logic
- Existing start/end markers
- Existing `sData` padding behavior
- Existing byte order assumptions
- Existing command IDs
- Existing Traccar send payload structure
- Existing production/live command routing
- Existing decoder behavior used by live sync/webhook flows