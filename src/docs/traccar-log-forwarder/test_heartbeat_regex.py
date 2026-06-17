#!/usr/bin/env python3
"""Test if forwarder regex matches actual Traccar heartbeat log lines."""

import re

# Actual heartbeat log line from Traccar
TEST_LINES = [
    "2026-06-17 13:26:01  INFO: [U798a3519: noran < 185.166.245.60] 0f0000004e52303947353139303200",
    "2026-06-17 13:26:32  INFO: [U798a3519: noran < 185.166.245.60] 0f0000004e52303947353139303200",
    "2026-06-17 09:24:36 INFO: [U798a3519: noran < 185.166.245.60] 0f0000004e52303947353139303200",
]

# Current forwarder regex (line 97-102)
LOG_LINE_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})"   # timestamp
    r".*?\[.*?noran\s+([<>])\s+([\d.]+)\]"        # direction + IP
    r"\s+([0-9a-fA-F]{8,})",                       # hex data (min 4 bytes)
    re.IGNORECASE
)

PACKET_PREFIX_MAP = {
    "0f000000": "heartbeat",
    "00000000": "handshake",
    "28003200": "position",
    "08000000": "position",
    "22000300": "alarm",
    "29000980": "command_response",
}

print("=== TESTING FORWARDER REGEX AGAINST ACTUAL LOG LINES ===\n")

for i, line in enumerate(TEST_LINES, 1):
    print(f"Test {i}: {line[:80]}...")
    m = LOG_LINE_RE.search(line)
    
    if m:
        ts_str, direction, source_ip, hex_data = m.groups()
        prefix = hex_data[:8].lower()
        packet_type = PACKET_PREFIX_MAP.get(prefix, "UNKNOWN")
        
        print(f"  ✓ MATCHED")
        print(f"    timestamp: {ts_str}")
        print(f"    direction: {direction}")
        print(f"    source_ip: {source_ip}")
        print(f"    hex_data: {hex_data[:40]}...")
        print(f"    prefix: {prefix}")
        print(f"    packet_type: {packet_type}")
    else:
        print(f"  ✗ NO MATCH - regex failed!")
        
        # Debug: try simpler patterns
        simple_patterns = [
            (r"noran\s+<", "noran < pattern"),
            (r"[0-9a-fA-F]{8,}", "hex pattern"),
            (r"\d{4}-\d{2}-\d{2}", "date pattern"),
        ]
        for pattern, name in simple_patterns:
            if re.search(pattern, line):
                print(f"    ✓ {name} matches")
            else:
                print(f"    ✗ {name} FAILS")
    
    print()