# Traccar UDP Session Port Refresh Patch
# Fixes: Commands sent to stale cached port instead of latest heartbeat port

## PROBLEM
Traccar caches UDP destination port at session creation time.
Device heartbeats arrive from new ephemeral ports, but commands are sent to old cached port.

## FILES TO PATCH

### 1. src/main/java/org/traccar/BaseProtocolDecoder.java

#### Location: decode() method (~line 150-200)

```java
// CURRENT CODE (BROKEN):
@Override
protected Object decode(Channel channel, SocketAddress remoteAddress, Object msg) throws Exception {
    // ... existing decoding logic ...
    Session session = sessions.get(channel.getId());
    // ❌ Session cachedRemoteAddress is never updated from incoming packets
    return null;
}
```

```java
// FIXED CODE:
@Override
protected Object decode(Channel channel, SocketAddress remoteAddress, Object msg) throws Exception {
    // ... existing decoding logic ...
    Session session = sessions.get(channel.getId());
    
    // ✅ CRITICAL FIX: Update session destination port from EVERY incoming packet
    if (session != null && remoteAddress instanceof InetSocketAddress) {
        session.setRemoteAddress(remoteAddress);
    }
    
    return null;
}
```

#### Location: Session class inner definition (~line 80-120)

```java
// ADD THIS METHOD to Session class:
private static class Session {
    private final Channel channel;
    private SocketAddress remoteAddress; // ✅ Make this mutable!
    private final long createTime;
    
    public Session(Channel channel, SocketAddress remoteAddress) {
        this.channel = channel;
        this.remoteAddress = remoteAddress;
        this.createTime = System.currentTimeMillis();
    }
    
    // ✅ ADD THIS METHOD:
    public void setRemoteAddress(SocketAddress remoteAddress) {
        this.remoteAddress = remoteAddress;
    }
    
    public SocketAddress getRemoteAddress() {
        return remoteAddress;
    }
    
    // ... existing methods ...
}
```

### 2. src/main/java/org/traccar/protocol/NoranProtocolDecoder.java

#### Location: decodeLastPacket() method (~line 103)

```java
// CURRENT CODE (BROKEN):
if (buf.readableBytes() >= 57) {
    newFormat = true;
    Position position = new Position(getProtocolName());
    // ❌ Assumes GPS data exists, reads garbage bytes from ACK packets
    double lon = buffer.readFloat();
    double lat = buffer.readFloat();
    // Throws "Longitude out of range" error
}
```

```java
// FIXED CODE:
if (buf.readableBytes() >= 57) {
    newFormat = true;
    Position position = new Position(getProtocolName());
    
    // ✅ ADD GPS VALIDATION CHECK:
    float lonRaw = buffer.readFloat();
    float latRaw = buffer.readFloat();
    
    // Validate coordinates before using
    if (Math.abs(lonRaw) > 180.0 || Math.abs(latRaw) > 90.0) {
        // This is an ACK packet without GPS data - skip position creation
        return null;
    }
    
    position.setLongitude(lonRaw);
    position.setLatitude(latRaw);
    // ... rest of position parsing ...
}
```

## BUILD & DEPLOY

```bash
# 1. Clone Traccar repository
git clone https://github.com/traccar/traccar.git
cd traccar

# 2. Apply the patches above to the two files

# 3. Build
./gradlew clean build

# 4. Deploy
# Stop existing Traccar service
sudo systemctl stop traccar

# Backup old JAR
sudo cp /opt/traccar/tracker-server.jar /opt/traccar/tracker-server.jar.backup

# Copy new JAR
sudo cp target/tracker-server.jar /opt/traccar/

# Restart service
sudo systemctl start traccar

# 5. Verify in logs
tail -f /opt/traccar/logs/traccar.log
# Look for: "[Uxxxxxxx: noran > IP:PORT]" with correct ephemeral ports
```

## VERIFICATION TEST

```bash
# 1. Send a command to device
curl -X POST http://localhost:5055/api/commands/send \
  -H "Authorization: Basic $(echo -n 'admin:password' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":5,"type":"custom","attributes":{"data":"<68-byte-hex>"}}'

# 2. Monitor tcpdump
sudo tcpdump -i any -n 'udp port 5053' -XX

# 3. Verify command goes to SAME port as last heartbeat
# ✅ PASS: Command destination = Last heartbeat source port
# ❌ FAIL: Command destination = Initial handshake port (stale)
```

## EXPECTED RESULT

```
# Heartbeat arrives from ephemeral port
05:44:31.688140 IP 185.166.245.60.44483 > 198.71.50.237.5053: UDP, length 15

# Command sent to SAME ephemeral port (NOT stale 1664)
05:44:36.520873 IP 198.71.50.237.5053 > 185.166.245.60.44483: UDP, length 68
                                                            ^^^^^^
                                                    ✅ CORRECT PORT!
```

## ROOT CAUSE SUMMARY

- **Bug**: `Session.remoteAddress` cached at creation, never refreshed
- **Fix**: Update `Session.remoteAddress` from every incoming packet's source
- **Impact**: Commands will be sent to device's current ephemeral port instead of stale cached port