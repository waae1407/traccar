#!/usr/bin/env python3
"""
uRideHub MT20 Forwarder v2 — Batched Off-Platform Edition
==========================================================
Source of truth: this file lives in the GitHub repo at
  src/docs/traccar-log-forwarder/forwarder.py

Deploy path on Traccar server:
  /opt/traccar/log-forwarder/forwarder.py

BATCHING STRATEGY:
  - Heartbeat (0x000f) + Voltage/Position (0x0032) → BATCHED every 5 min
  - Command ACK (0x8009) → REAL-TIME (urgent, needed for command matching)

CREDIT SAVINGS:
  Before: ~360 packets/hr × 1 credit/packet = 360 credits/hr
  After:  ~12 batch calls/hr + ~10 real-time ACKs/hr = ~22 credits/hr (94% reduction)

ENV VARS (in /opt/traccar/log-forwarder/.env):
  BASE44_WEBHOOK_URL      URL to webhookLightLogForwarder (real-time ACKs)
  BATCH_WEBHOOK_URL       URL to batchSyncTelematicsData (batched routine)
  TRACCAR_WEBHOOK_SECRET  Shared secret
  LOG_FILE                Path to tracker-server.log
  PROVIDER_KEY             Provider key (default: traccar_noran_mt20)
  DEVICE_UNIQUE_ID        Fallback device ID
  BATCH_ENABLED           "true" to enable batching (default: true)
  BATCH_INTERVAL_S        Flush interval in seconds (default: 300)
"""

import os
import re
import json
import time
import uuid
import requests
from datetime import datetime, timezone

ENV_FILE = "/opt/traccar/log-forwarder/.env"
HEX_RE = re.compile(r"\b[0-9a-fA-F]{20,}\b")

# ── Batch Configuration ────────────────────────────────────────────────────────
BATCH_ENABLED = True
BATCH_INTERVAL_S = 300  # 5 minutes
BATCH_WEBHOOK_URL = ""
BATCH_BUFFER = []
LAST_FLUSH = time.time()
BATCH_STATS = {"added": 0, "flushed": 0, "failed": 0}


def load_env(path):
    if not os.path.exists(path):
        return

    with open(path, "r") as f:
        for line in f:
            line = line.strip()

            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            os.environ[key.strip()] = value.strip().strip('"').strip("'")


def clean_hex(value):
    return re.sub(r"[^0-9a-fA-F]", "", value or "").lower()


def is_mt20_voltage_0032(hexstr):
    h = clean_hex(hexstr)

    if len(h) < 12 or len(h) % 2 != 0:
        return False

    raw = bytes.fromhex(h)

    for i in range(0, len(raw) - 6):
        packet_type = raw[i + 2] | (raw[i + 3] << 8)

        if packet_type != 0x0032:
            continue

        nbat = raw[i + 5]
        voltage = nbat / 10

        return 5 <= voltage <= 30

    return False


def extract_voltage_0032(hexstr):
    """Extract battery voltage from MT20 0x0032 position packet.
    Returns float voltage or None.
    """
    h = clean_hex(hexstr)

    if len(h) < 12 or len(h) % 2 != 0:
        return None

    raw = bytes.fromhex(h)

    for i in range(0, len(raw) - 6):
        packet_type = raw[i + 2] | (raw[i + 3] << 8)

        if packet_type != 0x0032:
            continue

        nbat = raw[i + 5]
        if nbat == 0:
            continue
        voltage = nbat / 10
        if 5 <= voltage <= 30:
            return voltage

    return None


def is_mt20_command_ack_8009(hexstr):
    h = clean_hex(hexstr)

    if len(h) < 12 or len(h) % 2 != 0:
        return False

    raw = bytes.fromhex(h)

    for i in range(0, len(raw) - 4):
        packet_type = raw[i + 2] | (raw[i + 3] << 8)

        if packet_type == 0x8009:
            return True

    return False


