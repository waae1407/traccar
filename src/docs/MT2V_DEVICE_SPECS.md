# MT2V Car Tracker Anti-Theft Device Specifications

**Model:** MT2V (Noran/Compatible)  
**Document Version:** 1.0  
**Last Updated:** 2026-06-08

---

## 1. Hardware Specifications

### 4G/Cellular Module
- **Chip:** SIM7670G
- **LTE-FDD Bands:** B1, B2, B3, B4, B5, B7, B8, B28, B66
- **GSM/GPRS/EDGE:** 850/900/1800/1900 MHz
- **Max RF Output:** 33.0 dBm ± 2 dBm
- **Dynamic Input Range:** -15 ~ -102 dBm

### GPS Module
- **Frequency:** L1, 1575.42 MHz
- **Channels:** 20

### SIM Card
- **Type:** Physical SIM Card Slot (standard 3FF)
- **Support:** Standard SIM cards only (NOT eSIM)
- **Note:** Device will NOT work without SIM card inserted

### Battery
- **Voltage:** 3.7V Li-ion
- **Capacity:** 200~850 mAh
- **Charge Voltage:** <4.2V

### Power Input
- **Voltage Range:** DC 9~36V
- **Critical Connections:**
  - **DC+:** Vehicle positive (red wire)
  - **GND:** Vehicle ground (black wire)
  - **ACC:** Accessory/ignition (yellow wire)

### Environmental
- **Operating Temperature:** -45°C to +65°C
- **Installation Environment:** Vehicle interior (protected from water/moisture)

---

## 2. Physical Interfaces

### Interface 1 (Output Control Ports)
Controlling vehicle functions via relay signals:

| Pin | Function | Type | Purpose |
|-----|----------|------|---------|
| 1 | Horn In | Input | Trigger signal to activate horn |
| 2 | Horn Out | Output | Relay output to vehicle horn |
| 3 | Kill In | Input | Trigger signal for engine disable |
| 4 | Kill Out | Output | Relay output to disable starter |
| 5 | Light In | Input | Trigger signal for lights |
| 6 | Light Out | Output | Relay output to vehicle lights |

### Interface 2 (Power & Sensor Ports)
Power supply and vehicle sensor connections:

| Pin | Function | Voltage | Description |
|-----|----------|---------|-------------|
| 1 | DC+ | 9-36V | Vehicle power supply (positive) |
| 2 | Analog Input | 0-3.3V | Optional sensor input |
| 3 | Lock In | Digital | Central lock trigger signal |
| 4 | ACC | 12V | Accessory/ignition signal (CRITICAL) |
| 5 | Unlock In | Digital | Central unlock trigger signal |
| 6 | GND | Ground | Vehicle ground (CRITICAL) |
| 7 | SOS (Hook) | Digital | Emergency button input |
| 8 | Lock Out | Digital | Lock relay output |
| 9 | Door | Digital | Door sensor input |
| 10 | Unlock Out | Digital | Unlock relay output |

---

## 3. Connectivity & Communication

### Primary Methods
1. **4G/GPRS Network** - Real-time data transmission
2. **SMS Commands** - Device configuration via text messages
3. **GPS** - Location tracking (20-channel receiver)
4. **Bluetooth** - Lock/unlock control (optional, model-dependent)

### Network Configuration

#### APN Setup (Required for Data)
Device MUST be configured with correct APN for your IoT SIM provider:

**Common IoT APNs:**
- **1NCE IoT:** `iot.1nce.de`
- **Hologram:** `hologram`
- **China Mobile:** `cmnet`
- **China Unicom:** `uninet`

**SMS Command:** `A000000,012,{APN}`  
**Example:** `A000000,012,iot.1nce.de`

#### Server Connection
**Default Config Format:** `A000000,010,{IP},{PORT}`  
Device will attempt to connect to configured IP:PORT for real-time updates.

---

## 4. LED Status Indicators

### LED2 (Primary Status Light)

| LED Pattern | Meaning | Action Required |
|-------------|---------|-----------------|
| OFF | No Power | Check DC+ and GND connections |
| Flashes 1 sec | GSM Registered | Normal - device found network |
| Flashes 3 sec | GPS Acquiring | Normal - waiting for GPS lock (up to 30 min cold start) |
| Steady ON | Ready | GPS locked + GSM registered ✓ |
| ON 0.1s / OFF 0.1s (>3 min) | SIM Card Error | Reseat SIM card firmly in slot |

**Troubleshooting:** LED should reach "Steady ON" within 5-10 minutes in open air.

---

## 5. Installation Wiring (Critical)

