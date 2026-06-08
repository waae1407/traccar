import { MT2V_DEVICE_KNOWLEDGE, getMt2vKnowledgeReply } from '@/lib/telematics/mt2vDeviceKnowledge';

export const INSTALLER_TROUBLESHOOTING = {
  device_online: `Device must be online first. For MT2V, check physical SIM, APN, DC+/GND power, ACC, and GSM antenna.\n\n${MT2V_DEVICE_KNOWLEDGE.led}`,
  power_voltage_test: `Check constant DC+ power, fuse, GND, and ACC.\n\n${MT2V_DEVICE_KNOWLEDGE.power}`,
  gps_signal_test: 'Move the GPS antenna to the roof or another clear-sky location. Avoid metal, concrete, tinted/metalized glass, and hidden dashboard locations.',
  ignition_acc_test: 'Turn ignition ON, then verify MT2V Interface 2 Pin 4 ACC is connected to the vehicle ignition/accessory wire.',
  lock_test: 'Check MT2V Interface 2 Lock In / Lock Out wiring. Confirm the vehicle keyfob lock works before testing remote lock.',
  unlock_test: 'Check MT2V Interface 2 Unlock In / Unlock Out wiring. If unlock triggers but alarm stays armed, the vehicle may need double-pulse or bypass wiring.',
  horn_test: 'Check MT2V Interface 1 Horn In / Horn Out wiring and horn relay polarity. Use relay-isolated wiring when needed.',
  lights_test: 'Check MT2V Interface 1 Light In / Light Out wiring and relay-isolated light wiring.',
  starter_disable_test: 'Check MT2V Interface 1 Kill In / Kill Out wiring. Use a proper relay for starter/fuel cut and confirm restore works before handoff.',
  starter_restore_test: 'If kill/restore is reversed, check relay wiring and make sure the restore command returns the vehicle to normal start condition.',
  green_light_off: 'Power not on. Check MT2V DC+ and GND first.',
  green_light_fast: 'Possible SIM issue. MT2V requires a physical SIM card, not eSIM. Reseat SIM and confirm SMS/data service.',
  green_light_slow: 'Device is trying to acquire GPS. Move GPS antenna to clear sky and wait for cold start lock.',
  ocean_location: 'GPS antenna likely has poor sky visibility. Move it away from metal/concrete obstruction.',
};

export function getInstallerTip(testKey) {
  return INSTALLER_TROUBLESHOOTING[testKey] || 'Check wiring, power, signal, then retry.';
}

export function getInstallerChatReply(message, contextTest) {
  const text = String(message || '').toLowerCase();
  const deviceReply = getMt2vKnowledgeReply(text);
  if (deviceReply) return deviceReply;
  if (contextTest) return `${getInstallerTip(contextTest)}\n\nYou can also ask for: wiring diagram, LED codes, SIM/eSIM support, APN setup, SMS commands, or installation checklist.`;
  if (text.includes('unlock')) return INSTALLER_TROUBLESHOOTING.unlock_test;
  if (text.includes('lock')) return INSTALLER_TROUBLESHOOTING.lock_test;
  if (text.includes('starter') || text.includes('kill')) return INSTALLER_TROUBLESHOOTING.starter_disable_test;
  if (text.includes('gps') || text.includes('ocean') || text.includes('antenna')) return INSTALLER_TROUBLESHOOTING.gps_signal_test;
  if (text.includes('power') || text.includes('green light')) return INSTALLER_TROUBLESHOOTING.power_voltage_test;
  if (text.includes('ignition') || text.includes('acc')) return INSTALLER_TROUBLESHOOTING.ignition_acc_test;
  return 'Tell me which test failed, or ask for MT2V wiring diagram, LED codes, SIM/eSIM support, APN setup, SMS commands, or installation checklist.';
}