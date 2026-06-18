# Traccar Server Hardening & Auto-Start Guide

## ✅ Pre-Flight Checklist

Before hardening, verify your current setup:

```bash
# Check if Traccar is installed
sudo systemctl status traccar

# Check Java version (should be 21)
java -version

# Verify current user
whoami
```

---

## 🔒 Step 1: Create Dedicated Traccar User (Security Isolation)

```bash
# Create a dedicated system user for Traccar (no login, no home)
sudo useradd -r -s /bin/false -d /opt/traccar traccar

# Set ownership of Traccar directory
sudo chown -R traccar:traccar /opt/traccar

# Restrict directory permissions
sudo chmod 750 /opt/traccar
sudo chmod -R go-w /opt/traccar
```

**Why:** Running Traccar as a dedicated user limits damage if the service is compromised.

---

## 🔐 Step 2: Harden systemd Service

```bash
# Edit the systemd service file
sudo nano /etc/systemd/system/traccar.service
```

**Replace with this hardened configuration:**

```ini
[Unit]
Description=Traccar GPS Tracking Server
Documentation=https://www.traccar.org/
After=network.target mysql.service mariadb.service postgresql.service
Wants=mysql.service mariadb.service postgresql.service

[Service]
Type=simple
User=traccar
Group=traccar

# Working directory
WorkingDirectory=/opt/traccar

# Main executable
ExecStart=/usr/bin/java -Djava.net.preferIPv4Stack=true -server -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -XX:InitiatingHeapOccupancyPercent=75 -Xms512m -Xmx2g -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/opt/traccar/logs/heapdump.hprof -Djava.awt.headless=true -Dfile.encoding=UTF-8 -jar tracker-server.jar

# Restart policy
Restart=on-failure
RestartSec=10
StartLimitBurst=5
StartLimitInterval=60s

# Environment
Environment="LANG=en_US.UTF-8"
Environment="LC_ALL=en_US.UTF-8"

# Security Hardening - CRITICAL
# Filesystem restrictions
ReadWritePaths=/opt/traccar/logs /opt/traccar/data
ReadOnlyPaths=/opt/traccar
ProtectHome=yes
ProtectSystem=strict
PrivateTmp=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
PrivateDevices=yes

# Network restrictions (adjust if needed)
BindReadOnlyPaths=/etc/ssl/certs/ca-certificates.crt

# Capabilities - drop all, add only what's needed
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
AmbientCapabilities=

# System call filtering
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged @resources

# No new privileges
NoNewPrivileges=yes
SecureBits=no-setuid-fixup-locked

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096
LimitCORE=infinity

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=traccar

[Install]
WantedBy=multi-user.target
```

**Reload systemd and restart:**

```bash
sudo systemctl daemon-reload
sudo systemctl stop traccar
sudo systemctl start traccar
sudo systemctl enable traccar  # Auto-start on boot
```

---

## 🛡️ Step 3: Harden traccar.xml Configuration

```bash
sudo nano /opt/traccar/traccar.xml
```

**Add/Update these security settings:**

```xml
<?xml version='1.0' encoding='UTF-8'?>
<!DOCTYPE properties SYSTEM 'http://java.sun.com/dtd/properties.dtd'>
<properties>
    <!-- Database Configuration -->
    <entry key='database.driver'>org.postgresql.Driver</entry>
    <entry key='database.url'>jdbc:postgresql://localhost:5432/traccar</entry>
    <entry key='database.user'>traccar</entry>
    <entry key='database.password'>YOUR_STRONG_PASSWORD_HERE</entry>
    
    <!-- Security Hardening -->
    <entry key='web.disableCompression'>true</entry>
    <entry key='web.sessionTimeout'>1800</entry>
    <entry key='web.maxRequestSize'>1048576</entry>
    <entry key='web.cors'>false</entry>
    
    <!-- Disable unnecessary features -->
    <entry key='web.includeHtml'>false</entry>
    <entry key='web.debug'>false</entry>
    
    <!-- API Security -->
    <entry key='api.disableHeader'>true</entry>
    <entry key='api.disabled'>false</entry>
    
    <!-- Rate Limiting -->
    <entry key='protocol.filter.enable'>true</entry>
    <entry key='protocol.filter.limit'>100</entry>
    
    <!-- Logging -->
    <entry key='logger.file'>/opt/traccar/logs/traccar.log</entry>
    <entry key='logger.level'>info</entry>
    <entry key='logger.rotate'>true</entry>
    <entry key='logger.maxFiles'>10</entry>
    <entry key='logger.maxSize'>10485760</entry>
    
    <!-- Disable registration (manage users manually) -->
    <entry key='allowRegistration'>false</entry>
    
    <!-- SSL/TLS (if using HTTPS) -->
    <!-- <entry key='web.ssl'>true</entry> -->
    <!-- <entry key='web.keyStorePath'>/opt/traccar/ssl/keystore.jks</entry> -->
    <!-- <entry key='web.keyStorePassword'>YOUR_KEYSTORE_PASSWORD</entry> -->
</properties>
```

---

## 🔥 Step 4: Configure Firewall (UFW)

