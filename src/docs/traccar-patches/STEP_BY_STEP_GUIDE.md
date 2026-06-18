# Traccar UDP Port Fix - Complete Step-by-Step Guide

## ⚠️ BEFORE YOU START

**What this fixes:** Commands being sent to wrong port on Noran MT20 devices

**Time needed:** 30-45 minutes

**Difficulty:** Beginner-friendly (copy-paste instructions)

---

## STEP 1: DOWNLOAD TRACCAR SOURCE CODE

### Option A: Using GitHub Desktop (Easiest)

1. **Download GitHub Desktop:**
   - Go to: https://desktop.github.com/
   - Click "Download for Windows" (or Mac)
   - Install it

2. **Clone Traccar:**
   - Open GitHub Desktop
   - Click "File" → "Clone Repository"
   - Choose "URL" tab
   - Paste: `https://github.com/traccar/traccar`
   - Choose local path (e.g., `C:\Users\YourName\traccar`)
   - Click "Clone"

### Option B: Using Command Line

1. **Open Terminal/Command Prompt**

2. **Run this command:**
   ```bash
   git clone https://github.com/traccar/traccar.git
   ```

3. **Navigate to folder:**
   ```bash
   cd traccar
   ```

---

## STEP 2: INSTALL JAVA DEVELOPMENT KIT (JDK)

1. **Download JDK 11:**
   - Go to: https://adoptium.net/
   - Download "Temurin 11" for your OS
   - Install it

2. **Verify installation:**
   ```bash
   java -version
   ```
   You should see: `openjdk version "11.x.x"`

---

## STEP 3: OPEN THE FILE TO EDIT

### Find this file in your downloaded Traccar folder:

**Windows:**
```
C:\Users\YourName\traccar\src\main\java\org\traccar\protocol\BaseProtocolDecoder.java
```

**Mac/Linux:**
```
~/traccar/src/main/java/org/traccar/protocol/BaseProtocolDecoder.java
```

