const COMMAND_LABELS = {
  locate: 'Location Check',
  status: 'Health Check',
  lock: 'Lock Doors',
  unlock: 'Unlock Doors',
  horn: 'Horn Alert',
  lights: 'Light Alert',
  horn_lights: 'Horn & Light Alert',
  alarm_pulse: 'Security Alert',
  disable_starter: 'Starter Disable',
  restore_starter: 'Starter Restore'
};

const STATUS_LABELS = {
  queued: 'Pending',
  pending: 'Pending',
  sending: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  acknowledged: 'Confirmed',
  executed: 'Completed',
  confirmed: 'Confirmed',
  failed: 'Needs Review',
  expired: 'Timed Out',
  blocked: 'Blocked',
  retrying: 'Retrying'
};

const TECHNICAL_REPLACEMENTS = [
  [/Raw\s+MT20\s+command\s+ACK\s+detected\s+from\s+Traccar\s+log\s+forwarder/gi, 'Device response confirmed through the telematics network'],
  [/MT20\s+command\s+response\s+received/gi, 'Device response received'],
  [/MT20\s+[^.]+\s+received/gi, 'Device response received'],
  [/Noran\s+reply\s+received/gi, 'Device response received'],
  [/ACK\b/gi, 'confirmation'],
  [/raw\s*packet\s*hex/gi, 'device response'],
  [/raw\s*payload/gi, 'response details'],
  [/hex\s*payload/gi, 'response details'],
  [/ascii\s*payload/gi, 'response details'],
  [/Traccar\s+log\s+forwarder/gi, 'telematics network'],
  [/Traccar/gi, 'telematics provider'],
  [/MooveTrax/gi, 'telematics provider'],
  [/Noran/gi, 'device'],
  [/MT20/gi, 'device'],
  [/provider\s+device\s+id/gi, 'device identifier'],
  [/provider\s+id/gi, 'device identifier']
];

export function commandLabel(commandType) {
  return COMMAND_LABELS[commandType] || String(commandType || 'Command').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || String(status || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function businessText(value, fallback = '—') {
  if (!value) return fallback;
  let text = String(value);
  TECHNICAL_REPLACEMENTS.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });
  return text;
}