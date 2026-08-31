#!/usr/bin/env python3
"""
Noran MT20 Traccar Log Forwarder v2 — Batched Off-Platform Edition
=================================================================
Tails tracker-server.log and processes Noran MT20 packets locally,
batching routine telemetry (heartbeat + position) into 5-minute flushes
to a single Base44 batch endpoint.

Command responses and alarms are still forwarded in real-time to
webhookLightLogForwarder (low volume, urgent).

CREDIT SAVINGS:
  Before: ~360 packets/hr × 1 credit/packet = 360 credits/hr
  After:  ~12 batch calls/hr × 1 credit/call = 12 credits/hr (97% reduction)
  Plus:   ~10 command/alarm forwards/hr × 1 credit = 10 credits/hr

Supported inbound packet prefixes (noran < direction only):
  0f000000  — MT20 heartbeat/keepalive  → BATCHED (routine)
  28003200  — MT20 position upload        → BATCHED (routine, voltage extracted)
  08000000  — MT20 legacy position        → BATCHED (routine)
  00000000  — MT20 handshake              → BATCHED (routine)
  22000300  — MT20 alarm upload           → REAL-TIME (urgent)
  29000980  — MT20 command response       → REAL-TIME (urgent)

Usage:
  python3 noran_forwarder.py

Configuration (environment variables):
  TRACCAR_LOG_PATH       Path to tracker-server.log
  BASE44_WEBHOOK_URL     URL to webhookLightLogForwarder (real-time)
  BATCH_WEBHOOK_URL      URL to batchSyncTelematicsData (batched)
  BASE44_WEBHOOK_SECRET  Shared secret (x-webhook-secret header)
  FORWARD_PROVIDER_KEY   Provider key (default: traccar_noran_mt20)
  BATCH_ENABLED          "true" to enable batching (default: true)
  BATCH_INTERVAL_S       Batch flush interval in seconds (default: 300)

Validation mode:
  python3 noran_forwarder.py --validate
"""

import os
import re
import sys
import time
import json
import signal
import logging
import argparse
import requests
from datetime import datetime, timezone

# ── Configuration ──────────────────────────────────────────────────────────────

DEFAULTS = {
    "LOG_PATH":          "/opt/traccar/logs/tracker-server.log",
    "WEBHOOK_URL":       "https://YOUR_BASE44_APP_URL/api/functions/webhookLightLogForwarder",
    "BATCH_WEBHOOK_URL": "https://YOUR_BASE44_APP_URL/api/functions/batchSyncTelematicsData",
    "WEBHOOK_SECRET":    "",
    "PROVIDER_KEY":      "traccar_noran_mt20",
}

LOG_PATH          = os.environ.get("TRACCAR_LOG_PATH",       DEFAULTS["LOG_PATH"])
WEBHOOK_URL       = os.environ.get("BASE44_WEBHOOK_URL",     DEFAULTS["WEBHOOK_URL"])
BATCH_WEBHOOK_URL = os.environ.get("BATCH_WEBHOOK_URL",      DEFAULTS["BATCH_WEBHOOK_URL"])
WEBHOOK_SECRET    = os.environ.get("BASE44_WEBHOOK_SECRET",  DEFAULTS["WEBHOOK_SECRET"])
PROVIDER_KEY      = os.environ.get("FORWARD_PROVIDER_KEY",   DEFAULTS["PROVIDER_KEY"])

# Batching config
BATCH_ENABLED  = os.environ.get("BATCH_ENABLED", "true").lower() == "true"
BATCH_INTERVAL_S = int(os.environ.get("BATCH_INTERVAL_S", "300"))  # 5 minutes

# Retry / backoff
MAX_RETRIES   = 3
RETRY_DELAY_S = 2
REQUEST_TIMEOUT_S = 8

# ── Packet type routing ────────────────────────────────────────────────────────

PACKET_PREFIX_MAP = {
    "0f000000": "heartbeat",         # MT20 keepalive — primary UDP NAT refresh
    "00000000": "handshake",         # login packet
    "28003200": "position",          # new position upload (0x0032)
    "08000000": "position",          # legacy position (0x0008)
    "22000300": "alarm",             # alarm upload (0x0003)
    "29000980": "command_response",  # command response (0x8009)
}

# Packet types that MUST be forwarded in real-time (low volume, urgent)
REALTIME_PACKET_TYPES = {"command_response", "alarm"}

# ── Log line regex ─────────────────────────────────────────────────────────────

LOG_LINE_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})"
    r".*?\[.*?noran\s+([<>])\s+([\d.]+)\]"
    r"\s+([0-9a-fA-F]{8,})",
    re.IGNORECASE
)

