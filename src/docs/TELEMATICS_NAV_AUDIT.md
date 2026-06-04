# Telematics Navigation Audit

## Recommended split

### 1. Admin Telematics Center
Use this as the setup and configuration hub.

Keep here:
- Device registry and provisioning
- Provider configuration
- Device assignment / replacement tools
- Production command activation controls
- Safety trigger configuration
- Rollout/readiness links
- Admin command verification link

Purpose: “Set up and certify telematics hardware.”

### 2. Telematics Operations Center
Use this as the daily operating workspace.

Keep here:
- Live fleet health
- Offline/stale GPS alerts
- Geofence and overspeed alerts
- Failed/expired command alerts
- Safety events
- Recent telemetry exceptions
- Work queues for admin follow-up

Purpose: “Monitor live fleet risk and respond to issues.”

## Content that is redundant or low value

Remove or move out of the main views:
- Duplicate high-level stats repeated across both pages
- Raw command history on broad overview screens; keep it inside Command Test or device detail drawers
- Provisioning tools from Operations Center
- Daily alert queues from the setup-focused Telematics Center
- Legacy GPS/MooveTrax wording where the current system is MT20/Traccar/Noran-based
- Any dry-run/readiness cards once a device/page is marked production ready, unless shown under a separate rollout/readiness area

## Final layout recommendation

Sidebar should have:
- Telematics Setup
- Telematics Operations
- Command Verification
- Rollout / Readiness

Command Verification is production-ready and locked. Changes to that page, its command-test components, or command send/MT20 protocol behavior require owner approval first.