#!/bin/bash
# Traccar Noran MT20 Ignition (ACC) Extraction Fix - Deployment Script
# Patches NoranProtocolDecoder.java to extract ACC/ignition from bEnable byte bit 1
#
# Usage:
#   cd /tmp/traccar-src && bash /path/to/apply_ignition_fix.sh
#   # then: ./gradlew clean assemble -x test && sudo cp target/tracker-server.jar /opt/traccar/

set -e

DECODER_FILE="src/main/java/org/traccar/protocol/NoranProtocolDecoder.java"

if [ ! -f "$DECODER_FILE" ]; then
    echo "❌ NoranProtocolDecoder.java not found at $DECODER_FILE"
    echo "   Run from the Traccar source root (e.g. /tmp/traccar-src)"
    exit 1
fi

echo "🔧 Traccar Noran MT20 Ignition Extraction Patch"
echo "=============================================="

# Check if patch already applied
if grep -q "KEY_IGNITION" "$DECODER_FILE"; then
    echo "✓ Patch already applied — KEY_IGNITION found in NoranProtocolDecoder.java"
    exit 0
fi

# Apply patch via Python (precise string replacement)
python3 << 'PYTHON'
import re

filepath = "src/main/java/org/traccar/protocol/NoranProtocolDecoder.java"

with open(filepath, "r") as f:
    content = f.read()

# The current line reads bEnable but only uses bit 0 for setValid, discarding the byte
old = "position.setValid(BitUtil.check(buf.readUnsignedByte(), 0));"

# Replacement: capture the full bEnable byte, use bit 0 for valid, bit 1 for ignition
new = """int bEnable = buf.readUnsignedByte();
            position.setValid(BitUtil.check(bEnable, 0));
            position.set(Position.KEY_IGNITION, BitUtil.check(bEnable, 1));"""

if old not in content:
    print("❌ Could not find target line in NoranProtocolDecoder.java")
    print("   Expected: " + old)
    print("   The file may have been modified or use a different format.")
    exit 1

content = content.replace(old, new, 1)

with open(filepath, "w") as f:
    f.write(content)

print("✓ Patch applied: bEnable bit 1 → KEY_IGNITION")
PYTHON

echo ""
echo "Next steps:"
echo "  1. Build:  ./gradlew clean assemble -x test"
echo "  2. Deploy: sudo cp target/tracker-server.jar /opt/traccar/tracker-server.jar"
echo "  3. Restart: sudo systemctl restart traccar"
echo "  4. Verify: check position attributes for 'ignition' field"