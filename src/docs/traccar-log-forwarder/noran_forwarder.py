#!/usr/bin/env python3
"""
Noran MT20 Traccar Log Forwarder
=================================
Tails tracker-server.log and forwards inbound Noran device packets to
Base44 webhookLightLogForwarder in real time.

Supported inbound packet prefixes (noran < direction only):
  0f000000  — MT20 heartbeat/keepalive  → packet_type: heartbeat
  28003200  — MT20 position upload      → packet_type: position
  22000300  — MT20 alarm upload         → packet_type: alarm
  29000980  — MT20 command response     → packet_type: command_response

NOT forwarded:
  noran >   — outbound server ACK lines (e.g. 0d0a2a4b57...)

Usage:
  python3 noran_forwarder.py

Configuration:
  Set environment variables (or edit DEFAULTS below):
    TRACCAR_LOG_PATH       Path to tracker-server.log
    BASE44_WEBHOOK_URL     Full URL to Base44 webhookLightLogForwarder
    BASE44_WEBHOOK_SECRET  Shared secret (x-webhook-secret header)
    FORWARD_PROVIDER_KEY   Provider key (default: traccar_noran_mt20)

Validation mode:
  python3 noran_forwarder.py --validate
  Runs a self-test against a known heartbeat line and exits.

Requirements:
  pip3 install requests
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
    "LOG_PATH":       "/opt/traccar/logs/tracker-server.log",
    "WEBHOOK_URL":    "https://YOUR_BASE44_APP_URL/api/functions/webhookLightLogForwarder",
    "WEBHOOK_SECRET": "",
    "PROVIDER_KEY":   "traccar_noran_mt20",
}

LOG_PATH       = os.environ.get("TRACCAR_LOG_PATH",       DEFAULTS["LOG_PATH"])
WEBHOOK_URL    = os.environ.get("BASE44_WEBHOOK_URL",     DEFAULTS["WEBHOOK_URL"])
WEBHOOK_SECRET = os.environ.get("BASE44_WEBHOOK_SECRET",  DEFAULTS["WEBHOOK_SECRET"])
PROVIDER_KEY   = os.environ.get("FORWARD_PROVIDER_KEY",   DEFAULTS["PROVIDER_KEY"])

# Retry / backoff
MAX_RETRIES   = 3
RETRY_DELAY_S = 2
REQUEST_TIMEOUT_S = 8

# ── Packet type routing ────────────────────────────────────────────────────────
#
# Key   = lowercase hex prefix of the raw data field (first 8 chars = 4 bytes)
# Value = human-readable packet_type label sent in the payload
#
# 0f000000 = 0x000f in LE  → MT20 heartbeat/keepalive
# 28003200 = 0x0028 len + 0x0032 type (position upload)
# 22000300 = 0x0022 len + 0x0003 type (alarm upload)
# 29000980 = 0x0029 len + 0x8009 type (command response)
# 08000000 = 0x0008 type  → legacy position
# 00000000 = 0x0000 type  → login/handshake
#
PACKET_PREFIX_MAP = {
    "0f000000": "heartbeat",         # MT20 keepalive — primary UDP NAT refresh
    "00000000": "handshake",         # login packet
    "28003200": "position",          # new position upload (0x0032)
    "08000000": "position",          # legacy position (0x0008)
    "22000300": "alarm",             # alarm upload (0x0003)
    "29000980": "command_response",  # command response (0x8009)
}

# ── Log line regex ─────────────────────────────────────────────────────────────
#
# Matches Traccar log lines like:
#   2026-06-17 09:24:36 INFO: [U798a3519: noran < 185.166.245.60] 0f0000004e52303947353139303200
#
# Groups:
#   1  timestamp   "2026-06-17 09:24:36"
#   2  direction   "<" or ">"
#   3  source_ip   "185.166.245.60"
#   4  hex_data    "0f0000004e52303947353139303200"
#
LOG_LINE_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})"   # timestamp
    r".*?\[.*?noran\s+([<>])\s+([\d.]+)\]"        # direction + IP
    r"\s+([0-9a-fA-F]{8,})",                       # hex data (min 4 bytes)
    re.IGNORECASE
)

# ── Device ID extraction ───────────────────────────────────────────────────────
# Noran device IDs are ASCII in the hex payload: e.g. 4e52303947353139303200 → NR09G51902
# They match the pattern: 2 uppercase letters + 2 digits + alphanumeric suffix
DEVICE_ID_RE = re.compile(r"[A-Z]{2}\d{2}[A-Z0-9]{4,}", re.IGNORECASE)

def extract_device_id_from_hex(hex_data: str) -> str:
    """Decode ASCII bytes from hex and extract Noran device ID."""
    try:
        clean = hex_data.replace(" ", "").lower()
        # Pair up hex chars into bytes, keep printable ASCII (32–126)
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
    """
    Return (packet_label, prefix) if this hex line is a known inbound packet type.
    Returns (None, None) if not matched (caller should skip).
    """
    clean = hex_data.lower().replace(" ", "")
    if len(clean) < 8:
        return None, None
    prefix = clean[:8]
    label = PACKET_PREFIX_MAP.get(prefix)
    return label, prefix

# ── Forwarding ─────────────────────────────────────────────────────────────────

def build_payload(
    packet_type: str,
    hex_data: str,
    unique_id: str,
    source_ip: str,
    log_timestamp: str,
) -> dict:
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

def forward_payload(payload: dict) -> bool:
    """POST payload to Base44. Returns True on success."""
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
    """Generator: yield new lines appended to log_path (inotify-style poll)."""
    logging.info(f"[forwarder] Opening log: {log_path}")
    # Seek to end of file on startup — don't replay historical lines
    with open(log_path, "r", encoding="utf-8", errors="replace") as f:
        f.seek(0, 2)  # seek to EOF
        logging.info(f"[forwarder] Tailing from EOF. Waiting for new lines...")
        while True:
            line = f.readline()
            if line:
                yield line.rstrip("\n")
            else:
                time.sleep(0.05)

# ── Main loop ─────────────────────────────────────────────────────────────────

def process_line(line: str) -> bool:
    """
    Parse one log line, forward if it's an inbound Noran packet.
    Returns True if forwarded, False otherwise.
    """
    m = LOG_LINE_RE.search(line)
    if not m:
        return False

    ts_str, direction, source_ip, hex_data = m.groups()

    # Only forward inbound packets from device (noran <)
    if direction != "<":
        return False

    packet_type, prefix = classify_packet(hex_data)
    if not packet_type:
        return False  # unknown / unsupported packet type — skip silently

    log_timestamp = parse_log_timestamp(ts_str)
    unique_id = extract_device_id_from_hex(hex_data)

    payload = build_payload(
        packet_type=packet_type,
        hex_data=hex_data,
        unique_id=unique_id,
        source_ip=source_ip,
        log_timestamp=log_timestamp,
    )

    ok = forward_payload(payload)
    if ok:
        logging.info(
            f"[forwarder] forwarded {packet_type} {unique_id or '(no id)'} "
            f"prefix={prefix} src={source_ip} ts={log_timestamp}"
        )
    else:
        logging.error(
            f"[forwarder] FAILED to forward {packet_type} {unique_id or '(no id)'} "
            f"after {MAX_RETRIES} attempts"
        )
    return ok

def main():
    parser = argparse.ArgumentParser(description="Noran MT20 Traccar log forwarder")
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
    if not WEBHOOK_URL or WEBHOOK_URL == DEFAULTS["WEBHOOK_URL"]:
        logging.error("[forwarder] BASE44_WEBHOOK_URL is not set. Exiting.")
        sys.exit(1)
    if not WEBHOOK_SECRET:
        logging.error("[forwarder] BASE44_WEBHOOK_SECRET is not set. Exiting.")
        sys.exit(1)
    if not os.path.exists(LOG_PATH):
        logging.error(f"[forwarder] Log file not found: {LOG_PATH}. Exiting.")
        sys.exit(1)

    logging.info(f"[forwarder] Starting. Webhook: {WEBHOOK_URL}")
    logging.info(f"[forwarder] Packet types: {list(PACKET_PREFIX_MAP.keys())}")

    # Graceful shutdown on SIGTERM/SIGINT
    shutdown = {"flag": False}
    def _shutdown(sig, frame):
        logging.info("[forwarder] Shutdown signal received.")
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

    logging.info(
        f"[forwarder] Stopped. forwarded={forwarded} skipped={skipped} errors={errors}"
    )

# ── Validation / self-test ─────────────────────────────────────────────────────

VALIDATION_CASES = [
    # (label, log_line, expect_forwarded, expected_packet_type, expected_device_id_fragment)
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
    print("\n=== NORAN FORWARDER SELF-TEST ===\n")
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
        print("✓ MT20 HEARTBEAT FORWARDING COMPLETE — all self-tests passed\n")
    else:
        print("✗ REQUIRES MANUAL REVIEW — one or more self-tests failed\n")
        sys.exit(1)

if __name__ == "__main__":
    main()