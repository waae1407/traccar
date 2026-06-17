# Noran MT20 Log Forwarder — Deployment Guide

## What this does

Tails `/opt/traccar/logs/tracker-server.log` in real time and forwards inbound
Noran device packets to Base44 `webhookLightLogForwarder`.

**Newly added:** `0f000000` heartbeat lines are now forwarded, which refreshes
the Base44 UDP session freshness timestamp and auto-dispatches any commands
queued as `pending_waiting_for_fresh_session`.

## Packet types forwarded

| Hex prefix | Type             | Purpose                         |
|------------|------------------|---------------------------------|
| `0f000000` | heartbeat        | MT20 keepalive — NAT refresh ✅ NEW |
| `28003200` | position         | Position upload (0x0032)        |
| `08000000` | position         | Legacy position (0x0008)        |
| `22000300` | alarm            | Alarm upload (0x0003)           |
| `29000980` | command_response | Command ACK (0x8009)            |

**NOT forwarded:** outbound `noran >` server ACK lines.

---

## Step 1 — Install dependency

```bash
pip3 install requests
```

---

## Step 2 — Copy forwarder to server

```bash
sudo cp noran_forwarder.py /opt/traccar/noran_forwarder.py
sudo chmod +x /opt/traccar/noran_forwarder.py
```

---

## Step 3 — Run self-test (validation)

```bash
python3 /opt/traccar/noran_forwarder.py --validate
```

Expected output:
```
  [PASS] heartbeat
  [PASS] position_0032
  [PASS] alarm_0003
  [PASS] outbound_skip
  [PASS] irrelevant_line

✓ MT20 HEARTBEAT FORWARDING COMPLETE — all self-tests passed
```

If any FAIL, do not proceed.

---

## Step 4 — Set environment variables

Edit `/etc/default/noran-forwarder` (create if missing):

```bash
sudo tee /etc/default/noran-forwarder << 'EOF'
TRACCAR_LOG_PATH=/opt/traccar/logs/tracker-server.log
BASE44_WEBHOOK_URL=https://YOUR_APP_ID.base44.app/api/functions/webhookLightLogForwarder
BASE44_WEBHOOK_SECRET=YOUR_TRACCAR_WEBHOOK_SECRET
FORWARD_PROVIDER_KEY=traccar_noran_mt20
EOF
```

> Replace `YOUR_APP_ID` and `YOUR_TRACCAR_WEBHOOK_SECRET` with your actual values.
> `BASE44_WEBHOOK_SECRET` must match the `TRACCAR_WEBHOOK_SECRET` secret set in Base44.

---

## Step 5 — Install as systemd service

```bash
sudo cp noran-forwarder.service /etc/systemd/system/noran-forwarder.service
sudo systemctl daemon-reload
sudo systemctl enable noran-forwarder
sudo systemctl start noran-forwarder
```

Check status:
```bash
sudo systemctl status noran-forwarder
journalctl -u noran-forwarder -f
```

---

## Step 6 — Validation checklist

### A. Confirm heartbeat lines appear in Traccar log

```bash
tail -f /opt/traccar/logs/tracker-server.log | grep "noran <" | grep "0f000000"
```

Expected:
```
2026-06-17 09:24:36 INFO: [U798a3519: noran < 185.166.245.60] 0f0000004e52303947353139303200
```

### B. Confirm forwarder logs forwarded heartbeat

```bash
journalctl -u noran-forwarder -f
```

Expected log line:
```
forwarded heartbeat NR09G51902 prefix=0f000000 src=185.166.245.60
```

### C. Confirm Base44 device record updated

Run in Base44 exec tool or admin console:
```js
const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ unique_id: 'NR09G51902' });
return { last_inbound_packet_type: devices[0].last_inbound_packet_type, last_inbound_packet_at: devices[0].last_inbound_packet_at };
```

Expected:
```json
{ "last_inbound_packet_type": "handshake", "last_inbound_packet_at": "<current timestamp>" }
```

### D. Confirm pending command auto-dispatches on heartbeat

1. Submit a `locate` command while device is idle (will park as `pending_waiting_for_fresh_session`)
2. Wait for next heartbeat (~30s)
3. Confirm command transitions to `sent` in TelematicsCommand

### E. Confirm tcpdump shows outbound UDP after heartbeat

On the Traccar server:
```bash
sudo tcpdump -i any -nn 'udp and len > 50' -A 2>/dev/null | grep -A2 "\*KW"
```

Expected within ~2s of heartbeat:
```
*KW,NR09G51902,000,HHMMSS#
```

### F. Confirm Traccar log shows outgoing command

```bash
tail -f /opt/traccar/logs/tracker-server.log | grep "noran >"
```

Expected after auto-dispatch:
```
... [U...: noran > 185.166.245.60] 0d0a2a4b57...
```

---

## Upgrading from previous version

If you had a previous forwarder running, **stop it first**:

```bash
sudo systemctl stop noran-forwarder
```

Then replace the script file and restart:

```bash
sudo cp noran_forwarder.py /opt/traccar/noran_forwarder.py
sudo systemctl start noran-forwarder
```

The forwarder always seeks to **EOF on startup** — it will not replay old log lines.

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| No heartbeat lines in Traccar log | Device may be offline or heartbeat interval too long (should be ≤30s) |
| Forwarder logs FAILED | Check `BASE44_WEBHOOK_URL` and `BASE44_WEBHOOK_SECRET` |
| Base44 returns 401 | `BASE44_WEBHOOK_SECRET` mismatch |
| Base44 returns `ignored: true` | Packet hex not matching any parser — check raw hex |
| Device still shows `udp_session_status: stale` | Heartbeat not arriving within 90s window |
| `last_inbound_packet_type` still `position` | Old forwarder running alongside new one — kill old PID |