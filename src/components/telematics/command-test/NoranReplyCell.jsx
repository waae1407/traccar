import React from 'react';
import { Badge } from '@/components/ui/badge';

function hexToAscii(value = '') {
  const hex = String(value || '').replace(/[^a-fA-F0-9]/g, '');
  if (hex.length < 8 || hex.length % 2 !== 0) return '';
  try {
    const bytes = hex.match(/.{2}/g).map((pair) => parseInt(pair, 16));
    return String.fromCharCode(...bytes).replace(/\0/g, '').trim();
  } catch {
    return '';
  }
}

function findNoranMessage(command) {
  const response = command?.provider_response || {};
  const mt20Reply = response.mt20_forwarded_reply || response.parsed_forwarded_reply;
  if (mt20Reply?.raw_packet_hex) {
    return {
      message: mt20Reply.raw_packet_hex,
      description: mt20Reply.packet_type === '0x8009'
        ? `MT20 command response received${mt20Reply.lock_state ? ` — ${mt20Reply.lock_state}` : ''}.`
        : `MT20 ${mt20Reply.packet_type || 'reply'} received.`,
      received: true
    };
  }

  const direct = [
    response.noran_reply_message,
    response.reply_message,
    response.reply,
    response.message,
    response.raw,
    response.data,
    response.result,
    response.attributes?.result,
    response.attributes?.reply,
    response.attributes?.message,
  ];

  for (const value of direct) {
    if (!value) continue;
    const text = String(value).trim();
    if (text.includes('*KW') || text.includes('#')) return { message: text, description: describeAsciiReply(text), received: true };
    const ascii = hexToAscii(text);
    if (ascii.includes('*KW') || ascii.includes('#')) return { message: ascii, description: describeAsciiReply(ascii), received: true };
  }
  return null;
}

function describeAsciiReply(message) {
  const clean = message.replace(/^.*?(\*KW)/, '$1').replace(/[\r\n]/g, '').trim();
  const parts = clean.replace(/^\*KW,?/, '').replace(/#.*$/, '').split(',');
  const code = parts[1];
  const action = parts[3];
  const value = parts[4];

  if (code === '000') return 'Location/status reply from device.';
  if (code === '007') {
    const actionMap = {
      '1:1': 'Starter disable acknowledged.',
      '1:0': 'Starter restore acknowledged.',
      '2:1': 'Horn command acknowledged.',
      '2:2': 'Lights command acknowledged.',
      '2:3': 'Horn and lights command acknowledged.',
      '3:1': 'Lock command acknowledged.',
      '4:1': 'Unlock command acknowledged.',
    };
    return actionMap[`${action}:${value}`] || 'Device control reply received.';
  }
  return 'Noran reply received.';
}

function describeMissingReply(command) {
  const status = command.queue_status || command.status;
  if (status === 'expired' || command.failure_reason?.toLowerCase().includes('timeout')) return 'No Noran reply received before timeout.';
  if (['sent', 'delivered', 'sending'].includes(status)) return 'Waiting for Noran reply.';
  return 'No Noran reply recorded.';
}

export default function NoranReplyCell({ command }) {
  const reply = findNoranMessage(command);
  const message = reply?.message || '';
  const description = reply?.description || describeMissingReply(command);
  const received = !!reply?.received;

  return (
    <div className="min-w-[180px] max-w-xs space-y-1">
      <Badge className={received ? 'bg-emerald-500/15 text-emerald-300' : 'bg-yellow-500/15 text-yellow-300'}>
        {received ? 'Reply received' : 'No reply yet'}
      </Badge>
      <p className="text-xs text-white/75">{description}</p>
      <p className="truncate text-[10px] text-white/35">{message || '—'}</p>
    </div>
  );
}