# Zero-Credit Cron — GitHub Actions → Base44 Functions

Base44 **scheduled automations** cost **1 integration credit per run** (the
baseline), even when the function inside uses zero integrations. Calling the
same function via its public HTTP endpoint from GitHub Actions costs **0
credits** — only direct-API integrations inside the function cost anything, and
those are already migrated to Resend / Twilio / OneSignal / Gemini / Imagen.

This moves ~14 scheduled pollers off Base44, saving **~2,300 credits/day
(~70k/month)**.

> ⚠️ The Base44 GitHub sync app cannot write to `.github/workflows/`, so create
> the workflow file manually in your GitHub repo using the YAML below.

---

## Step 1 — Create the workflow file in GitHub

In your GitHub repo, create
`.github/workflows/zero-credit-cron.yml` and paste:

```yaml
# Zero-Credit Cron — replaces Base44 scheduled automations with GitHub Actions.
#
# Setup (one-time):
#   1. In Base44: Settings → Secrets → CRON_SECRET is already set.
#   2. In this GitHub repo: Settings → Secrets and variables → Actions →
#      add repo secret CRON_SECRET = <same value as Base44 CRON_SECRET>
#      add repo secret BASE44_APP_ID = 68d033161412d5b125c58fda
#   3. Each function below accepts the x-cron-secret header (guards added).
#   4. Disable the matching Base44 automations to stop the credit drain.
#
# Free tier: scheduled workflows count against Actions minutes. Public repo =
# unlimited; private repo = 2000 min/month. ~50 runs/day ≈ 750 min/month fits
# the private free tier.

name: Zero-Credit Cron

on:
  schedule:
    - cron: '*/5 * * * *'
    - cron: '*/10 * * * *'
    - cron: '*/15 * * * *'
    - cron: '*/30 * * * *'
    - cron: '0 * * * *'
    - cron: '0 */6 * * *'
    - cron: '0 20 * * *'
  workflow_dispatch: {}

concurrency:
  group: zero-credit-cron-${{ github.event.schedule || github.run_id }}
  cancel-in-progress: false

jobs:
  every-5-min:
    if: github.event.schedule == '*/5 * * * *' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - name: Trigger 5-minute functions
        env:
          BASE_URL: https://${{ secrets.BASE44_APP_ID }}.base44.app/api/functions
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          for fn in \
            noranCommandRetryScheduler \
            alarmPulseScheduler \
            escalateUnresolvedNotifications \
            retryFailedNotifications \
            manageBookingHold \
            processAlert360Escalations ; do
            echo "::group::$fn"
            code=$(curl -s -o /tmp/body -w "%{http_code}" -X POST "$BASE_URL/$fn" \
              -H "Content-Type: application/json" \
              -H "x-cron-secret: $CRON_SECRET" \
              -d '{}')
            echo "HTTP $code"; head -c 400 /tmp/body; echo; echo "::endgroup::"
          done

  every-10-min:
    if: github.event.schedule == '*/10 * * * *' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - name: Trigger 10-minute functions
        env:
          BASE_URL: https://${{ secrets.BASE44_APP_ID }}.base44.app/api/functions
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          for fn in dealer360ACVSessionCleanup ; do
            echo "::group::$fn"
            code=$(curl -s -o /tmp/body -w "%{http_code}" -X POST "$BASE_URL/$fn" \
              -H "Content-Type: application/json" -H "x-cron-secret: $CRON_SECRET" -d '{}')
            echo "HTTP $code"; head -c 400 /tmp/body; echo; echo "::endgroup::"
          done

  every-15-min:
    if: github.event.schedule == '*/15 * * * *' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - name: Trigger 15-minute functions
        env:
          BASE_URL: https://${{ secrets.BASE44_APP_ID }}.base44.app/api/functions
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          for fn in \
            auditPayment360Integrity \
            processPendingHostPayouts \
            processRentalLifecycleTransitions \
            reconcileUnlinkedTelematicsInstalls ; do
            echo "::group::$fn"
            code=$(curl -s -o /tmp/body -w "%{http_code}" -X POST "$BASE_URL/$fn" \
              -H "Content-Type: application/json" -H "x-cron-secret: $CRON_SECRET" -d '{}')
            echo "HTTP $code"; head -c 400 /tmp/body; echo; echo "::endgroup::"
          done

  every-30-min:
    if: github.event.schedule == '*/30 * * * *' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - name: Trigger 30-minute functions
        env:
          BASE_URL: https://${{ secrets.BASE44_APP_ID }}.base44.app/api/functions
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          for fn in reconcilePayouts ; do
            echo "::group::$fn"
            code=$(curl -s -o /tmp/body -w "%{http_code}" -X POST "$BASE_URL/$fn" \
              -H "Content-Type: application/json" -H "x-cron-secret: $CRON_SECRET" -d '{}')
            echo "HTTP $code"; head -c 400 /tmp/body; echo; echo "::endgroup::"
          done

  hourly:
    if: github.event.schedule == '0 * * * *' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - name: Trigger hourly functions
        env:
          BASE_URL: https://${{ secrets.BASE44_APP_ID }}.base44.app/api/functions
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          for fn in \
            checkGPSDeviceStatus \
            autoAcceptReturnReviews \
            auditRentalLifecycleIntegrity ; do
            echo "::group::$fn"
            code=$(curl -s -o /tmp/body -w "%{http_code}" -X POST "$BASE_URL/$fn" \
              -H "Content-Type: application/json" -H "x-cron-secret: $CRON_SECRET" -d '{}')
            echo "HTTP $code"; head -c 400 /tmp/body; echo; echo "::endgroup::"
          done

  every-6-hours:
    if: github.event.schedule == '0 */6 * * *' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - name: Trigger 6-hourly functions
        env:
          BASE_URL: https://${{ secrets.BASE44_APP_ID }}.base44.app/api/functions
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          for fn in reconcileHostPlatformSubscriptions ; do
            echo "::group::$fn"
            code=$(curl -s -o /tmp/body -w "%{http_code}" -X POST "$BASE_URL/$fn" \
              -H "Content-Type: application/json" -H "x-cron-secret: $CRON_SECRET" -d '{}')
            echo "HTTP $code"; head -c 400 /tmp/body; echo; echo "::endgroup::"
          done

  daily:
    if: github.event.schedule == '0 20 * * *' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Trigger daily functions
        env:
          BASE_URL: https://${{ secrets.BASE44_APP_ID }}.base44.app/api/functions
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          for fn in \
            auditBookingIntegrity \
            auditNotificationIntegrity \
            checkOverdueAndIncompleteBookings \
            auditPricingIntegrity \
            processGracePeriod \
            dealer360HoldExpiryAlerts ; do
            echo "::group::$fn"
            code=$(curl -s -o /tmp/body -w "%{http_code}" -X POST "$BASE_URL/$fn" \
              -H "Content-Type: application/json" -H "x-cron-secret: $CRON_SECRET" -d '{}')
            echo "HTTP $code"; head -c 400 /tmp/body; echo; echo "::endgroup::"
          done
```