```bash
# Enable UFW if not already
sudo ufw enable

# Allow SSH (CRITICAL - do this first!)
sudo ufw allow 22/tcp

# Allow Traccar ports
sudo ufw allow 5055/tcp    # Traccar web interface
sudo ufw allow 5000-5100/tcp  # Device communication ports (adjust range as needed)

# Deny all other incoming by default
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status verbose
```

---

## 📊 Step 5: Database Hardening (PostgreSQL Example)

```bash
# Connect to PostgreSQL
sudo -u postgres psql

# Create dedicated database and user
CREATE DATABASE traccar;
CREATE USER traccar WITH ENCRYPTED PASSWORD 'YOUR_STRONG_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE traccar TO traccar;
\q

# Harden PostgreSQL configuration
sudo nano /etc/postgresql/*/main/pg_hba.conf
```

**Update to require password authentication:**

```
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   traccar         traccar                                 scram-sha-256
host    traccar         traccar         127.0.0.1/32            scram-sha-256
host    traccar         traccar         ::1/128                 scram-sha-256
```

---

## 🔍 Step 6: Enable Log Rotation

```bash
sudo nano /etc/logrotate.d/traccar
```

**Add:**

```
/opt/traccar/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 traccar traccar
    postrotate
        systemctl reload traccar > /dev/null 2>&1 || true
    endscript
}
```

---

## 🧪 Step 7: Verify Hardening

```bash
# Check service status
sudo systemctl status traccar

# Verify auto-start is enabled
sudo systemctl is-enabled traccar

# Check user isolation
ps aux | grep traccar

# Verify firewall
sudo ufw status

# Test reboot simulation
sudo reboot
# After reboot, verify:
sudo systemctl status traccar
```

---

## 🚨 Step 8: Monitoring & Alerts

```bash
# Install monitoring tools
sudo apt install -y htop iotop

# Create monitoring script
sudo nano /opt/traccar/monitor.sh
```

**Add:**

```bash
#!/bin/bash
# Traccar Health Check

LOG_FILE="/opt/traccar/logs/health.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Check if service is running
if ! systemctl is-active --quiet traccar; then
    echo "[$TIMESTAMP] CRITICAL: Traccar service is DOWN" >> $LOG_FILE
    # Send alert email (configure mail first)
    # echo "Traccar is down!" | mail -s "ALERT: Traccar Down" admin@example.com
fi

# Check disk space
DISK_USAGE=$(df -h /opt/traccar | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 85 ]; then
    echo "[$TIMESTAMP] WARNING: Disk usage at ${DISK_USAGE}%" >> $LOG_FILE
fi

# Check memory
MEM_USAGE=$(free | grep Mem | awk '{printf("%.0f", $3/$2*100)}')
if [ "$MEM_USAGE" -gt 90 ]; then
    echo "[$TIMESTAMP] WARNING: Memory usage at ${MEM_USAGE}%" >> $LOG_FILE
fi
```

**Make executable and add to cron:**

```bash
sudo chmod +x /opt/traccar/monitor.sh
sudo crontab -e
# Add: */5 * * * * /opt/traccar/monitor.sh
```

---

## 🔄 Step 9: Backup Strategy

```bash
sudo nano /opt/traccar/backup.sh
```

**Add:**

```bash
#!/bin/bash
# Traccar Backup Script

BACKUP_DIR="/var/backups/traccar"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
mkdir -p $BACKUP_DIR

# Backup configuration
tar -czf $BACKUP_DIR/config_$TIMESTAMP.tar.gz /opt/traccar/traccar.xml

# Backup database (PostgreSQL example)
pg_dump -U traccar traccar > $BACKUP_DIR/database_$TIMESTAMP.sql

# Keep only last 7 days
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $TIMESTAMP"
```

**Schedule daily backups:**

```bash
sudo chmod +x /opt/traccar/backup.sh
sudo crontab -e
# Add: 0 2 * * * /opt/traccar/backup.sh
```

---

## ✅ Final Verification Checklist

- [ ] Traccar runs as dedicated `traccar` user
- [ ] Systemd service has security hardening enabled
- [ ] Firewall allows only required ports
- [ ] Database uses strong password
- [ ] Auto-start enabled (`systemctl is-enabled traccar`)
- [ ] Log rotation configured
- [ ] Monitoring script running
- [ ] Backups scheduled
- [ ] Tested reboot and verified auto-start

---

## 🆘 Troubleshooting

**Service won't start after hardening:**

```bash
# Check systemd logs
journalctl -u traccar -n 100

# Check file permissions
ls -la /opt/traccar/
ls -la /opt/traccar/logs/

# Temporarily disable hardening to isolate issue
sudo nano /etc/systemd/system/traccar.service
# Comment out security lines one by one, then:
sudo systemctl daemon-reload
sudo systemctl start traccar
```

**Permission errors:**

```bash
sudo chown -R traccar:traccar /opt/traccar
sudo chmod 750 /opt/traccar
sudo chmod -R go-w /opt/traccar
```

**Database connection errors:**

```bash
sudo systemctl status postgresql
sudo -u postgres psql -c "SELECT usename FROM pg_user WHERE usename='traccar';"
```

---

## 📚 Additional Resources

- Traccar Official Docs: https://www.traccar.org/documentation/
- systemd.exec man page: `man systemd.exec`
- PostgreSQL Security: https://www.postgresql.org/docs/current/security.html