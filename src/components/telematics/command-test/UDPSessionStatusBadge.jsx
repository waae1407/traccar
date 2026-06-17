import React from 'react';
import { Wifi, WifiOff, HelpCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

function ageLabel(isoTs) {
  if (!isoTs) return null;
  const ageMs = Date.now() - new Date(isoTs).getTime();
  if (ageMs < 0) return '0s ago';
  const ageSec = Math.floor(ageMs / 1000);
  if (ageSec < 60) return `${ageSec}s ago`;
  const ageMin = Math.floor(ageSec / 60);
  if (ageMin < 60) return `${ageMin}m ago`;
  return `${Math.floor(ageMin / 60)}h ago`;
}

const PACKET_TYPE_LABELS = {
  handshake: 'Handshake',
  position: 'Position',
  alarm: 'Alarm',
  command_response: 'Command Response',
  unknown: 'Unknown'
};

export default function UDPSessionStatusBadge({ device, compact = false }) {
  if (!device || device.provider_key !== 'traccar_noran_mt20') return null;

  const status = device.udp_session_status || 'unknown';
  const lastAt = device.last_inbound_packet_at;
  const freshUntil = device.udp_session_fresh_until;
  const packetType = device.last_inbound_packet_type;

  // Recompute live freshness from timestamps (in case entity hasn't been re-fetched)
  const nowMs = Date.now();
  const lastAtMs = lastAt ? new Date(lastAt).getTime() : null;
  const freshUntilMs = freshUntil ? new Date(freshUntil).getTime() : null;
  const liveFresh = freshUntilMs ? nowMs <= freshUntilMs : false;
  const effectiveStatus = lastAtMs ? (liveFresh ? 'fresh' : 'stale') : 'unknown';

  const isFresh = effectiveStatus === 'fresh';
  const isStale = effectiveStatus === 'stale';

  if (compact) {
    return (
      <Badge className={
        isFresh ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 gap-1' :
        isStale ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 gap-1' :
        'bg-white/10 text-white/50 border border-white/15 gap-1'
      }>
        {isFresh ? <Wifi className="h-3 w-3" /> : isStale ? <WifiOff className="h-3 w-3" /> : <HelpCircle className="h-3 w-3" />}
        UDP {isFresh ? 'Fresh' : isStale ? 'Stale' : 'Unknown'}
        {lastAt && <span className="opacity-70">· {ageLabel(lastAt)}</span>}
      </Badge>
    );
  }

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${
      isFresh ? 'border-emerald-500/30 bg-emerald-500/8' :
      isStale ? 'border-yellow-500/30 bg-yellow-500/8' :
      'border-white/10 bg-white/5'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isFresh
            ? <Wifi className="h-4 w-4 text-emerald-400" />
            : isStale
            ? <WifiOff className="h-4 w-4 text-yellow-400" />
            : <HelpCircle className="h-4 w-4 text-white/40" />}
          <p className="text-xs font-black uppercase tracking-widest text-white/60">UDP Session</p>
        </div>
        <Badge className={
          isFresh ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
          isStale ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' :
          'bg-white/10 text-white/50'
        }>
          {isFresh ? 'Fresh' : isStale ? 'Stale' : 'Unknown'}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-white/35 font-semibold uppercase tracking-wider mb-0.5">Last Inbound</p>
          <p className="text-white font-bold">{lastAt ? ageLabel(lastAt) : '—'}</p>
        </div>
        <div>
          <p className="text-white/35 font-semibold uppercase tracking-wider mb-0.5">Packet Type</p>
          <p className="text-white font-bold">{packetType ? PACKET_TYPE_LABELS[packetType] || packetType : '—'}</p>
        </div>
        <div>
          <p className="text-white/35 font-semibold uppercase tracking-wider mb-0.5">Fresh Until</p>
          <p className={`font-bold ${isFresh ? 'text-emerald-300' : 'text-white/50'}`}>
            {freshUntil ? new Date(freshUntil).toLocaleTimeString() : '—'}
          </p>
        </div>
        <div>
          <p className="text-white/35 font-semibold uppercase tracking-wider mb-0.5">Gate Status</p>
          <p className={`font-bold ${isFresh ? 'text-emerald-300' : isStale ? 'text-yellow-300' : 'text-white/50'}`}>
            {isFresh ? 'Will send immediately' : isStale ? 'Will wait for heartbeat' : 'No data yet'}
          </p>
        </div>
      </div>

      {isStale && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-500/25 bg-yellow-500/10 p-3">
          <Clock className="h-3.5 w-3.5 text-yellow-400 mt-0.5 shrink-0" />
          <p className="text-xs text-yellow-200">Commands will be queued as <code className="text-yellow-300">pending_waiting_for_fresh_session</code> and auto-sent after the next device heartbeat.</p>
        </div>
      )}
    </div>
  );
}