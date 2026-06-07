import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Wifi, WifiOff, Car, RefreshCw, Zap, AlertTriangle, Clock, ChevronRight, Activity, HelpCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import TelematicsMap from "@/components/telematics/TelematicsMap";
import TelematicsService from "@/lib/telematics/TelematicsService";
import { getTelematicsDeviceStats } from "@/lib/telematics/telematicsReporting";
import { getVehicleDisplayName } from "@/lib/vehicleDisplayName";

function DeviceStatusBadge({ status }) {
  const config = {
    online: { label: "Online", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: Wifi },
    offline: { label: "Offline", className: "bg-red-500/20 text-red-400 border-red-500/30", icon: WifiOff },
    unknown: { label: "Unknown", className: "bg-muted/30 text-muted-foreground border-border", icon: HelpCircle },
  }[status || "unknown"];
  const Icon = config.icon;
  return <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg border ${config.className}`}><Icon className="h-3 w-3" />{config.label}</span>;
}

export default function AdminGPSMonitor() {
  const queryClient = useQueryClient();
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [sendingCommand, setSendingCommand] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const { data: devices = [], isLoading: loadingDevices, refetch: refetchDevices } = useQuery({
    queryKey: ["gps-monitor-telematics-devices"],
    queryFn: () => base44.entities.TelematicsDevice.list("-updated_date", 500),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const { data: vehicles = [], isLoading: loadingVehicles, refetch: refetchVehicles } = useQuery({
    queryKey: ["gps-monitor-vehicles"],
    queryFn: () => base44.entities.Vehicle.list("-updated_date", 500),
    staleTime: 60_000,
  });
  const { data: providers = [] } = useQuery({ queryKey: ["gps-monitor-providers"], queryFn: () => base44.entities.TelematicsProviderConfig.list("provider_key", 100), staleTime: 60_000 });
  const { data: hosts = [] } = useQuery({ queryKey: ["gps-monitor-hosts"], queryFn: () => base44.entities.Host.list("business_name", 500), staleTime: 60_000 });
  const { data: bookings = [] } = useQuery({ queryKey: ["gps-monitor-bookings"], queryFn: () => base44.entities.BookingRequest.list("-updated_date", 500), staleTime: 60_000 });

  const stats = useMemo(() => getTelematicsDeviceStats(devices), [devices]);
  const selectedVehicle = selectedDevice ? vehicles.find((vehicle) => vehicle.id === selectedDevice.vehicle_id) : null;
  const selectedBooking = selectedDevice ? bookings.find((booking) => booking.vehicle_id === selectedDevice.vehicle_id && ["active", "approved", "confirmed"].includes(booking.booking_status)) : null;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await TelematicsService.syncTraccarPositions();
      await Promise.all([refetchDevices(), refetchVehicles()]);
      queryClient.invalidateQueries({ queryKey: ["gps-monitor-telematics-devices"] });
    } finally {
      setRefreshing(false);
    }
  };

  const handleCommand = async (device, command) => {
    if (!device.vehicle_id) return;
    setSendingCommand(`${device.id}-${command}`);
    try {
      const starter = command === "disable_starter" || command === "restore_starter";
      const reason = starter ? window.prompt("Reason for starter command") : "";
      if (starter && (!reason || reason.trim().length < 5 || !window.confirm("Confirm this high-risk starter command?"))) return;
      await base44.functions.invoke("sendTelematicsCommand", { vehicle_id: device.vehicle_id, command_type: command, source: "admin_gps_monitor", reason, confirm_starter_command: starter });
      queryClient.invalidateQueries({ queryKey: ["gps-monitor-telematics-devices"] });
    } finally {
      setSendingCommand(null);
    }
  };

  if (loadingDevices || loadingVehicles) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Fleet Operations</p>
          <h1 className="text-xl font-black text-foreground" style={{ fontFamily: "var(--font-syne)" }}>Vehicle Location Monitor</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Live telematics registry counts from device records, not legacy vehicle flags.</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Stat label="Total Devices" value={stats.total} icon={Car} />
        <Stat label="Active" value={stats.active} icon={Activity} color="text-primary" />
        <Stat label="Assigned" value={stats.assigned} icon={Car} />
        <Stat label="Unassigned" value={stats.unassigned} icon={AlertTriangle} color="text-yellow-400" />
        <Stat label="Online" value={stats.online} icon={Wifi} color="text-emerald-400" />
        <Stat label="Offline" value={stats.offline} icon={WifiOff} color="text-red-400" />
        <Stat label="Unknown" value={stats.unknown} icon={HelpCircle} color="text-muted-foreground" />
        <Stat label="With Location" value={stats.withLocation} icon={Clock} color="text-blue-400" />
      </div>

      <TelematicsMap role="admin" devices={devices} vehicles={vehicles} hosts={hosts} bookings={bookings} providers={providers} height={460} showFilters showRefresh={false} compact={false} />

      {devices.length === 0 ? (
        <div className="text-center py-16 glass rounded-2xl">
          <Wifi className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No telematics devices found</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Devices appear here after provisioning or installation.</p>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 space-y-2">
            {devices.map(device => {
              const vehicle = vehicles.find(v => v.id === device.vehicle_id);
              const isKilled = device.starter_disabled === true;
              const selected = selectedDevice?.id === device.id;
              return (
                <button key={device.id} onClick={() => setSelectedDevice(device)} className={`w-full text-left p-4 rounded-xl border transition-all ${selected ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${device.online_status === "offline" ? "bg-red-400" : device.online_status === "online" ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{getVehicleDisplayName(vehicle, device)}</p>
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">Device: {device.unique_id || device.device_imei || device.id}</p>
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">Lifecycle: {device.lifecycle_status || "inventory"} · Assigned: {device.vehicle_id ? "yes" : "no"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <DeviceStatusBadge status={device.online_status} />
                      {device.last_seen_at && <p className="text-[9px] text-muted-foreground">{formatDistanceToNow(new Date(device.last_seen_at), { addSuffix: true })}</p>}
                      {device.vehicle_id && (
                        <button onClick={e => { e.stopPropagation(); handleCommand(device, isKilled ? "restore_starter" : "disable_starter"); }} disabled={!!sendingCommand} className={`px-2 py-1 rounded-lg text-[9px] font-bold border disabled:opacity-50 ${isKilled ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
                          {sendingCommand === `${device.id}-${isKilled ? "restore_starter" : "disable_starter"}` ? "..." : isKilled ? "Restore" : "Disable"}
                        </button>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedDevice && (
            <div className="lg:w-80 flex-shrink-0 glass rounded-2xl p-4 space-y-3 h-fit">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-foreground text-sm">{getVehicleDisplayName(selectedVehicle, selectedDevice)}</h3>
                  <p className="text-[10px] text-muted-foreground font-mono">{selectedDevice.unique_id || selectedDevice.device_imei || selectedDevice.id}</p>
                </div>
                <button onClick={() => setSelectedDevice(null)} className="h-7 w-7 rounded-lg bg-muted/40 flex items-center justify-center text-muted-foreground hover:text-foreground text-xs">✕</button>
              </div>
              <Info label="Status" value={selectedDevice.online_status || "unknown"} />
              <Info label="Lifecycle" value={selectedDevice.lifecycle_status || "inventory"} />
              <Info label="Last Seen" value={selectedDevice.last_seen_at ? new Date(selectedDevice.last_seen_at).toLocaleString() : "—"} />
              <Info label="Vehicle" value={selectedVehicle ? getVehicleDisplayName(selectedVehicle, selectedDevice) : "Unassigned"} />
              <Info label="Active Booking" value={selectedBooking ? (selectedBooking.customer_full_name || selectedBooking.user_email || selectedBooking.id) : "None"} />
              <Info label="Location" value={selectedDevice.last_latitude && selectedDevice.last_longitude ? `${Number(selectedDevice.last_latitude).toFixed(5)}, ${Number(selectedDevice.last_longitude).toFixed(5)}` : "No GPS fix"} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, color = "text-foreground" }) {
  return <div className="glass rounded-xl p-3 text-center"><Icon className={`h-4 w-4 mx-auto mb-1 ${color}`} /><p className={`text-2xl font-black ${color}`}>{value}</p><p className="text-[10px] text-muted-foreground font-semibold mt-0.5">{label}</p></div>;
}

function Info({ label, value }) {
  return <div className="rounded-xl border border-border bg-muted/20 p-3"><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{label}</p><p className="text-sm font-semibold text-foreground mt-1 break-words">{value}</p></div>;
}