def is_mt20_heartbeat_000f(hexstr):
    """Detect MT20 heartbeat packet (0x000f prefix)."""
    h = clean_hex(hexstr)

    if len(h) < 8:
        return False

    # Check first 4 bytes: 0f000000 = heartbeat
    return h[:8] == "0f000000"


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def extract_device_id_from_hex(raw_hex):
    """Extract Noran device ID (e.g. NR09G51902) from hex payload ASCII bytes."""
    try:
        raw_bytes = bytes.fromhex(raw_hex.replace(" ", "").lower())
        ascii_str = "".join(chr(b) for b in raw_bytes if 32 <= b <= 126).strip()
        m = re.search(r"[A-Z]{2}\d{2}[A-Z0-9]{4,}", ascii_str, re.IGNORECASE)
        return m.group(0).upper() if m else ""
    except Exception:
        return ""


def extract_source_ip(line):
    """Extract source IP:port from Traccar log line."""
    m = re.search(r"noran\s+<\s+([\d.]+:\d+)", line)
    return m.group(1) if m else ""


# ── Real-time Forwarding (command ACKs — unchanged from original) ─────────────

def post_command_ack(webhook_url, secret, provider_key, device_id, raw_hex, raw_line):
    event_id = str(uuid.uuid4())
    timestamp = str(int(time.time()))
    packet_hex = clean_hex(raw_hex)

    payload = {
        "provider_key": provider_key,
        "event_type": "command_ack",
        "source": "traccar_log_forwarder",
        "event_id": event_id,
        "timestamp": timestamp,

        "device_unique_id": device_id,
        "unique_id": device_id,
        "device_id": device_id,
        "provider_device_id": device_id,

        "raw_log_line": raw_line.strip(),
        "packet_hex": packet_hex,
        "raw_hex": packet_hex,
        "raw_packet_hex": packet_hex,
        "message_type": "mt20_command_response_8009",
        "created_at": utc_now()
    }

    headers = {
        "Content-Type": "application/json",
        "x-telematics-secret": secret,
        "x-webhook-secret": secret,
        "x-telematics-timestamp": timestamp,
        "x-webhook-timestamp": timestamp,
        "x-telematics-event-id": event_id
    }

    response = requests.post(
        webhook_url,
        headers=headers,
        data=json.dumps(payload),
        timeout=10
    )

    response.raise_for_status()
    return response.text


# ── Batch Buffer (heartbeat + voltage/position) ───────────────────────────────

def add_to_batch(device_id, packet_type, raw_hex, source_ip, voltage=None):
    """Add routine packet to batch buffer instead of forwarding immediately."""
    BATCH_BUFFER.append({
        "device_unique_id": device_id,
        "packet_type": packet_type,
        "voltage": voltage,
        "source_ip": source_ip,
        "timestamp": utc_now(),
        "raw_hex_prefix": clean_hex(raw_hex)[:20],
    })
    BATCH_STATS["added"] += 1


def flush_batch():
    """Send batched updates to Base44 batchSyncTelematicsData function."""
    global BATCH_BUFFER, LAST_FLUSH

    if not BATCH_BUFFER:
        LAST_FLUSH = time.time()
        return True

    if not BATCH_WEBHOOK_URL:
        # Batch URL not configured — drop batch and reset timer
        print(f"[batch] BATCH_WEBHOOK_URL not set — dropping {len(BATCH_BUFFER)} entries", flush=True)
        BATCH_BUFFER = []
        LAST_FLUSH = time.time()
        return False

    # Group by device — keep latest entry per device
    device_map = {}
    for entry in BATCH_BUFFER:
        uid = entry["device_unique_id"]
        if uid not in device_map:
            device_map[uid] = entry
        else:
            # Keep the one with the latest timestamp
            if entry["timestamp"] > device_map[uid]["timestamp"]:
                device_map[uid] = entry

    payload = {
        "provider_key": os.getenv("PROVIDER_KEY", "traccar_noran_mt20").strip(),
        "batch": list(device_map.values())
    }

    secret = os.getenv("TRACCAR_WEBHOOK_SECRET", "").strip()
    headers = {
        "Content-Type": "application/json",
        "x-webhook-secret": secret,
        "x-telematics-secret": secret,
    }

    for attempt in range(1, 4):
        try:
            response = requests.post(
                BATCH_WEBHOOK_URL,
                headers=headers,
                data=json.dumps(payload),
                timeout=10
            )
            response.raise_for_status()

            unique_devices = len(device_map)
            print(
                f"[batch] Flushed {len(BATCH_BUFFER)} entries for {unique_devices} devices "
                f"(total flushed: {BATCH_STATS['flushed'] + len(BATCH_BUFFER)})", flush=True
            )
            BATCH_STATS["flushed"] += len(BATCH_BUFFER)
            BATCH_BUFFER = []
            LAST_FLUSH = time.time()
            return True

        except Exception as e:
            print(f"[batch] Flush attempt {attempt} failed: {e}", flush=True)
            if attempt < 3:
                time.sleep(2)

    BATCH_STATS["failed"] += 1
    print(f"[batch] Failed to flush {len(BATCH_BUFFER)} entries — will retry next cycle", flush=True)
    LAST_FLUSH = time.time()
    return False


