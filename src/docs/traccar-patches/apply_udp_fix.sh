#!/bin/bash
# Traccar UDP Port Fix - Automated Patch Script
# Run this script in your traccar directory

echo "=== Traccar UDP Session Port Fix ==="
echo ""

# Check if we're in the right directory
if [ ! -f "build.gradle" ]; then
    echo "ERROR: Please run this script from the traccar directory"
    echo "Example: cd ~/traccar && ./apply_udp_fix.sh"
    exit 1
fi

echo "Step 1: Backing up original files..."
cp src/main/java/org/traccar/BaseProtocolDecoder.java src/main/java/org/traccar/BaseProtocolDecoder.java.backup
cp src/main/java/org/traccar/protocol/NoranProtocolDecoder.java src/main/java/org/traccar/protocol/NoranProtocolDecoder.java.backup
echo "✓ Backups created"
echo ""

echo "Step 2: Patching BaseProtocolDecoder.java..."

# Check if file exists
if [ ! -f "src/main/java/org/traccar/BaseProtocolDecoder.java" ]; then
    echo "ERROR: BaseProtocolDecoder.java not found!"
    exit 1
fi

# FIX 1: Remove 'final' from remoteAddress field
sed -i 's/private final SocketAddress remoteAddress;/private SocketAddress remoteAddress;/' src/main/java/org/traccar/BaseProtocolDecoder.java

# FIX 2: Add setter method after getRemoteAddress method
# Find the getRemoteAddress method and add setter after it
sed -i '/public SocketAddress getRemoteAddress() {/,/^    }/a\
\
    public void setRemoteAddress(SocketAddress remoteAddress) {\
        this.remoteAddress = remoteAddress;\
    }' src/main/java/org/traccar/BaseProtocolDecoder.java

# FIX 3: Add port update logic in decode method
# Find the line with "Session session = sessions.get(channel.getId());"
# and add the port update after it
sed -i '/Session session = sessions.get(channel.getId());/a\
        if (session != null \&\& remoteAddress instanceof InetSocketAddress) {\
            session.setRemoteAddress(remoteAddress);\
        }' src/main/java/org/traccar/BaseProtocolDecoder.java

echo "✓ BaseProtocolDecoder.java patched"
echo ""

echo "Step 3: Patching NoranProtocolDecoder.java..."

# Check if file exists
if [ ! -f "src/main/java/org/traccar/protocol/NoranProtocolDecoder.java" ]; then
    echo "ERROR: NoranProtocolDecoder.java not found!"
    exit 1
fi

# FIX 4: Add GPS coordinate validation
# This is more complex, so we'll use a Python script
python3 << 'PYTHON_SCRIPT'
import re

with open('src/main/java/org/traccar/protocol/NoranProtocolDecoder.java', 'r') as f:
    content = f.read()

# Find and replace the coordinate reading pattern
old_pattern = r'double lon = buffer\.readFloat\(\);\s*double lat = buffer\.readFloat\(\);'
new_code = '''float lonRaw = buffer.readFloat();
        float latRaw = buffer.readFloat();
        
        // Validate coordinates - skip if invalid (ACK-only packet)
        if (Math.abs(lonRaw) > 180.0 || Math.abs(latRaw) > 90.0) {
            return null;
        }
        
        double lon = lonRaw;
        double lat = latRaw;'''

content = re.sub(old_pattern, new_code, content)

with open('src/main/java/org/traccar/protocol/NoranProtocolDecoder.java', 'w') as f:
    f.write(content)

print("✓ NoranProtocolDecoder.java patched")
PYTHON_SCRIPT

echo ""
echo "Step 4: Building Traccar..."
./gradlew clean build

if [ $? -eq 0 ]; then
    echo ""
    echo "=== BUILD SUCCESSFUL ==="
    echo ""
    echo "New JAR file location: build/libs/tracker-server.jar"
    echo ""
    echo "To deploy:"
    echo "  1. Stop Traccar: sudo systemctl stop traccar"
    echo "  2. Backup: sudo cp /opt/traccar/tracker-server.jar /opt/traccar/tracker-server.jar.backup"
    echo "  3. Copy: sudo cp build/libs/tracker-server.jar /opt/traccar/"
    echo "  4. Start: sudo systemctl start traccar"
    echo ""
else
    echo ""
    echo "=== BUILD FAILED ==="
    echo "Check the error messages above"
    echo "Backup files saved with .backup extension"
    exit 1
fi