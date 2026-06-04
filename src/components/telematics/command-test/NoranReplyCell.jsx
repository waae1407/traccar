import React from 'react';
import { Badge } from '@/components/ui/badge';
import { businessText } from './businessLanguage';

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
        ? `Vehicle response received${mt20Reply.lock_state ? ` — ${mt20Reply.lock_state}` : ''}.`
        : 'Vehicle response received.',
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

  if (code === '000') return 'Vehicle location/status response received.';
  if (code === '007') {
    const actionMap = {
      '1:1': 'Starter disable confirmed.',
      '1:0': 'Starter restore confirmed.',
      '2:1': 'Horn action confirmed.',
      '2:2': 'Light action confirmed.',
      '2:3': 'Horn and light action confirmed.',
      '3:1': 'Lock action confirmed.',
      '4:1': 'Unlock action confirmed.',
    };
    return actionMap[`${action}:${value}`] || 'Vehicle action response received.';
  }
  return 'Vehicle response received.';
}

function describeMissingReply(command) {
  const status = command.queue_status || command.status;
  if (status === 'expired' || command.failure_reason?.toLowerCase().includes('timeout')) return 'No vehicle response received before timeout.';
  if (['sent', 'delivered', 'sending'].includes(status)) return 'Awaiting vehicle response.';
  return 'No vehicle response recorded.';
}

export default function NoranReplyCell({ command }) {
  const reply = findNoranMessage(command);
  const description = businessText(reply?.description || describeMissingReply(command));
  const received = !!reply?.received;

  return (
    <div className="min-w-[180px] max-w-xs space-y-1">
      <Badge className={received ? 'bg-emerald-500/15 text-emerald-300' : 'bg-yellow-500/15 text-yellow-300'}>
        {received ? 'Response received' : 'Awaiting response'}
      </Badge>
      <p className="text-xs text-white/75">{description}</p>
      <p className="text-[10px] text-white/35">Secure response details are recorded for internal review.</p>
    </div>
  );
}