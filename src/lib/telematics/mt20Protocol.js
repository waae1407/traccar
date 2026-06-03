// Noran MT20 Protocol Reference Library
// Status: standalone reference only — not wired into production command paths.
// See docs/MT20_PROTOCOL_LOCK.md before changing any tested/working MT20 implementation.

export const MT20_PROTOCOL_VERSION = 'GPS/GPRS Tracker Protocol V1.3 for MT20';

export const MT20_COMMAND_IDS = Object.freeze({
  handshakeRequest: 0x0000,
  controlCommand: 0x0002,
  alarmUpload: 0x0003,
  positionUpload: 0x0008,
  commandResponse: 0x8009,
  newPositionUpload: 0x0032,
  bluetoothQuery: 0x0038,
});

export const MT20_CONTROL_CODES = Object.freeze({
  getPosition: '000',
  changePassword: '001',
  realtimeInterval: '002',
  telephoneSet: '003',
  overspeed: '005',
  geofence: '006',
  engineLockHornLight: '007',
  bluetoothPower: '008',
  setServerIpPort: '010',
  queryIccid: '014',
  bluetoothSignal: '025',
  queryBluetoothNamePasswordImei: '024',
  bluetoothParameters: '023',
  gprsLockHornLightMode: '042',
  gprsUnlockHornLightMode: '043',
  bluetoothLockHornLightMode: '052',
  bluetoothUnlockHornLightMode: '053',
  restartDevice: '099',
});

export const MT20_ACTION_MAP = Object.freeze({
  restore_starter: { x: 1, y: 0, description: 'Unkill / restore starter' },
  disable_starter: { x: 1, y: 1, description: 'Kill / disable starter' },
  lights: { x: 2, y: 1, description: 'Only lights' },
  horn: { x: 2, y: 2, description: 'Only horn' },
  horn_lights: { x: 2, y: 3, description: 'Lights and horn' },
  alarm_pulse: { x: 2, y: 3, description: 'Lights and horn alarm pulse' },
  lock: { x: 3, y: 1, description: 'Lock' },
  unlock: { x: 4, y: 1, description: 'Unlock' },
});

export const MT20_PACKET = Object.freeze({
  startMarkHex: '0D0A2A4B5700',
  endMarkHex: '0D0A',
  controlCommandIdHex: '0200',
  packetLengthHex: '4400',
  totalBytes: 68,
  sDataBytes: 50,
  defaultGisIpHex: '741E649C',
  defaultPortHex: '5B9A',
});

export const MT20_STATUS_BITS = Object.freeze({
  gpsLocated: 0,
  smokeSensor: 1,
  unlocked: 2,
  bluetoothOn: 3,
  doorOpen: 4,
  trunkOpen: 5,
  accOn: 6,
  starterKilled: 7,
});

export const MT20_ALARM_TYPES = Object.freeze({
  1: 'sos_alarm',
  2: 'overspeed_alarm',
  3: 'geofence_alarm',
  4: 'shock_alarm',
  9: 'power_alarm',
});

export const MT20_TEST_VECTORS = Object.freeze({
  handshakeRequest: {
    hex: '0F0000004E52303947303234383200',
    packetLength: 15,
    commandId: 0x0000,
    deviceId: 'NR09G02482',
  },
  positionUpload: {
    hex: '22000800C38000770023E3C8420ADA5C41CD85CA344E523039473034373938000000',
    packetLength: 34,
    commandId: 0x0008,
    deviceId: 'NR09G04798',
    longitude: 3.37519,
    latitude: 6.50920,
    timestamp: '2012-11-28 15:20:46',
  },
  newPositionUpload: {
    hex: '28003200C38000260024035840654BD0402EF5F8324E523039473035313030000000001900A94A4749',
    packetLength: 40,
    commandId: 0x0032,
    deviceId: 'NR09G05100',
  },
});

export function sanitizeMt20DeviceId(value = '') {
  return String(value).replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 80);
}

export function bytesToHex(bytes) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function hexToBytes(hex = '') {
  const clean = String(hex).replace(/[^a-fA-F0-9]/g, '');
  if (clean.length % 2 !== 0) throw new Error('Hex input must have an even number of characters.');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  return bytes;
}

export function asciiToHex(input = '') {
  return bytesToHex(new TextEncoder().encode(input));
}

export function hexToAscii(hex = '') {
  return new TextDecoder().decode(hexToBytes(hex)).replace(/\0+$/g, '');
}

export function normalizeFixedHex(value, fallback, expectedBytes, name) {
  const hex = String(value || fallback || '').replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  if (hex.length !== expectedBytes * 2) throw new Error(`${name} must be exactly ${expectedBytes} bytes of hex.`);
  return hex;
}

