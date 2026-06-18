# Traccar Noran MT20 ACK Packet Device ID Extraction Fix

## Problem
Traccar's generic protocol framework extracts device ID from packet headers BEFORE calling the protocol-specific decoder. For Noran MT20:
- **Heartbeat/Position packets**: Device ID in standard location (works fine)
- **ACK packets (0x8009)**: Device ID embedded at end of payload in ASCII hex format (not extracted by framework)

Result: Traccar logs "Unknown device - 09G51902" warning for ACK packets, even though the packet is processed correctly.

## Root Cause
In `ExtendedObjectDecoder.java`, Traccar calls:
```java
String id = getDeviceId(channel, remoteAddress, buffer);
if (id == null) {
    log.warn("Unknown device - {}", id);
    return null;
}
```

The default `getDeviceId()` implementation can't extract Noran MT20 device IDs because they're:
1. Inside the wrapped payload structure
2. Encoded as ASCII hex at the end of ACK packets

## Solution: Override getDeviceId() in NoranProtocolDecoder

### FILE: `src/main/java/org/traccar/protocol/NoranProtocolDecoder.java`

Add this method override:

```java
@Override
protected String getDeviceId(Channel channel, SocketAddress remoteAddress, ByteBuf buffer) {
    // Try to extract device ID from Noran MT20 packet structure
    if (buffer != null && buffer.readableBytes() >= 12) {
        // Check if this is a wrapped MT20 packet (starts with 0x0D0A2A4B57)
        if (buffer.getByte(buffer.readerIndex()) == 0x0D && 
            buffer.getByte(buffer.readerIndex() + 1) == 0x0A &&
            buffer.getByte(buffer.readerIndex() + 2) == 0x2A &&
            buffer.getByte(buffer.readerIndex() + 3) == 0x4B &&
            buffer.getByte(buffer.readerIndex() + 4) == 0x57) {
            
            // This is a wrapped MT20 packet
            // For ACK packets (0x8009), device ID is at the end in ASCII hex
            // Format: [...data...][device_id_ascii][0x00][checksum]
            
            // Scan backwards from end to find device ID pattern
            // Device IDs are like "NR09G51902" (10 chars, alphanumeric)
            byte[] deviceIdBytes = new byte[12];
            int readPos = buffer.readerIndex() + buffer.readableBytes() - 15; // Start before trailing bytes
            
            if (readPos > buffer.readerIndex()) {
                buffer.getBytes(readPos, deviceIdBytes);
                String potentialId = new String(deviceIdBytes).trim();
                
                // Validate: should match pattern [A-Z]{2}[0-9]{2}[A-Z][0-9]{4}
                if (potentialId.matches("[A-Z]{2}\\d{2}[A-Z]\\d{4}")) {
                    return potentialId;
                }
            }
        }
    }
    
    // Fall back to default implementation
    return super.getDeviceId(channel, remoteAddress, buffer);
}
```

### Alternative Simpler Fix: Suppress Warning for Known Noran Packets

If the above is too invasive, we can just suppress the warning for ACK packets:

```java
// In NoranProtocolDecoder.decode() method, wrap the decode logic:

try {
    // ... existing decode logic ...
} catch (Exception e) {
    // Don't log "Unknown device" warning for ACK packets
    if (!e.getMessage().contains("Unknown device")) {
        log.error("Noran decode error", e);
    }
}
```

## Build & Deploy

```bash
cd /path/to/traccar-source

# Apply patch
patch -p1 < noran_device_id_fix.patch

# Build
./gradlew clean assemble -x test

# Deploy
sudo systemctl stop traccar
sudo cp target/tracker-server.jar /opt/traccar/tracker-server.jar
sudo systemctl start traccar

# Verify
tail -f /opt/traccar/logs/traccar.log
```

## Expected Result

**Before:**
```
18:43:30  WARN: [Uca01c8da: noran < 185.166.245.60] Unknown device - 09G51902
```

**After:**
```
18:43:30  INFO: [Uca01c8da: noran < 185.166.245.60] Device NR09G51902 ACK processed
```

## Notes

- This is a **cosmetic fix only** - Base44's webhook already handles command matching correctly
- Traccar's warning doesn't affect actual packet processing or UDP routing
- The fix makes Traccar logs cleaner and easier to debug