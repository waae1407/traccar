# Ignition Fix — Server Deployment Guide

## Prerequisites

- SSH access to the Traccar server
- Traccar source already cloned at `/tmp/traccar-src` (from prior patches)
- If not, clone it first:
  ```bash
  cd /tmp && git clone https://github.com/traccar/traccar.git traccar-src
  ```

---

## Step 1: Get the Patch Script onto the Server

### Option A: Copy-paste (fastest)

SSH into the server, then create the file directly:

```bash
ssh user@your-traccar-server
```

Once in, paste this entire block at once:

```bash
cat > /tmp/apply_ignition_fix.sh << 'SCRIPT'
#!/bin/bash
set -e
DECODER_FILE="src/main/java/org/traccar/protocol/NoranProtocolDecoder.java"
cd /tmp/traccar-src

if [ ! -f "$DECODER_FILE" ]; then
    echo "❌ Run from Traccar source root"; exit 1
fi

if grep -q "KEY_IGNITION" "$DECODER_FILE"; then
    echo "✓ Already patched"; exit 0
fi

python3 << 'PY'
f = "src/main/java/org/traccar/protocol/NoranProtocolDecoder.java"
c = open(f).read()
old = "position.setValid(BitUtil.check(buf.readUnsignedByte(), 0));"
new = """int bEnable = buf.readUnsignedByte();
            position.setValid(BitUtil.check(bEnable, 0));
            position.set(Position.KEY_IGNITION, BitUtil.check(bEnable, 1));"""
assert old in c, "Target line not found — file may differ"
open(f, "w").write(c.replace(old, new, 1))
print("✓ Patched: bEnable bit 1 → KEY_IGNITION")
PY
SCRIPT
chmod +x /tmp/apply_ignition_fix.sh
```

### Option B: SCP from your machine

If you have the script file locally:

```bash
# From your local machine:
scp src/docs/traccar-patches/apply_ignition_fix.sh user@your-traccar-server:/tmp/
```

### Option C: Download from GitHub (if repo is synced)

```bash
ssh user@your-traccar-server
curl -sL https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/main/src/docs/traccar-patches/apply_ignition_fix.sh -o /tmp/apply_ignition_fix.sh
chmod +x /tmp/apply_ignition_fix.sh
```

---

## Step 2: Apply the Patch

```bash
cd /tmp/traccar-src
bash /tmp/apply_ignition_fix.sh
```

You should see: `✓ Patched: bEnable bit 1 → KEY_IGNITION`

---

## Step 3: Build

```bash
cd /tmp/traccar-src
./gradlew clean assemble -x test
```

Takes 2–5 minutes. Look for `BUILD SUCCESSFUL`.

The JAR will be at: `/tmp/traccar-src/target/tracker-server.jar`

> **Note:** Some Traccar versions output to `build/libs/` instead of `target/`. Check both:
> ```bash
> ls -la /tmp/traccar-src/target/tracker-server.jar 2>/dev/null || ls -la /tmp/traccar-src/build/libs/tracker-server.jar
> ```

---

## Step 4: Backup & Deploy

```bash
# Stop Traccar
sudo systemctl stop traccar

# Backup current JAR
sudo cp /opt/traccar/tracker-server.jar /opt/traccar/tracker-server.jar.backup.$(date +%Y%m%d_%H%M%S)

# Copy new JAR (adjust path if yours is in build/libs/)
sudo cp /tmp/traccar-src/target/tracker-server.jar /opt/traccar/tracker-server.jar

# Fix permissions
sudo chown traccar:traccar /opt/traccar/tracker-server.jar
sudo chmod 755 /opt/traccar/tracker-server.jar

# Start Traccar
sudo systemctl start traccar
```

---

## Step 5: Verify

### Check Traccar started cleanly

```bash
sudo systemctl status traccar
tail -20 /opt/traccar/logs/traccar.log
```

Look for `Started in XXX ms` with no errors.

### Check that ignition now appears in position data

```bash
# Replace USER:PASS with your Traccar credentials
curl -s -u USER:PASS 'http://localhost:8082/api/positions?deviceId=2' | python3 -m json.tool | grep ignition
```

**Before patch:** no `ignition` field in output.
**After patch:** `"ignition": true` (or `false`) appears in attributes.

### Verify in Base44

Wait for the next sync cycle (15 min), or trigger manually:

```bash
curl -s -X POST 'https://deft-urban-ride-flow.base44.app/api/functions/syncTraccarDevicePositions' \
  -H 'Content-Type: application/json' \
  -H 'x-cron-secret: YOUR_CRON_SECRET' \
  -d '{}'
```

Then check the device record — `ignition_status` should now reflect real ACC, not motion.

---

## Rollback (if something breaks)

```bash
sudo systemctl stop traccar
# Find your backup
ls -t /opt/traccar/tracker-server.jar.backup.* | head -1
# Restore it
sudo cp $(ls -t /opt/traccar/tracker-server.jar.backup.* | head -1) /opt/traccar/tracker-server.jar
sudo systemctl start traccar
```

---

## Quick Reference (all-in-one)

If you're already SSH'd in and `/tmp/traccar-src` exists:

```bash
# 1. Patch
cd /tmp/traccar-src && python3 -c "
f='src/main/java/org/traccar/protocol/NoranProtocolDecoder.java'
c=open(f).read()
old='position.setValid(BitUtil.check(buf.readUnsignedByte(), 0));'
new='int bEnable = buf.readUnsignedByte();\n            position.setValid(BitUtil.check(bEnable, 0));\n            position.set(Position.KEY_IGNITION, BitUtil.check(bEnable, 1));'
open(f,'w').write(c.replace(old,new,1))
print('done')
"

# 2. Build
./gradlew clean assemble -x test

# 3. Deploy
sudo systemctl stop traccar
sudo cp /opt/traccar/tracker-server.jar /opt/traccar/tracker-server.jar.bak
sudo cp target/tracker-server.jar /opt/traccar/tracker-server.jar
sudo systemctl start traccar
``