DEVICE_ID_RE = re.compile(r"[A-Z]{2}\d{2}[A-Z0-9]{4,}", re.IGNORECASE)

# ── MT20 Protocol Parsing (ported from webhookLightLogForwarder) ──────────────

def extract_device_id_from_hex(hex_data: str) -> str:
    """Decode ASCII bytes from hex and extract Noran device ID."""
    try:
        clean = hex_data.replace(" ", "").lower()
        raw_bytes = bytes.fromhex(clean)
        ascii_str = "".join(
            chr(b) for b in raw_bytes if 32 <= b <= 126
        ).strip()
        m = DEVICE_ID_RE.search(ascii_str)
        return m.group(0).upper() if m else ""
    except Exception:
        return ""

def parse_log_timestamp(ts_str: str) -> str:
    """Convert 'YYYY-MM-DD HH:MM:SS' (assumed UTC from Traccar) to ISO 8601."""
    try:
        dt = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        return dt.isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()

def classify_packet(hex_data: str):
    """Return (packet_label, prefix) if known inbound packet type."""
    clean = hex_data.lower().replace(" ", "")
    if len(clean) < 8:
        return None, None
    prefix = clean[:8]
    label = PACKET_PREFIX_MAP.get(prefix)
    return label, prefix

def extract_voltage_0032(hex_data: str):
    """
    Extract battery voltage from MT20 0x0032 position packet.
    Packet format: [len_lo][len_hi][0x32][0x00][bEnable][nBAT]...
    nBAT byte at offset +5 from packet start, voltage = nBAT / 10.
    Returns float voltage or None.
    """
    try:
        clean = hex_data.lower().replace(" ", "")
        raw = bytes.fromhex(clean)
        # Scan for 0x0032 packet type at offset +2 (after 2-byte length prefix)
        for i in range(len(raw) - 6):
            if raw[i+2] == 0x32 and raw[i+3] == 0x00:
                nbat = raw[i+5]
                if nbat == 0:
                    continue
                voltage = nbat / 10
                if 5 <= voltage <= 30:
                    return voltage
        return None
    except Exception:
        return None

# ── Batch Buffer ───────────────────────────────────────────────────────────────

batch_buffer = []
last_flush_time = time.time()
batch_stats = {"added": 0, "flushed": 0, "failed": 0}

def add_to_batch(packet_type, hex_data, unique_id, source_ip, log_timestamp):
    """Add routine packet to batch buffer instead of forwarding immediately."""
    voltage = None
    if packet_type == "position":
        voltage = extract_voltage_0032(hex_data)

    batch_buffer.append({
        "device_unique_id": unique_id,
        "packet_type": packet_type,
        "voltage": voltage,
        "source_ip": source_ip,
        "timestamp": log_timestamp,
        "raw_hex_prefix": hex_data[:20],
    })
    batch_stats["added"] += 1

def flush_batch(force=False):
    """Send batched updates to Base44 batchSyncTelematicsData function."""
    global batch_buffer, last_flush_time
    if not batch_buffer:
        last_flush_time = time.time()
        return True

    payload = {
        "provider_key": PROVIDER_KEY,
        "batch": batch_buffer,
    }

    ok = forward_batch(payload)
    if ok:
        unique_devices = len(set(e["device_unique_id"] for e in batch_buffer if e["device_unique_id"]))
        logging.info(
            f"[batch] Flushed {len(batch_buffer)} entries for {unique_devices} devices "
            f"(total flushed: {batch_stats['flushed'] + len(batch_buffer)})"
        )
        batch_stats["flushed"] += len(batch_buffer)
        batch_buffer = []
        last_flush_time = time.time()
        return True
    else:
        batch_stats["failed"] += 1
        logging.error(f"[batch] Failed to flush {len(batch_buffer)} entries (will retry next cycle)")
        # Don't clear buffer — retry next cycle
        last_flush_time = time.time()
        return False

def forward_batch(payload):
    """POST batch to Base44 batchSyncTelematicsData."""
    headers = {
        "Content-Type": "application/json",
        "x-webhook-secret": WEBHOOK_SECRET,
        "x-telematics-secret": WEBHOOK_SECRET,
    }
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.post(
                BATCH_WEBHOOK_URL,
                json=payload,
                headers=headers,
                timeout=REQUEST_TIMEOUT_S,
            )
            if resp.status_code in (200, 201):
                return True
            logging.warning(
                f"[batch] HTTP {resp.status_code} on attempt {attempt}: {resp.text[:200]}"
            )
        except requests.exceptions.RequestException as e:
            logging.warning(f"[batch] Request error attempt {attempt}: {e}")
        if attempt < MAX_RETRIES:
            time.sleep(RETRY_DELAY_S)
    return False

