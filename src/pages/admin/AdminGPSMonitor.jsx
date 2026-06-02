import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Wifi, WifiOff, Car, RefreshCw, Zap, ZapOff, AlertTriangle, CheckCircle2, Clock, ChevronRight } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

const EVENT_CONFIG = {
  device_online:      { label: "Online",       color: "text-emerald-400", bg: "bg-emerald-500/20 border-emerald-500/30", icon: Wifi },
  device_offline:     { label: "Offline",      color: "text-red-400",     bg: "bg-red-500/20 border-red-500/30",         icon: WifiOff },
  kill_sent:          { label: "Kill Sent",    color: "text-orange-400",  bg: "bg-orange-500/20 border-orange-500/30",   icon: Zap },
  kill_confirmed:     { label: "Kill Active",  color: "text-red-400",     bg: "bg-red-500/20 border-red-500/30",         icon: Zap },
  reinstate_sent:     { label: "Reinstate Sent", color: "text-blue-400",  bg: "bg-blue-500/20 border-blue-500/30",       icon: ZapOff },
  reinstate_confirmed:{ label: "Reinstated",   color: "text-emerald-400", bg: "bg-emerald-500/20 border-emerald-500/30", icon: ZapOff },
};

function StatusBadge({ eventType }) {
  const cfg = EVENT_CONFIG[eventType] || { label: eventType, color: "text-muted-foreground", bg: "bg-muted/30 border-border" };
  const Icon = cfg.icon || Clock;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg border ${cfg.bg} ${cfg.color}`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

export default function AdminGPSMonitor() {
  const queryClient = useQueryClient();
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [sendingCommand, setSendingCommand] = useState(null);

  // Fetch vehicles with GPS devices
  const { data: allVehicles = [], isLoading: loadingVehicles } = useQuery({
    queryKey: ["gps-vehicles"],
    queryFn: () => base44.entities.Vehicle.list("-updated_date", 200),
    staleTime: 60_000,
  });
  const gpsVehicles = allVehicles.filter(v => v.moovetrax_device_id);

  // Fetch recent GPS events (last 200)
  const { data: gpsEvents = [], isLoading: loadingEvents, refetch } = useQuery({
    queryKey: ["gps-events-recent"],
    queryFn: () => base44.entities.GPSEvent.list("-created_date", 200),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Fetch active bookings for context
  const { data: activeBookings = [] } = useQuery({
    queryKey: ["gps-active-bookings"],
    queryFn: () => base44.entities.BookingRequest.filter({ booking_status: "active" }),
    staleTime: 60_000,
  });

  // Build per-vehicle GPS status from last event
  const vehicleStatusMap = {};
  for (const vehicle of gpsVehicles) {
    const deviceEvents = gpsEvents.filter(e => e.device_id === vehicle.moovetrax_device_id);
    vehicleStatusMap[vehicle.id] = deviceEvents[0] || null; // already sorted desc
  }

  const onlineCount = gpsVehicles.filter(v => {
    const last = vehicleStatusMap[v.id];
    return !last || last.event_type === 'device_online' || last.event_type === 'reinstate_confirmed';
  }).length;
  const offlineCount = gpsVehicles.filter(v => vehicleStatusMap[v.id]?.event_type === 'device_offline').length;
  const killActiveCount = gpsVehicles.filter(v => {
    const last = vehicleStatusMap[v.id];
    return last?.event_type === 'kill_confirmed' || last?.event_type === 'kill_sent';
  }).length;

  const handleCommand = async (vehicle, command) => {
    const booking = activeBookings.find(b => b.vehicle_id === vehicle.id);
    setSendingCommand(`${vehicle.id}-${command}`);
    try {
      await base44.functions.invoke('moovetraxCommand', {
        vehicle_id: vehicle.id,
        booking_id: booking?.id || '',
        command,
        sent_by: 'admin_gps_monitor',
      });
      queryClient.invalidateQueries(["gps-events-recent"]);
    } catch (err) {
      console.error('Command failed:', err);
    } finally {
      setSendingCommand(null);
    }
  };

  const selectedEvents = selectedVehicle
    ? gpsEvents.filter(e => e.device_id === selectedVehicle.moovetrax_device_id).slice(0, 20)
    : [];

  // ── GPS PROVIDER VALIDATION PENDING BANNER ──────────────────────────────
  const validationBanner = (
    <div className="flex items-start gap-3 p-4 rounded-2xl border border-yellow-500/40 bg-yellow-500/10 mb-5">
      <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-bold text-yellow-300">GPS Provider Validation Pending</p>
        <p className="text-xs text-yellow-400/80 mt-0.5 leading-relaxed">
          Device data will appear after MooveTrax API credentials and live device testing are completed.
          Set <code className="bg-yellow-500/20 px-1 rounded font-mono">MOOVETRAX_PARTNER_API_KEY</code> and
          run a manual test from Dashboard → Code → Functions → <code className="bg-yellow-500/20 px-1 rounded font-mono">checkGPSDeviceStatus</code>.
        </p>
        <p className="text-[10px] text-yellow-400/60 mt-1 font-semibold uppercase tracking-wide">Status: Code-complete · Pending vendor API validation</p>
      </div>
    </div>
  );

  if (loadingVehicles || loadingEvents) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {validationBanner}
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Phase 2B</p>
          <h1 className="text-xl font-black text-foreground" style={{ fontFamily: "var(--font-syne)" }}>GPS Device Monitor</h1>
          <p className="text-sm text-muted-foreground mt-0.5">MooveTrax device health — active rental vehicles only.</p>
        </div>
        <button onClick={() => { refetch(); queryClient.invalidateQueries(["gps-vehicles"]); }}
          className="h-9 w-9 rounded-xl bg-muted/40 border border-border flex items-center justify-center hover:bg-muted/60">
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "GPS Devices", value: gpsVehicles.length, color: "text-foreground" },
          { label: "Online", value: onlineCount, color: "text-emerald-400" },
          { label: "Offline", value: offlineCount, color: "text-red-400" },
          { label: "Kill Active", value: killActiveCount, color: "text-orange-400" },
        ].map(s => (
          <div key={s.label} className="glass rounded-xl p-3 text-center">
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground font-semibold mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {gpsVehicles.length === 0 ? (
        <div className="text-center py-16 glass rounded-2xl">
          <Wifi className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No vehicles with GPS devices</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Set moovetrax_device_id on vehicles to enable GPS monitoring</p>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Vehicle List */}
          <div className="flex-1 space-y-2">
            {gpsVehicles.map(vehicle => {
              const lastEvent = vehicleStatusMap[vehicle.id];
              const booking = activeBookings.find(b => b.vehicle_id === vehicle.id);
              const isKilled = lastEvent?.event_type === 'kill_confirmed' || lastEvent?.event_type === 'kill_sent';
              const isOffline = lastEvent?.event_type === 'device_offline';
              const selected = selectedVehicle?.id === vehicle.id;

              return (
                <button key={vehicle.id} onClick={() => setSelectedVehicle(vehicle)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${selected ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${isOffline ? "bg-red-400" : isKilled ? "bg-orange-400" : "bg-emerald-400"}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">
                          {vehicle.year} {vehicle.make} {vehicle.model}
                          {vehicle.plate && <span className="text-muted-foreground font-normal ml-1">· {vehicle.plate}</span>}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          Device: {vehicle.moovetrax_device_id}
                        </p>
                        {booking && (
                          <p className="text-[10px] text-primary/70 mt-0.5">
                            Active rental: {booking.customer_full_name || booking.user_email}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {lastEvent ? <StatusBadge eventType={lastEvent.event_type} /> : (
                        <span className="text-[10px] text-muted-foreground/60 italic">No events</span>
                      )}
                      {lastEvent && (
                        <p className="text-[9px] text-muted-foreground">
                          {formatDistanceToNow(new Date(lastEvent.created_date), { addSuffix: true })}
                        </p>
                      )}
                      {/* Kill / Unkill buttons */}
                      {booking && (
                        <div className="flex gap-1">
                          {isKilled ? (
                            <button
                              onClick={e => { e.stopPropagation(); handleCommand(vehicle, 'unkill'); }}
                              disabled={!!sendingCommand}
                              className="px-2 py-1 rounded-lg text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-50"
                            >
                              {sendingCommand === `${vehicle.id}-unkill` ? '...' : 'Unkill'}
                            </button>
                          ) : (
                            <button
                              onClick={e => { e.stopPropagation(); handleCommand(vehicle, 'kill'); }}
                              disabled={!!sendingCommand}
                              className="px-2 py-1 rounded-lg text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-50"
                            >
                              {sendingCommand === `${vehicle.id}-kill` ? '...' : 'Kill'}
                            </button>
                          )}
                        </div>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Event History Panel */}
          {selectedVehicle && (
            <div className="lg:w-80 flex-shrink-0 glass rounded-2xl p-4 space-y-3 h-fit">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-foreground text-sm">{selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}</h3>
                  <p className="text-[10px] text-muted-foreground font-mono">{selectedVehicle.moovetrax_device_id}</p>
                </div>
                <button onClick={() => setSelectedVehicle(null)} className="h-7 w-7 rounded-lg bg-muted/40 flex items-center justify-center text-muted-foreground hover:text-foreground text-xs">✕</button>
              </div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Recent GPS Events</p>
              {selectedEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No GPS events recorded for this device.</p>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map(event => (
                    <div key={event.id} className="flex items-start gap-2 py-1.5 border-b border-border/40 last:border-0">
                      <StatusBadge eventType={event.event_type} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-muted-foreground">
                          {event.created_date ? format(new Date(event.created_date), "MMM d, h:mma") : "—"}
                        </p>
                        {event.notes && <p className="text-[10px] text-muted-foreground/60 truncate">{event.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}