export function buildMt20Time(date = new Date()) {
  return [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join('');
}

export function buildMt20SData(deviceId, controlCode, args = [], date = new Date()) {
  const cleanDeviceId = sanitizeMt20DeviceId(deviceId);
  const hhmmss = buildMt20Time(date);
  const suffix = args.length ? `,${args.join(',')}` : '';
  return `*KW,${cleanDeviceId},${controlCode},${hhmmss}${suffix}#`;
}

export function buildMt20ControlSData(commandType, deviceId, date = new Date()) {
  if (commandType === 'locate' || commandType === 'status') {
    return buildMt20SData(deviceId, MT20_CONTROL_CODES.getPosition, [], date);
  }

  const action = MT20_ACTION_MAP[commandType];
  if (!action) throw new Error(`Unsupported MT20 command type: ${commandType}`);
  return buildMt20SData(deviceId, MT20_CONTROL_CODES.engineLockHornLight, [action.x, action.y], date);
}

export function wrapMt20ControlPacket(asciiCommand, options = {}) {
  const gisIpHex = normalizeFixedHex(options.gisIpHex, MT20_PACKET.defaultGisIpHex, 4, 'gisIpHex');
  const portHex = normalizeFixedHex(options.portHex, MT20_PACKET.defaultPortHex, 2, 'portHex');
  const sDataBytes = new TextEncoder().encode(asciiCommand);

  if (sDataBytes.length > MT20_PACKET.sDataBytes) throw new Error('MT20 sData ASCII command exceeds 50 bytes.');

  const paddedSData = new Uint8Array(MT20_PACKET.sDataBytes);
  paddedSData.set(sDataBytes);
  const sDataHex = bytesToHex(paddedSData);
  const fullPacketHex = `${MT20_PACKET.startMarkHex}${MT20_PACKET.packetLengthHex}${MT20_PACKET.controlCommandIdHex}${gisIpHex}${portHex}${sDataHex}${MT20_PACKET.endMarkHex}`;
  const totalBytes = fullPacketHex.length / 2;

  if (totalBytes !== MT20_PACKET.totalBytes) throw new Error('MT20 packet must be exactly 68 bytes.');
  return { asciiCommand, sDataHex, fullPacketHex, totalBytes };
}

export function buildMt20WrappedCommand(commandType, deviceId, options = {}) {
  const asciiCommand = buildMt20ControlSData(commandType, deviceId, options.date || new Date());
  return wrapMt20ControlPacket(asciiCommand, options);
}

export function readUInt16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

export function readFloatLE(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getFloat32(0, true);
}

export function decodeMt20PackedDateTime(value) {
  const year = (value >>> 26) & 0x3f;
  const month = (value >>> 22) & 0x0f;
  const day = (value >>> 17) & 0x1f;
  const hour = (value >>> 12) & 0x1f;
  const minute = (value >>> 6) & 0x3f;
  const second = value & 0x3f;
  const fullYear = 2000 + year;
  return `${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

export function decodeMt20StatusBits(byteValue = 0) {
  const hasBit = (bit) => ((byteValue >> bit) & 1) === 1;
  return {
    gpsLocated: hasBit(MT20_STATUS_BITS.gpsLocated),
    smokeDetected: hasBit(MT20_STATUS_BITS.smokeSensor),
    unlocked: hasBit(MT20_STATUS_BITS.unlocked),
    bluetoothOn: hasBit(MT20_STATUS_BITS.bluetoothOn),
    doorOpen: hasBit(MT20_STATUS_BITS.doorOpen),
    trunkOpen: hasBit(MT20_STATUS_BITS.trunkOpen),
    accOn: hasBit(MT20_STATUS_BITS.accOn),
    starterKilled: hasBit(MT20_STATUS_BITS.starterKilled),
  };
}

export function decodeMt20UploadPacket(hex = '') {
  const bytes = hexToBytes(hex);
  if (bytes.length < 4) throw new Error('MT20 upload packet is too short.');

  const packetLength = readUInt16LE(bytes, 0);
  const commandId = readUInt16LE(bytes, 2);

  if (![MT20_COMMAND_IDS.positionUpload, MT20_COMMAND_IDS.alarmUpload, MT20_COMMAND_IDS.newPositionUpload, MT20_COMMAND_IDS.commandResponse].includes(commandId)) {
    return { packetLength, commandId, rawHex: bytesToHex(bytes), supported: false };
  }

  const bEnable = bytes[4];
  const alarmByte = bytes[5];
  const speed = bytes[6];
  const direction = readUInt16LE(bytes, 7);
  const longitude = readFloatLE(bytes, 9);
  const latitude = readFloatLE(bytes, 13);
  const dateValue = new DataView(bytes.buffer, bytes.byteOffset + 17, 4).getUint32(0, true);
  const deviceId = new TextDecoder().decode(bytes.slice(21, 32)).replace(/\0+$/g, '');

  return {
    packetLength,
    commandId,
    rawHex: bytesToHex(bytes),
    supported: true,
    status: decodeMt20StatusBits(bEnable),
    alarmByte,
    alarmType: MT20_ALARM_TYPES[alarmByte] || '',
    speed,
    direction,
    longitude,
    latitude,
    timestamp: decodeMt20PackedDateTime(dateValue),
    deviceId,
  };
}

export function validateMt20WrappedPacket(hex = '') {
  const clean = String(hex).replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  return {
    validLength: clean.length / 2 === MT20_PACKET.totalBytes,
    validStart: clean.startsWith(MT20_PACKET.startMarkHex),
    validEnd: clean.endsWith(MT20_PACKET.endMarkHex),
    totalBytes: clean.length / 2,
  };
}