# ── Real-time Forwarding (command responses + alarms) ─────────────────────────

def build_payload(packet_type, hex_data, unique_id, source_ip, log_timestamp):
    return {
        "provider_key":       PROVIDER_KEY,
        "packet_type":        packet_type,
        "raw_packet_hex":     hex_data,
        "device_unique_id":   unique_id,
        "unique_id":          unique_id,
        "source_ip":          source_ip,
        "log_timestamp":      log_timestamp,
        "timestamp":          log_timestamp,
        "source":             "traccar_log_forwarder",
        "event_type":         f"mt20_{packet_type}_forwarded_log",
    }

def forward_payload(payload):
    """POST payload to Base44 webhookLightLogForwarder (real-time)."""
    headers = {
        "Content-Type":      "application/json",
        "x-webhook-secret":  WEBHOOK_SECRET,
        "x-telematics-secret": WEBHOOK_SECRET,
    }
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.post(
                WEBHOOK_URL,
                json=payload,
                headers=headers,
                timeout=REQUEST_TIMEOUT_S,
            )
            if resp.status_code in (200, 201):
                return True
            logging.warning(
                f"[forwarder] HTTP {resp.status_code} on attempt {attempt}: {resp.text[:200]}"
            )
        except requests.exceptions.RequestException as e:
            logging.warning(f"[forwarder] Request error attempt {attempt}: {e}")
        if attempt < MAX_RETRIES:
            time.sleep(RETRY_DELAY_S)
    return False

# ── Log tailer ─────────────────────────────────────────────────────────────────

def tail_log(log_path: str):
    logging.info(f"[forwarder] Opening log: {log_path}")
    with open(log_path, "r", encoding="utf-8", errors="replace") as f:
        f.seek(0, 2)
        logging.info(f"[forwarder] Tailing from EOF. Waiting for new lines...")
        while True:
            line = f.readline()
            if line:
                yield line.rstrip("\n")
            else:
                time.sleep(0.05)

# ── Main loop ─────────────────────────────────────────────────────────────────

def process_line(line: str) -> bool:
    m = LOG_LINE_RE.search(line)
    if not m:
        return False

    ts_str, direction, source_ip, hex_data = m.groups()
    if direction != "<":
        return False

    packet_type, prefix = classify_packet(hex_data)
    if not packet_type:
        return False

    log_timestamp = parse_log_timestamp(ts_str)
    unique_id = extract_device_id_from_hex(hex_data)

    # ── BATCH PATH: routine packets (heartbeat, position, handshake) ──
    # These are high-volume (~120/hr per device) and don't need real-time processing.
    # Buffer locally and flush every BATCH_INTERVAL_S seconds.
    if BATCH_ENABLED and packet_type not in REALTIME_PACKET_TYPES:
        add_to_batch(packet_type, hex_data, unique_id, source_ip, log_timestamp)

        # Check if it's time to flush
        if time.time() - last_flush_time >= BATCH_INTERVAL_S:
            flush_batch()

        return True

    # ── REAL-TIME PATH: urgent packets (command_response, alarm) ──
    # These are low-volume and need immediate processing for command matching
    # and safety alert generation.
    payload = build_payload(packet_type, hex_data, unique_id, source_ip, log_timestamp)
    ok = forward_payload(payload)
    if ok:
        logging.info(
            f"[realtime] {packet_type} {unique_id or '(no id)'} "
            f"prefix={prefix} src={source_ip} ts={log_timestamp}"
        )
    else:
        logging.error(
            f"[realtime] FAILED to forward {packet_type} {unique_id or '(no id)'} "
            f"after {MAX_RETRIES} attempts"
        )
    return ok