### Open with a text editor:
- **Recommended:** Visual Studio Code (https://code.visualstudio.com/)
- **Alternative:** Notepad++ (Windows) or TextEdit (Mac)

---

## STEP 4: MAKE THE FIRST CHANGE

### Find the `Session` class definition

**Search for this text** (Ctrl+F or Cmd+F):
```java
private static class Session
```

### You'll see something like this:

```java
private static class Session {
    private final Channel channel;
    private final SocketAddress remoteAddress;  // ← FIND THIS LINE
    private final long createTime;
    
    public Session(Channel channel, SocketAddress remoteAddress) {
        this.channel = channel;
        this.remoteAddress = remoteAddress;
        this.createTime = System.currentTimeMillis();
    }
    
    // ... other methods ...
}
```

### CHANGE 1: Remove `final` keyword

**Replace:**
```java
private final SocketAddress remoteAddress;
```

**With:**
```java
private SocketAddress remoteAddress;  // ← Removed 'final'
```

### CHANGE 2: Add setter method

**Find the closing brace `}` of the Session class** and add this method BEFORE it:

```java
public void setRemoteAddress(SocketAddress remoteAddress) {
    this.remoteAddress = remoteAddress;
}
```

### Your Session class should now look like:

```java
private static class Session {
    private final Channel channel;
    private SocketAddress remoteAddress;  // ← Changed
    private final long createTime;
    
    public Session(Channel channel, SocketAddress remoteAddress) {
        this.channel = channel;
        this.remoteAddress = remoteAddress;
        this.createTime = System.currentTimeMillis();
    }
    
    // ← ADD THIS NEW METHOD:
    public void setRemoteAddress(SocketAddress remoteAddress) {
        this.remoteAddress = remoteAddress;
    }
    
    // ... other existing methods ...
}
```

---

## STEP 5: MAKE THE SECOND CHANGE

### Find the `decode` method

**Search for:**
```java
protected Object decode(Channel channel, SocketAddress remoteAddress, Object msg)
```

### You'll see code like this:

```java
@Override
protected Object decode(Channel channel, SocketAddress remoteAddress, Object msg) throws Exception {
    ChannelBuffer buf = (ChannelBuffer) msg;
    
    // ... some existing code ...
    
    return null;
}
```

### ADD THIS LINE at the beginning of the method (after the first few lines):

```java
@Override
protected Object decode(Channel channel, SocketAddress remoteAddress, Object msg) throws Exception {
    ChannelBuffer buf = (ChannelBuffer) msg;
    
    // ← ADD THESE 5 LINES:
    Session session = sessions.get(channel.getId());
    if (session != null && remoteAddress instanceof InetSocketAddress) {
        session.setRemoteAddress(remoteAddress);
    }
    
    // ... rest of existing code ...
    
    return null;
}
```

---

## STEP 6: SAVE THE FILE

- Press **Ctrl+S** (Windows) or **Cmd+S** (Mac)
- Make sure the file is saved as `BaseProtocolDecoder.java`

---

## STEP 7: BUILD TRACCAR

### Open Terminal/Command Prompt in the Traccar folder

**Windows:**
1. Navigate to your Traccar folder
2. Hold **Shift** and **Right-click** in the folder
3. Select "Open PowerShell window here" or "Open Command Prompt here"

**Mac/Linux:**
```bash
cd ~/traccar
```

### Run the build command:

```bash
./gradlew build
```

**Windows PowerShell:**
```bash
.\gradlew.bat build
```

### Wait for build to complete (5-10 minutes)

You'll see output like:
```
> Building 79% > :compileJava
> Building 91% > :jar
BUILD SUCCESSFUL
```

### The new file will be at:
```
traccar/build/libs/tracker-server.jar
```

---

## STEP 8: BACKUP YOUR CURRENT TRACCAR

### Stop Traccar service:

**Windows:**
```bash
cd C:\Program Files\Traccar
traccar.bat stop
```

**Linux/Mac:**
```bash
sudo systemctl stop traccar
```

### Backup the old JAR file:

**Windows:**
```bash
cd C:\Program Files\Traccar
copy tracker-server.jar tracker-server.jar.backup
```

**Linux/Mac:**
```bash
cd /opt/traccar
sudo cp tracker-server.jar tracker-server.jar.backup
```

---

## STEP 9: INSTALL THE NEW VERSION

### Copy the new JAR file:

**Windows:**
```bash
copy C:\Users\YourName\traccar\build\libs\tracker-server.jar "C:\Program Files\Traccar\tracker-server.jar"
```

**Linux/Mac:**
```bash
sudo cp ~/traccar/build/libs/tracker-server.jar /opt/traccar/tracker-server.jar
```

### Set permissions (Linux/Mac only):
```bash
sudo chown traccar:traccar /opt/traccar/tracker-server.jar
sudo chmod 755 /opt/traccar/tracker-server.jar
```

---

## STEP 10: START TRACCAR AND TEST

### Start Traccar:

**Windows:**
```bash
cd C:\Program Files\Traccar
traccar.bat start
```

**Linux/Mac:**
```bash
sudo systemctl start traccar
```

### Check if it started successfully:

**Windows:**
```bash
type C:\Program Files\Traccar\logs\traccar.log
```

**Linux/Mac:**
```bash
tail -f /opt/traccar/logs/traccar.log
```

You should see:
```
INFO: Started in XXX ms
```

---

## STEP 11: VERIFY THE FIX WORKS

### 1. Send a test command to your device:

- Open Traccar web interface
- Go to the device
- Send a command (e.g., "locate")

### 2. Check the logs:

**Look for lines like:**
```
[U12345678: noran > 185.166.245.60:44483]
```

**✅ SUCCESS:** Port number matches the last heartbeat port (e.g., 44483)

**❌ FAILED:** Port is still the old cached port (e.g., 1664)

---

## TROUBLESHOOTING

### Build fails with "Java not found":
- Make sure JDK 11 is installed
- Run: `java -version` to verify

### Traccar won't start after update:
- Check logs: `/opt/traccar/logs/traccar.log`
- Restore backup: `cp tracker-server.jar.backup tracker-server.jar`

### Commands still going to wrong port:
- Verify the file was edited correctly
- Check that Traccar restarted successfully
- Look for error messages in logs

---

## NEXT STEPS IF YOU GET STUCK

1. **Take screenshots** of any error messages
2. **Check the logs** at the paths mentioned above
3. **Ask for help** on Traccar forums: https://www.traccar.org/forums/

---

## WHAT THIS FIX DOES

**Before:** Traccar remembered the port from the FIRST connection and never updated it

**After:** Traccar updates the port every time the device sends a heartbeat

**Result:** Commands are sent to the correct current port, not a stale old port