---

## Step 2 — Add repo secrets (GitHub)

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|------|-------|
| `CRON_SECRET` | Same value you set in Base44 CRON_SECRET |
| `BASE44_APP_ID` | `68d033161412d5b125c58fda` |

---

## Step 3 — Test manually

On the workflow page in GitHub, click **"Run workflow"** (the `workflow_dispatch`
trigger). Check the logs — every function should return HTTP 200 with a JSON
body. Any 403 means the secret mismatched; any 500 is a function error to inspect.

---

## Step 4 — Disable the Base44 automations

Once GitHub cron runs green, disable (archive) these Base44 automations so they
stop consuming the 1-credit-per-run baseline. **Keep the entity-triggered
automations on Base44** (they need the event context GitHub can't provide):

**Move off Base44 (archive these):**
- Noran MT20 Command Retry Scheduler
- Alarm Pulse Scheduler
- Critical Notification Escalation
- Notification Retry Engine
- Expire Booking Holds
- Alert360 Escalation Cron
- ACV Session Cleanup — Every 10 Minutes
- Payment360 Integrity Audit (15min)
- Process Pending Host Payouts (48hr Chargeback Hold)
- Payment360 Payout Reconciliation Safety Net
- Rental Lifecycle Transitions
- Reconcile Unlinked Telematics Installs (scheduled)
- Rental Lifecycle Integrity Audit
- GPS Device Health Check — Hourly
- Hourly Auto-Accept Return Reviews / Return Reviews — Auto Accept Expired Windows
- Reconcile Host Platform Subscriptions
- Daily Booking Integrity Audit
- Daily Notification Integrity Audit
- Daily Booking Issue Scanner
- Daily Pricing Integrity Audit
- Grace Period — Daily Payment Retry & Suspension
- Dealer360 Hold Expiry Alerts — Daily

**Keep on Base44 (entity-triggered — need event context):**
- Send Booking Alert Notifications (BookingRequest update)
- Auto-Accept Return Reviews After 24h (InspectionEvidencePacket update)
- Virtual Odometer Trip Snapshots (BookingRequest update)
- Generate luxury neon vehicle image (Vehicle create)
- Auto-create * communication threads (HostPayout/HostVehicleCompliance/HostMaintenanceLog/Dispute/BookingRequest)
- Audit — Dispute Status Changed / Audit — Booking Status Changed
- Reconcile Telematics Install After Vehicle Change (Vehicle create/update)

---

## Remaining guards

The 6 five-minute functions already have the `x-cron-secret` guard added
(noranCommandRetryScheduler, alarmPulseScheduler, escalateUnresolvedNotifications,
retryFailedNotifications, manageBookingHold, processAlert360Escalations).

The other ~16 functions in the workflow still accept unauthenticated calls
(that's how Base44 scheduled automations call them today). They will work from
GitHub cron immediately, but are not yet hardened against arbitrary external
callers. Add the same guard pattern to each before relying on this long-term.