### Power Connections (MUST be correct)
```
Vehicle Battery (+) → DC+ (Red)
Vehicle Battery (-) → GND (Black)
Ignition/ACC Line → ACC (Yellow)
```

### Optional Control Connections
- **Horn:** Wire to vehicle horn relay
- **Starter Kill:** Wire to fuel pump relay or starter disable circuit
- **Door Sensor:** Connect to vehicle door switch
- **Lights:** Wire to vehicle light relay

### GPS & GSM Antennas
- **GPS Antenna:** Magnetic mount on roof (clear sky view)
- **GSM Antenna:** Mount outside vehicle for best signal

---

## 6. SMS Command Format

All commands follow format: `A{PASSWORD},{CMD},{PARAM1},{PARAM2}`

**Default Password:** `000000`  
**Change Password:** `A000000,001,{NEWPASSWORD}`

### Key Commands

| CMD | Function | Example |
|-----|----------|---------|
| 000 | Location Query | `A000000,000` → Returns Google Maps link |
| 002 | Real-time Tracking Interval | `A000000,002,30` → Update every 30 sec |
| 005 | Overspeed Alarm | `A000000,005,080` → Alert if >80 km/h |
| 006 | Geo-Fence | `A000000,006,10` → 1000m boundary |
| 007 | Engine Lock/Unlock | `A000000,007,1,1` → Disable starter |
| 012 | APN Configuration | `A000000,012,iot.1nce.de` |
| 010 | Server IP & Port | `A000000,010,121.37.58.10,6903` |
| 004 | Query GPRS Settings | `A000000,004` → Returns current config |
| 099 | Device Restart | `A000000,099,RESETSYSTEM` |

---

## 7. Common Installation Issues

### No GPS Lock
- **Symptom:** LED flashing 3-second pattern after 10+ minutes
- **Cause:** GPS antenna blocked or poor sky view
- **Fix:** Move antenna to roof, clear of metal/glass obstruction

### No Network Connection
- **Symptom:** LED flashing 1-second pattern only (no 3-sec pattern)
- **Cause:** SIM card not registered, no APN configured, weak signal
- **Fix:** 
  1. Reseat SIM card
  2. Verify APN with SIM provider (SMS: `A000000,012,{APN}`)
  3. Check GSM signal strength (command 004: GSM value should be >10)

### Device Not Responding to SMS
- **Cause:** Wrong password, SIM card issues, or command format error
- **Fix:** 
  1. Reset password to default: `A000000,001,000000`
  2. Verify SIM has SMS capability enabled
  3. Ensure comma-separated format (no spaces)

### Starter Kill Not Working
- **Cause:** Wrong relay wiring, incorrect connection to starter circuit
- **Fix:** Test relay output with multimeter (pin 4 for kill output)

---

## 8. Key Constraints & Notes

✓ **Physical SIM Only** – No eSIM support  
✓ **APN Critical** – Must configure correct APN for your IoT SIM provider  
✓ **Persistent Power** – Requires continuous 12V from vehicle battery  
✓ **Open Sky GPS** – Needs 15-30 min for initial GPS lock on cold start  
✓ **SMS Authentication** – All device commands require correct password  
✓ **Update Interval** – Default 30-second tracking (configurable 15-64800 sec)  

---

## 9. Data Communications

### Traccar Protocol Support
- Device sends position, status, and alarm data via GPRS to configured server
- Compatible with Traccar GPS tracking platform
- Transmits GPS coordinates, speed, direction, ACC status, alarm types

### Supported Alarms
1. **SOS Alarm** – Emergency button pressed
2. **Overspeed Alarm** – Exceeds set speed threshold
3. **Geo-fence Alarm** – Exits configured boundary
4. **Shock Alarm** – Impact detected
5. **Power Alarm** – Low voltage detected

---

## 10. Quick Reference: Installer Checklist

- [ ] SIM card inserted (physical SIM, not eSIM)
- [ ] DC+ and GND connected correctly
- [ ] ACC line connected to ignition/accessory
- [ ] GPS antenna mounted on roof with clear sky view
- [ ] GSM antenna mounted outside vehicle
- [ ] All relay connections tested with multimeter
- [ ] Device LED showing "Steady ON" (both GPS + GSM locked)
- [ ] APN configured via SMS for IoT provider
- [ ] Server IP/Port configured (if using GPRS server)
- [ ] SMS test: `A000000,000` returns Google Maps URL
- [ ] Password changed from default (if required)

---

## References

**Device Manual:** MT2V Car Tracker Anti-Theft (Model: MT2V)  
**4G Module:** SIM7670G (SIMCom)  
**Compatible Platforms:** Traccar, custom GPS tracking servers  
**Support Documentation:** Telematics Troubleshooting Guide