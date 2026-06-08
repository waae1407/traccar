export const MT2V_DEVICE_KNOWLEDGE = {
  model: 'MT2V Car Tracker Anti-Theft',
  sim: 'MT2V supports a physical SIM card only. It does not support eSIM. Use a standard physical SIM with SMS and data enabled, then configure the APN by SMS.',
  power: 'Critical power wiring: DC+ accepts 9–36V vehicle battery positive, GND is vehicle ground, and ACC must connect to ignition/accessory. If LED is off, check DC+/GND polarity and fuse first.',
  apn: 'APN command format: A000000,012,{APN}. Example for 1NCE: A000000,012,iot.1nce.de. After APN, set server with A000000,010,{IP},{PORT}, then enable GPRS with A000000,011,1.',
  led: `MT2V LED guide:
• LED off: no power — check DC+ and GND.
• 1-second flash: GSM registered.
• 3-second flash: GPS is acquiring location.
• Steady on: GSM registered and GPS locked.
• 0.1s on/off for over 3 minutes: SIM card issue — reseat SIM and confirm service.`,
  wiringDiagram: `MT2V WIRING DIAGRAM

Interface 2 — Power / Inputs
Pin 1  DC+      → Vehicle battery + (9–36V)
Pin 2  Analog   → Optional analog input
Pin 3  Lock In  → Vehicle lock trigger input
Pin 4  ACC      → Ignition/accessory wire
Pin 5  Unlock In→ Vehicle unlock trigger input
Pin 6  GND      → Vehicle ground
Pin 7  SOS      → SOS button / hook
Pin 8  Lock Out → Lock relay output
Pin 9  Door     → Door sensor input
Pin 10 Unlock Out → Unlock relay output

Interface 1 — Output Ports
Pin 1 Horn In   → Horn input
Pin 2 Horn Out  → Horn relay output
Pin 3 Kill In   → Starter/fuel cut input
Pin 4 Kill Out  → Starter/fuel cut relay output
Pin 5 Light In  → Light input
Pin 6 Light Out → Light relay output

Critical install check:
Battery + → DC+
Battery - → GND
Ignition/accessory → ACC
GPS antenna → roof / clear sky
GSM antenna → outside vehicle or clear signal area`,
  commands: `Useful MT2V SMS commands:
• Location: A000000,000
• Change password: A000000,001,{newPassword}
• Tracking interval: A000000,002,30
• Query GPRS settings: A000000,004
• Overspeed: A000000,005,080
• Geo-fence: A000000,006,10
• Starter disable: A000000,007,1,1
• Starter restore: A000000,007,1,0
• Set APN: A000000,012,{APN}
• Set server: A000000,010,{IP},{PORT}
• Enable GPRS: A000000,011,1
• Restart: A000000,099,RESETSYSTEM`,
  installChecklist: `MT2V installer checklist:
1. Insert physical SIM card.
2. Connect DC+, GND, and ACC correctly.
3. Mount GPS antenna with clear sky view.
4. Mount GSM antenna for strong signal.
5. Configure APN by SMS.
6. Configure server IP/port if needed.
7. Confirm LED reaches steady on.
8. Send location test: A000000,000.
9. Test lock, unlock, horn, lights, and starter restore.
10. Upload device, wiring, and vehicle photos.`
};

export function getMt2vKnowledgeReply(message = '') {
  const text = String(message).toLowerCase();
  if (text.includes('diagram') || text.includes('wiring') || text.includes('wire') || text.includes('pinout') || text.includes('pin out')) return MT2V_DEVICE_KNOWLEDGE.wiringDiagram;
  if (text.includes('sim') || text.includes('esim')) return MT2V_DEVICE_KNOWLEDGE.sim;
  if (text.includes('apn') || text.includes('gprs') || text.includes('server') || text.includes('port')) return MT2V_DEVICE_KNOWLEDGE.apn;
  if (text.includes('led') || text.includes('light') || text.includes('flash') || text.includes('blinking')) return MT2V_DEVICE_KNOWLEDGE.led;
  if (text.includes('sms') || text.includes('command')) return MT2V_DEVICE_KNOWLEDGE.commands;
  if (text.includes('checklist') || text.includes('steps') || text.includes('install')) return MT2V_DEVICE_KNOWLEDGE.installChecklist;
  if (text.includes('power') || text.includes('acc') || text.includes('ground') || text.includes('voltage')) return MT2V_DEVICE_KNOWLEDGE.power;
  return null;
}