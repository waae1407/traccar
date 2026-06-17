import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, ChevronDown, ChevronRight, Download, Loader2, MapPin, Radio, RefreshCw, Zap } from 'lucide-react';

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function SpeedBadge({ speed }) {
  if (speed == null) return null;
  const mph = (Number(speed) * 0.621371).toFixed(1);
  return <Badge className="bg-blue-500/15 text-blue-300 border border-blue-500/25">{mph} mph</Badge>;
}

function PositionRow({ pos }) {
  const [open, setOpen] = useState(false);
  const hasAttrs = pos.attributes && Object.keys(pos.attributes).length > 0;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03]">
      <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full items-center gap-3 p-3 text-left">
        <MapPin className="h-4 w-4 shrink-0 text-primary" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white/70">{fmt(pos.fixTime || pos.deviceTime)}</p>
          <p className="text-xs text-white/45 truncate">{pos.address || `${pos.latitude?.toFixed(5)}, ${pos.longitude?.toFixed(5)}`}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SpeedBadge speed={pos.speed} />
          <Badge className={pos.valid ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' : 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/25'}>
            {pos.valid ? 'Valid' : 'Invalid'}
          </Badge>
          {hasAttrs && (open ? <ChevronDown className="h-3.5 w-3.5 text-white/40" /> : <ChevronRight className="h-3.5 w-3.5 text-white/40" />)}
        </div>
      </button>
      {open && hasAttrs && (
        <div className="border-t border-white/10 p-3 pt-2 grid grid-cols-2 gap-1 md:grid-cols-3">
          {Object.entries(pos.attributes).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-black/20 p-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/30">{k}</p>
              <p className="text-xs font-bold text-white/70 truncate">{String(v)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ ev }) {
  const [open, setOpen] = useState(false);
  const hasAttrs = ev.attributes && Object.keys(ev.attributes).length > 0;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03]">
      <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full items-center gap-3 p-3 text-left">
        <Zap className="h-4 w-4 shrink-0 text-yellow-400" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white/70">{fmt(ev.eventTime)}</p>
          <p className="text-xs text-yellow-300/80 font-semibold truncate">{ev.type}</p>
        </div>
        {hasAttrs && (open ? <ChevronDown className="h-3.5 w-3.5 text-white/40" /> : <ChevronRight className="h-3.5 w-3.5 text-white/40" />)}
      </button>
      {open && hasAttrs && (
        <div className="border-t border-white/10 p-3 pt-2 grid grid-cols-2 gap-1 md:grid-cols-3">
          {Object.entries(ev.attributes).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-black/20 p-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/30">{k}</p>
              <p className="text-xs font-bold text-white/70 truncate">{String(v)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TraccarDeviceLogsPanel({ deviceUniqueId }) {
  const [tab, setTab] = useState('positions'); // 'positions' | 'events'
  const [hoursBack, setHoursBack] = useState('24');
  const [result, setResult] = useState(null);

  const query = useMutation({
    mutationFn: () =>
      base44.functions.invoke('getTraccarDeviceLogs', {
        identifier: deviceUniqueId,
        hours_back: Number(hoursBack),
        max_positions: 200
      }).then(res => res.data),
    onSuccess: data => setResult(data)
  });

  if (!deviceUniqueId) return null;

  const positions = result?.positions?.data || [];
  const events = result?.events?.data || [];

  return (
    <Card className="glass border-white/10">
      <CardContent className="space-y-4 p-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Traccar Internal Logs</p>
            <h2 className="mt-1 text-xl font-black text-white">Device Position & Event History</h2>
            <p className="mt-0.5 text-xs text-white/45">Raw logs pulled directly from Traccar for this device.</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={hoursBack} onValueChange={setHoursBack}>
              <SelectTrigger className="h-9 w-32 rounded-xl border-white/15 bg-white/5 text-xs text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 1h</SelectItem>
                <SelectItem value="6">Last 6h</SelectItem>
                <SelectItem value="12">Last 12h</SelectItem>
                <SelectItem value="24">Last 24h</SelectItem>
                <SelectItem value="48">Last 48h</SelectItem>
                <SelectItem value="72">Last 72h</SelectItem>
                <SelectItem value="168">Last 7d</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-9 rounded-xl bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30"
              onClick={() => query.mutate()}
              disabled={query.isPending}
            >
              {query.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {result ? 'Refresh' : 'Fetch Logs'}
            </Button>
          </div>
        </div>

        {/* Device meta after load */}
        {result?.device && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-wrap gap-3 items-center">
            <Radio className={`h-4 w-4 ${result.device.status === 'online' ? 'text-emerald-400' : 'text-red-400'}`} />
            <span className="text-sm font-bold text-white">{result.device.uniqueId}</span>
            <Badge className={result.device.status === 'online' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' : 'bg-red-500/15 text-red-300 border border-red-500/25'}>
              {result.device.status || 'unknown'}
            </Badge>
            {result.device.lastUpdate && (
              <span className="text-xs text-white/40">Last update: {fmt(result.device.lastUpdate)}</span>
            )}
            {result.latest_position && (
              <span className="text-xs text-white/40">
                Last fix: {fmt(result.latest_position.fixTime)} · {result.latest_position.latitude?.toFixed(4)}, {result.latest_position.longitude?.toFixed(4)}
              </span>
            )}
          </div>
        )}

        {/* Error */}
        {result && !result.ok && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-semibold text-red-300">
            {result.error || 'Failed to fetch logs.'}
          </div>
        )}

        {/* Tab bar */}
        {result?.ok && (
          <>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTab('positions')}
                className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest transition-all ${tab === 'positions' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-white/5 text-white/50 border border-white/10 hover:text-white/70'}`}
              >
                <MapPin className="inline mr-1 h-3 w-3" />
                Positions ({result.positions.count})
              </button>
              <button
                type="button"
                onClick={() => setTab('events')}
                className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest transition-all ${tab === 'events' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' : 'bg-white/5 text-white/50 border border-white/10 hover:text-white/70'}`}
              >
                <Activity className="inline mr-1 h-3 w-3" />
                Events ({result.events.count})
              </button>
            </div>

            {/* Positions list */}
            {tab === 'positions' && (
              <div className="space-y-1 max-h-[480px] overflow-y-auto pr-1">
                {positions.length === 0 && (
                  <p className="py-6 text-center text-sm text-white/40">No positions found in the selected time range.</p>
                )}
                {positions.map(pos => <PositionRow key={pos.id} pos={pos} />)}
              </div>
            )}

            {/* Events list */}
            {tab === 'events' && (
              <div className="space-y-1 max-h-[480px] overflow-y-auto pr-1">
                {events.length === 0 && (
                  <p className="py-6 text-center text-sm text-white/40">No events found in the selected time range.</p>
                )}
                {events.map(ev => <EventRow key={ev.id} ev={ev} />)}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}