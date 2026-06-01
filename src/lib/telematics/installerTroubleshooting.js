export const INSTALLER_TROUBLESHOOTING = {
  device_online: 'Device must be online first. Check power, SIM, and antenna signal.',
  power_voltage_test: 'Check constant power, fuse, and ground.',
  gps_signal_test: 'Move antenna away from metal/concrete and give it sky visibility.',
  ignition_acc_test: 'Turn ignition ON. Check ACC/ignition wire.',
  lock_test: 'Check lock wire polarity. Confirm keyfob lock works.',
  unlock_test: 'Unlock should disarm. Check double-pulse or bypass if needed.',
  horn_test: 'Check horn polarity. Ground one horn wire if ground pulse is needed.',
  lights_test: 'Check light polarity and relay-isolated wiring.',
  starter_disable_test: 'Check yellow wire power. Killswitch max is 5 amps; use relay if higher.',
  starter_restore_test: 'If kill/unkill is reversed, check relay 87 and 87A.',
  green_light_off: 'Power not on. Check power and ground.',
  green_light_fast: 'Device is rebooting or SIM is out. Insert SIM and wait 2 minutes.',
  green_light_slow: 'Device is trying to acquire satellite signal.',
  ocean_location: 'Antenna likely has poor sky visibility. Avoid metal/concrete obstruction.',
};

export function getInstallerTip(testKey) {
  return INSTALLER_TROUBLESHOOTING[testKey] || 'Check wiring, power, signal, then retry.';
}

export function getInstallerChatReply(message, contextTest) {
  const text = String(message || '').toLowerCase();
  if (contextTest) return getInstallerTip(contextTest);
  if (text.includes('unlock')) return INSTALLER_TROUBLESHOOTING.unlock_test;
  if (text.includes('lock')) return INSTALLER_TROUBLESHOOTING.lock_test;
  if (text.includes('starter') || text.includes('kill')) return INSTALLER_TROUBLESHOOTING.starter_disable_test;
  if (text.includes('gps') || text.includes('ocean') || text.includes('antenna')) return INSTALLER_TROUBLESHOOTING.gps_signal_test;
  if (text.includes('power') || text.includes('green light')) return INSTALLER_TROUBLESHOOTING.power_voltage_test;
  if (text.includes('ignition') || text.includes('acc')) return INSTALLER_TROUBLESHOOTING.ignition_acc_test;
  return 'Tell me which test failed: power, GPS, ignition, lock, unlock, horn, lights, or starter.';
}