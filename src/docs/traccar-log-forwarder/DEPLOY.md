# MT20 Log Forwarder — Deployment Guide

## Source of Truth

The forwarder script lives in this GitHub repo at:
```
src/docs/traccar-log-forwarder/forwarder.py
```

Deploy path on Traccar server:
```
/opt/traccar/log-forwarder/forwarder.py
```

Environment config:
```
/opt/traccar/log-forwarder/.env
```

---

## What this does

Tails `/opt/traccar/logs/tracker-server.log` in real time and forwards inbound
Noran MT20 device packets to Base44.

**v2 batching:** Heartbeat (0x000f) and position/voltage (0x0032) packets are
buffered locally and flushed every 5 minutes to `batchSyncTelematicsData`,
reducing credit consumption by ~94%. Command ACKs (0x8009) are still forwarded
in real-time for urgent command matching.

---

## Packet types

| Hex prefix | Type             | Routing     | Purpose                      |
|------------|------------------|-------------|------------------------------|
| `0f000000` | heartbeat        | **BATCHED** | MT20 keepalive — NAT refresh |
| `28003200` | position (0x0032)| **BATCHED** | Position + voltage upload     |
| `08000000` | position (0x0008)| **BATCHED** | Legacy position upload        |
| `22000300` | alarm (0x0003)   | REAL-TIME   | Alarm upload                 |
| `29000980` | command ACK      | **REAL-TIME**| Command response (0x8009)    |

**NOT forwarded:** outbound `noran >` server ACK lines.

---

## Step 1 — Install dependency

```bash
pip3 install requests
```

---

## Step 2 — Copy forwarder to server

From your local machine (clone of this repo):
```bash
scp src/docs/traccar-log-forwarder/forwarder.py traccar-server:/opt/traccar/log-forwarder/forwarder.py
```

Or on the server directly:
```bash
sudo cp forwarder.py /opt/traccar/log-forwarder/forwarder.py
sudo chmod +x /opt/traccar/log-forwarder/forwarder.py
```

---

## Step 3 — Set environment variables

Edit `/opt/traccar/log-forwarder/.env`:

```bash
# Real-time endpoint (command ACKs)
BASE44_WEBHOOK_URL=https://deft-urban-ride-flow.base44.app/functions/webhookLightLogForwarder

# Batch endpoint (heartbeat + position) — NEW in v2
BATCH_WEBHOOK_URL=https://deft-urban-ride-flow.base44.app/functions/batchSyncTelematicsData

# Shared secret (must match Base44 TRACCAR_WEBHOOK_SECRET)
TRACCAR_WEBHOOK_SECRET=your_secret_here

# Log file path
LOG_FILE=/opt/traccar/logs/tracker-server.log

# Provider key
PROVIDER_KEY=traccar_noran_mt20

# Fallback device ID
DEVICE_UNIQUE_ID=NR09G00001

# Batching config
BATCH_ENABLED=true
BATCH_INTERVAL_S=300
```

> `TRACCAR_WEBHOOK_SECRET` must match the `TRACCAR_WEBHOOK_SECRET` secret set in Base44.
> If `BATCH_WEBHOOK_URL` is not set, the forwarder falls back to real-time for all packets (zero risk).

---

## Step 4 — Restart the service

```bash
sudo systemctl restart noran-forwarder
```

Check status:
```bash
sudo systemctl status noran-forwarder
sudo journalctl -u noran-forwarder -f
```

You should see:
```
Starting uRideHub MT20 forwarder v2 (batched): /opt/traccar/logs/tracker-server.log
Batch enabled: True, interval: 300s
Batch webhook: https://deft-urban-ride-flow.base44.app/functions/batchSyncTelematicsData
```

And every 5 minutes:
```
[batch] Flushed 47 entries for 6 devices (total flushed: 47)
```

---

## Step 5 — Verify

### A. Confirm heartbeat lines appear in Traccar log

```bash
tail -f /opt/traccar/logs/tracker-server.log | grep "noran <" | grep "0f000000"
```

### B. Confirm batch flushes in forwarder logs

```bash
sudo journalctl -u noran-forwarder -f | grep batch
```

### C. Confirm command ACKs still forward in real-time

```bash
sudo journalctl -u noran-forwarder -f | grep "command ACK"
```

### D. Confirm Base44 device record updated

Run in Base44 exec tool:
```js
const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ unique_id: 'NR09G51902' });
return {
  last_inbound_packet_type: devices[0].last_inbound_packet_type,
  last_inbound_packet_at: devices[0].last_inbound_packet_at,
  voltage: devices[0].voltage,
  voltage_source: devices[0].voltage_source
};
```

---

## Upgrading from v1

If you had the previous forwarder running:

```bash
# Backup
sudo cp /opt/traccar/log-forwarder/forwarder.py /opt/traccar/log-forwarder/forwarder_v1_backup.py

# Copy new version
sudo cp forwarder.py /opt/traccar/log-forwarder/forwarder.py

# Add BATCH_WEBHOOK_URL to .env
sudo nano /opt/traccar/log-forwarder/.env
# Add: BATCH_WEBHOOK_URL=https://deft-urban-ride-flow.base44.app/functions/batchSyncTelematicsData

# Restart
sudo systemctl restart noran-forwarder
```

The forwarder seeks to EOF on startup — it will not replay old log lines.

**Instant rollback:** Remove the `BATCH_WEBHOOK_URL` line from `.env` and restart.
The forwarder immediately reverts to real-time for all packets.

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| No heartbeat lines in Traccar log | Device may be offline or heartbeat interval too long |
| `[batch] BATCH_WEBHOOK_URL not set` | Add `BATCH_WEBHOOK_URL` to `.env` file |
| Forwarder logs FAILED | Check `BASE44_WEBHOOK_URL` and `TRACCAR_WEBHOOK_SECRET` |
| Base44 returns 401 | `TRACCAR_WEBHOOK_SECRET` mismatch |
| Base44 returns `ignored: true` | Packet hex not matching any parser — check raw hex |
| Device still shows `udp_session_status: stale` | Heartbeat not arriving within 90s window |
| `last_inbound_packet_type` still `position` | Old forwarder running alongside new one — kill old PID |

---

## GitHub Actions Cron (separate from forwarder)

Scheduled Base44 function calls are handled by GitHub Actions, not Base44
scheduled automations — saves ~2,300 credits/day. See:
- `.github/workflows/zero-credit-cron.yml` (in your GitHub repo)
- `src/docs/ZERO_CREDIT_CRON.md` (setup guide)

**Note:** The Base44 GitHub sync app cannot write to `.github/workflows/`, so
workflow changes must be made directly in your GitHub repo.