# ── Log tailer (unchanged from original) ──────────────────────────────────────

def follow_file(path):
    while not os.path.exists(path):
        print(f"Waiting for log file: {path}", flush=True)
        time.sleep(5)

    with open(path, "r", errors="ignore") as f:
        f.seek(0, os.SEEK_END)
        inode = os.fstat(f.fileno()).st_ino

        while True:
            line = f.readline()

            if line:
                yield line
                continue

            time.sleep(0.5)

            try:
                current_inode = os.stat(path).st_ino
                if current_inode != inode:
                    print("Log rotated, reopening file", flush=True)
                    return
            except FileNotFoundError:
                return


def main():
    global BATCH_ENABLED, BATCH_INTERVAL_S, BATCH_WEBHOOK_URL

    load_env(ENV_FILE)

    webhook_url = os.getenv("BASE44_WEBHOOK_URL", "").strip()
    secret = os.getenv("TRACCAR_WEBHOOK_SECRET", "").strip()
    log_file = os.getenv("LOG_FILE", "/opt/traccar/logs/tracker-server.log").strip()
    provider_key = os.getenv("PROVIDER_KEY", "traccar_noran_mt20").strip()
    device_id = os.getenv("DEVICE_UNIQUE_ID", "NR09G00001").strip()

    # Batch config
    BATCH_WEBHOOK_URL = os.getenv("BATCH_WEBHOOK_URL", "").strip()
    BATCH_ENABLED = os.getenv("BATCH_ENABLED", "true").lower() == "true"
    BATCH_INTERVAL_S = int(os.getenv("BATCH_INTERVAL_S", "300"))

    if not webhook_url:
        raise RuntimeError("BASE44_WEBHOOK_URL is missing")

    if not secret:
        raise RuntimeError("TRACCAR_WEBHOOK_SECRET is missing")

    if not device_id:
        raise RuntimeError("DEVICE_UNIQUE_ID is missing")

    print(f"Starting uRideHub MT20 forwarder v2 (batched): {log_file}", flush=True)
    print(f"Device ID extraction: dynamic (from hex payload)", flush=True)
    print(f"Batch enabled: {BATCH_ENABLED}, interval: {BATCH_INTERVAL_S}s", flush=True)
    print(f"Real-time webhook: {webhook_url}", flush=True)
    print(f"Batch webhook: {BATCH_WEBHOOK_URL or '(not set — batching disabled)'}", flush=True)
    print(f"Packet types: 0x0032 (position→batch), 0x8009 (ACK→real-time), 0x000f (heartbeat→batch)", flush=True)

    while True:
        for line in follow_file(log_file):
            for match in HEX_RE.findall(line):
                try:
                    # Heartbeat — BATCH if enabled, otherwise real-time
                    if ": noran <" in line and is_mt20_heartbeat_000f(match):
                        device = extract_device_id_from_hex(match) or device_id
                        source_ip = extract_source_ip(line)

                        if BATCH_ENABLED and BATCH_WEBHOOK_URL:
                            add_to_batch(device, "heartbeat", match, source_ip)
                            # Check flush timer
                            if time.time() - LAST_FLUSH >= BATCH_INTERVAL_S:
                                flush_batch()
                        else:
                            # Fallback: real-time forward (original behavior)
                            result = post_heartbeat(webhook_url, secret, provider_key, device, match, line)
                            print(f"[MT20_HEARTBEAT] Forwarded: {device} {result}", flush=True)
                        continue

                    # Voltage/Position — BATCH if enabled, otherwise real-time
                    if is_mt20_voltage_0032(match):
                        device = extract_device_id_from_hex(match) or device_id
                        source_ip = extract_source_ip(line)

                        if BATCH_ENABLED and BATCH_WEBHOOK_URL:
                            voltage = extract_voltage_0032(match)
                            add_to_batch(device, "position", match, source_ip, voltage)
                            # Check flush timer
                            if time.time() - LAST_FLUSH >= BATCH_INTERVAL_S:
                                flush_batch()
                        else:
                            # Fallback: real-time forward (original behavior)
                            result = post_packet(webhook_url, secret, provider_key, device, match)
                            print(f"Forwarded MT20 voltage packet: {device} {result}", flush=True)
                        continue

                    # Command ACK — ALWAYS real-time (urgent for command matching)
                    if ": noran <" in line and is_mt20_command_ack_8009(match):
                        device = extract_device_id_from_hex(match) or device_id
                        result = post_command_ack(webhook_url, secret, provider_key, device, match, line)
                        print(f"Forwarded MT20 command ACK packet: {device} {result}", flush=True)
                        continue

                except Exception as e:
                    print(f"Forward failed: {e}", flush=True)

            # Check flush timer on every line read (catches quiet periods)
            if BATCH_ENABLED and BATCH_BUFFER and time.time() - LAST_FLUSH >= BATCH_INTERVAL_S:
                flush_batch()

        # Flush on log rotation
        if BATCH_ENABLED and BATCH_BUFFER:
            flush_batch()
        time.sleep(2)


