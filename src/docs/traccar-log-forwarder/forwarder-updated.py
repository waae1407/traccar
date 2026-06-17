#!/usr/bin/env python3
import os
import re
import json
import time
import uuid
import requests
from datetime import datetime, timezone

ENV_FILE = "/opt/traccar/log-forwarder/.env"
HEX_RE = re.compile(r"\b[0-9a-fA-F]{40,}\b")


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


def post_heartbeat(webhook_url, secret, provider_key, device_id, raw_hex, raw_line):
    """Forward MT20 heartbeat packet to Base44."""
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
    load_env(ENV_FILE)

    webhook_url = os.getenv("BASE44_WEBHOOK_URL", "").strip()
    secret = os.getenv("TRACCAR_WEBHOOK_SECRET", "").strip()
    log_file = os.getenv("LOG_FILE", "/opt/traccar/logs/tracker-server.log").strip()
    provider_key = os.getenv("PROVIDER_KEY", "traccar_noran_mt20").strip()
    device_id = os.getenv("DEVICE_UNIQUE_ID", "NR09G00001").strip()

    if not webhook_url:
        raise RuntimeError("BASE44_WEBHOOK_URL is missing")

    if not secret:
        raise RuntimeError("TRACCAR_WEBHOOK_SECRET is missing")

    if not device_id:
        raise RuntimeError("DEVICE_UNIQUE_ID is missing")

    print(f"Starting uRideHub MT20 forwarder: {log_file}", flush=True)
    print(f"Device ID extraction: dynamic (from hex payload)", flush=True)
    print(f"Packet types: 0x0032 (position), 0x8009 (command ACK), 0x000f (heartbeat)", flush=True)

    while True:
        for line in follow_file(log_file):
            for match in HEX_RE.findall(line):
                try:
                    # Heartbeat - must check FIRST (before voltage check)
                    if ": noran <" in line and is_mt20_heartbeat_000f(match):
                        device = extract_device_id_from_hex(match) or device_id
                        result = post_heartbeat(webhook_url, secret, provider_key, device, match, line)
                        print(f"[MT20_HEARTBEAT] Forwarded heartbeat: {device} {result}", flush=True)
                        continue

                    if is_mt20_voltage_0032(match):
                        device = extract_device_id_from_hex(match) or device_id
                        result = post_packet(webhook_url, secret, provider_key, device, match)
                        print(f"Forwarded MT20 voltage packet: {device} {result}", flush=True)
                        continue

                    if ": noran <" in line and is_mt20_command_ack_8009(match):
                        device = extract_device_id_from_hex(match) or device_id
                        result = post_command_ack(webhook_url, secret, provider_key, device, match, line)
                        print(f"Forwarded MT20 command ACK packet: {device} {result}", flush=True)
                        continue

                except Exception as e:
                    print(f"Forward failed: {e}", flush=True)

        time.sleep(2)


if __name__ == "__main__":
    main()