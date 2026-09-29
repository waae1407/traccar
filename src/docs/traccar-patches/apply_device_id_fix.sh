#!/bin/bash
# Traccar Noran MT20 Device ID Fix - Deployment Script
# Applies device ID extraction patch and rebuilds Traccar

set -e

echo "🔧 Traccar Noran MT20 Device ID Fix - Deployment"
echo "================================================"

# 1. Stop Traccar
echo "[1/6] Stopping Traccar service..."
sudo systemctl stop traccar

# 2. Backup current JAR
echo "[2/6] Backing up current JAR..."
sudo cp /opt/traccar/tracker-server.jar /opt/traccar/tracker-server.jar.backup.$(date +%Y%m%d_%H%M%S)

# 3. Navigate to source
echo "[3/6] Building patched version..."
cd /root/traccar || { echo "❌ Traccar source not found at /root/traccar"; exit 1; }

# 4. Apply patch (if not already applied)
if ! grep -q "getDeviceId" src/main/java/org/traccar/protocol/NoranProtocolDecoder.java; then
    echo "Applying NoranProtocolDecoder patch..."
    cat > /tmp/noran_decoder_patch.py << 'PYTHON'
import re

# Read file
with open('src/main/java/org/traccar/protocol/NoranProtocolDecoder.java', 'r') as f:
    content = f.read()

# Add getDeviceId override after class declaration
class_pattern = r'(public class NoranProtocolDecoder extends ExtendedObjectDecoder \{)'
override_method = '''\\1

    @Override
    protected String getDeviceId(Channel channel, SocketAddress remoteAddress, ByteBuf buffer) {
        // Extract device ID from Noran MT20 ACK packets (0x8009)
        if (buffer != null && buffer.readableBytes() >= 12) {
            // Check for wrapped MT20 packet marker
            if (buffer.getByte(buffer.readerIndex()) == 0x0D && 
                buffer.getByte(buffer.readerIndex() + 1) == 0x0A) {
                
                // Scan for device ID pattern at end of packet
                // Format: [...][device_id_ascii][0x00][checksum][0x0D][0x0A]
                byte[] bytes = new byte[buffer.readableBytes()];
                buffer.getBytes(buffer.readerIndex(), bytes);
                
                // Look for pattern like NR09G51902 (10 chars alphanumeric)
                for (int i = bytes.length - 15; i > 0; i--) {
                    String potential = new String(bytes, i, 10).trim();
                    if (potential.matches("[A-Z]{2}\\\\d{2}[A-Z]\\\\d{4}")) {
                        return potential;
                    }
                }
            }
        }
        return super.getDeviceId(channel, remoteAddress, buffer);
    }
'''

    content = re.sub(class_pattern, override_method, content, count=1)
    
    with open('src/main/java/org/traccar/protocol/NoranProtocolDecoder.java', 'w') as f:
        f.write(content)
    
    print("✓ Patch applied successfully")
else:
    echo "✓ Patch already applied"
fi

# 5. Build
echo "[4/6] Compiling Traccar (this takes 2-5 minutes)..."
./gradlew clean assemble -x test

# 6. Deploy
echo "[5/6] Deploying new JAR..."
sudo cp target/tracker-server.jar /opt/traccar/tracker-server.jar

# 7. Start Traccar
echo "[6/6] Starting Traccar service..."
sudo systemctl start traccar

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Monitor logs: tail -f /opt/traccar/logs/traccar.log"
echo "Check status: sudo systemctl status traccar"
echo ""
echo "Expected: No more 'Unknown device' warnings for ACK packets"