def main():
    parser = argparse.ArgumentParser(description="Noran MT20 Traccar log forwarder v2 (batched)")
    parser.add_argument("--validate", action="store_true", help="Run self-test and exit")
    parser.add_argument("--log-level", default="INFO", help="Logging level (DEBUG/INFO/WARNING)")
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    if args.validate:
        run_validation()
        return

    # Config checks
    if not WEBHOOK_SECRET:
        logging.error("[forwarder] BASE44_WEBHOOK_SECRET is not set. Exiting.")
        sys.exit(1)
    if not os.path.exists(LOG_PATH):
        logging.error(f"[forwarder] Log file not found: {LOG_PATH}. Exiting.")
        sys.exit(1)

    logging.info(f"[forwarder] Starting v2 (batched). Batch enabled: {BATCH_ENABLED}")
    logging.info(f"[forwarder] Real-time webhook: {WEBHOOK_URL}")
    logging.info(f"[forwarder] Batch webhook: {BATCH_WEBHOOK_URL}")
    logging.info(f"[forwarder] Batch interval: {BATCH_INTERVAL_S}s")
    logging.info(f"[forwarder] Real-time types: {REALTIME_PACKET_TYPES}")

    # Graceful shutdown on SIGTERM/SIGINT — flush batch before exit
    shutdown = {"flag": False}
    def _shutdown(sig, frame):
        logging.info("[forwarder] Shutdown signal received. Flushing batch...")
        if batch_buffer:
            flush_batch(force=True)
        shutdown["flag"] = True
    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    forwarded = 0
    skipped = 0
    errors = 0

    for line in tail_log(LOG_PATH):
        if shutdown["flag"]:
            break
        try:
            ok = process_line(line)
            if ok:
                forwarded += 1
            else:
                skipped += 1
        except Exception as e:
            errors += 1
            logging.exception(f"[forwarder] Unhandled error on line: {e}")

    # Final flush on exit
    if batch_buffer:
        logging.info(f"[forwarder] Final flush of {len(batch_buffer)} batched entries...")
        flush_batch(force=True)

    logging.info(
        f"[forwarder] Stopped. forwarded={forwarded} skipped={skipped} errors={errors} "
        f"batch_stats={batch_stats}"
    )

# ── Validation / self-test ─────────────────────────────────────────────────────

VALIDATION_CASES = [
    (
        "heartbeat",
        "2026-06-17 09:24:36 INFO: [U798a3519: noran < 185.166.245.60] 0f0000004e52303947353139303200",
        True, "heartbeat", "NR09G51902",
    ),
    (
        "handshake",
        "2026-06-17 09:20:00 INFO: [U798a3519: noran < 185.166.245.60] 000000004e52303947303030303100",
        True, "handshake", "NR09G00001",
    ),
    (
        "position_0032",
        "2026-06-17 09:25:10 INFO: [U798a3519: noran < 185.166.245.60] 28003200640064000000000000000000000000000000000000000000000000000000000000000000004e52303947353139303200",
        True, "position", "NR09G51902",
    ),
    (
        "alarm_0003",
        "2026-06-17 09:26:00 INFO: [U798a3519: noran < 185.166.245.60] 220003004e52303947353139303200000000000000000000000000000000000000",
        True, "alarm", "NR09G51902",
    ),
    (
        "outbound_skip",
        "2026-06-17 09:24:36 INFO: [U798a3519: noran > 185.166.245.60] 0d0a2a4b57000d000080010d0a",
        False, None, None,
    ),
    (
        "irrelevant_line",
        "2026-06-17 09:24:36 INFO: Some other log line without noran pattern",
        False, None, None,
    ),
]

def run_validation():
    print("\n=== NORAN FORWARDER v2 SELF-TEST ===\n")
    all_pass = True

    for label, line, expect_forward, expected_type, expected_device in VALIDATION_CASES:
        m = LOG_LINE_RE.search(line)
        matched = m is not None
        direction = m.group(2) if m else None
        hex_data = m.group(4) if m else None
        ts_str = m.group(1) if m else None
        source_ip = m.group(3) if m else None

        is_inbound = matched and direction == "<"
        packet_type, prefix = classify_packet(hex_data) if hex_data else (None, None)
        would_forward = is_inbound and packet_type is not None

        device_id = extract_device_id_from_hex(hex_data) if hex_data else ""

        ok = would_forward == expect_forward
        if ok and expected_type:
            ok = ok and (packet_type == expected_type)
        if ok and expected_device:
            ok = ok and (expected_device in device_id)

        # Test voltage extraction for position packet
        if label == "position_0032" and hex_data:
            voltage = extract_voltage_0032(hex_data)
            if voltage is not None:
                print(f"         voltage extracted: {voltage}V")
            else:
                print(f"         voltage: None (no valid nBAT byte in test vector)")

        status = "PASS" if ok else "FAIL"
        if not ok:
            all_pass = False

        print(f"  [{status}] {label}")
        print(f"         regex_match={matched}  inbound={is_inbound}  "
              f"packet_type={packet_type!r}  device_id={device_id!r}")
        if not ok:
            print(f"         EXPECTED: forward={expect_forward}  "
                  f"type={expected_type!r}  device={expected_device!r}")
        print()

    if all_pass:
        print("✓ FORWARDER v2 VALIDATION COMPLETE — all self-tests passed")
        print("  Batch mode: routine packets buffered, flushed every 300s")
        print("  Real-time mode: command_response + alarm forwarded immediately")
        print()
    else:
        print("✗ REQUIRES MANUAL REVIEW — one or more self-tests failed\n")
        sys.exit(1)

if __name__ == "__main__":
    main()