# ── Original real-time functions (kept as fallback when batching is disabled) ─

def post_packet(webhook_url, secret, provider_key, device_id, raw_hex):
    event_id = str(uuid.uuid4())
    timestamp = str(int(time.time()))
    packet_hex = clean_hex(raw_hex)

    payload = {
        "provider_key": provider_key,
        "event_type": "location_update",
        "event_id": event_id,
        "timestamp": timestamp,

        "device_unique_id": device_id,
        "unique_id": device_id,
        "device_id": device_id,
        "provider_device_id": device_id,

        "packet_hex": packet_hex,
        "raw_hex": packet_hex,
        "raw_packet_hex": packet_hex,
        "message_type": "mt20_voltage_0032",
        "created_at": utc_now()
    }

    headers = {
        "Content-Type": "application/json",
        "x-telematics-secret": secret,
        "x-webhook-secret": secret,
        "x-telematics-timestamp": timestamp,
        "x-webhook-timestamp": timestamp,
        "x-telematics-event-id": event_id
    }

    response = requests.post(
        webhook_url,
        headers=headers,
        data=json.dumps(payload),
        timeout=10
    )

    response.raise_for_status()
    return response.text


def post_heartbeat(webhook_url, secret, provider_key, device_id, raw_hex, raw_line):
    """Forward MT20 heartbeat packet to Base44 (fallback when batching disabled)."""
    event_id = str(uuid.uuid4())
    timestamp = str(int(time.time()))
    packet_hex = clean_hex(raw_hex)

    payload = {
        "provider_key": provider_key,
        "event_type": "mt20_heartbeat_forwarded_log",
        "source": "traccar_log_forwarder",
        "event_id": event_id,
        "timestamp": timestamp,
        "packet_type": "0x000f",

        "device_unique_id": device_id,
        "unique_id": device_id,
        "device_id": device_id,
        "provider_device_id": device_id,

        "raw_log_line": raw_line.strip(),
        "packet_hex": packet_hex,
        "raw_hex": packet_hex,
        "raw_packet_hex": packet_hex,
        "message_type": "mt20_heartbeat",
        "created_at": utc_now()
    }

    headers = {
        "Content-Type": "application/json",
        "x-telematics-secret": secret,
        "x-webhook-secret": secret,
        "x-telematics-timestamp": timestamp,
        "x-webhook-timestamp": timestamp,
        "x-telematics-event-id": event_id
    }

    response = requests.post(
        webhook_url,
        headers=headers,
        data=json.dumps(payload),
        timeout=10
    )

    response.raise_for_status()
    return response.text


if __name__ == "__main__":
    main()