import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Search, X, Clock, Maximize, Minimize } from "lucide-react";
import FleetMap from "@/components/host/fleetmap/FleetMap";
import VehicleActionSheet from "@/components/host/fleetmap/VehicleActionSheet";
import QuickCommandMenu from "@/components/host/fleetmap/QuickCommandMenu";
import FleetAlertFeed from "@/components/host/fleetmap/FleetAlertFeed";
import FleetMapBottomNav from "@/components/host/fleetmap/FleetMapBottomNav";

const ACTIVE_RENTAL_STATUSES = new Set(["active", "confirmed", "approved", "checked_out", "return_required", "payment_due", "grace_period"]);

export default function HostFleetMap() {
  const { user, isLoading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all, available, rented, attention, contactless
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [quickMenu, setQuickMenu] = useState(null); // { vehicle, device, position }
  const [focusVehicleId, setFocusVehicleId] = useState(null);
  const [commandLoading, setCommandLoading] = useState(null);
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // ── Data ──
  const { data: hosts = [] } = useQuery({
    queryKey: ["my-host-profile", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user?.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const { data: vehicles = [], isLoading: vehiclesLoading } = useQuery({
    queryKey: ["host-fleetmap-vehicles", host?.id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const { data: devices = [] } = useQuery({
    queryKey: ["host-fleetmap-devices", host?.id],
    queryFn: () => base44.entities.TelematicsDevice.filter({ host_id: host.id }),
    enabled: !!host?.id,
    refetchInterval: 30_000,
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["host-fleetmap-bookings", host?.id],
    queryFn: () => base44.entities.BookingRequest.filter({ host_id: host.id }, "-created_date", 100),
    enabled: !!host?.id,
    refetchInterval: 30_000,
  });

  const { data: safetyEvents = [] } = useQuery({
    queryKey: ["host-fleetmap-safety", host?.id],
    queryFn: () => base44.entities.TelematicsSafetyEvent.filter({ host_id: host.id, is_active: true }, "-created_date", 20),
    enabled: !!host?.id,
    refetchInterval: 15_000,
  });

  const { data: activityEvents = [] } = useQuery({
    queryKey: ["host-fleetmap-activity", host?.id],
    queryFn: () => base44.entities.ActivityEvent.filter({ host_id: host.id }, "-created_date", 20),
    enabled: !!host?.id,
    refetchInterval: 30_000,
  });

  // ── Device by vehicle map ──
  const deviceByVehicle = useMemo(() => {
    const map = {};
    for (const d of devices) { if (d.vehicle_id) map[d.vehicle_id] = d; }
    return map;
  }, [devices]);

  // ── Active booking by vehicle ──
  const activeBookingByVehicle = useMemo(() => {
    const map = {};
    for (const b of bookings) {
      if (ACTIVE_RENTAL_STATUSES.has(b.booking_status) && b.vehicle_id) {
        if (!map[b.vehicle_id]) map[b.vehicle_id] = b;
      }
    }
    return map;
  }, [bookings]);

  // ── Filtered vehicles ──
  const filteredVehicles = useMemo(() => {
    let result = vehicles;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((v) =>
        [v.make, v.model, v.vin, v.plate, v.display_name, v.year].filter(Boolean).some((f) => String(f).toLowerCase().includes(q))
      );
    }
    if (filter === "available") result = result.filter((v) => v.status === "Available");
    if (filter === "rented") result = result.filter((v) => ["Booked", "Active Rental", "Reserved", "Payment Due", "Grace Period", "Dispute Hold", "Dropoff Submitted", "Return Pending Host Review"].includes(v.status) || activeBookingByVehicle[v.id]);
    if (filter === "attention") result = result.filter((v) => ["Payment Due", "Grace Period", "Suspended", "Maintenance", "Compliance Hold"].includes(v.status));
    if (filter === "contactless") {
      // Contactless360-ready: has a Traccar device linked AND device is online
      result = result.filter((v) => {
        const dev = deviceByVehicle[v.id];
        return !!dev?.traccar_device_id && dev?.online_status === "online";
      });
    }
    return result;
  }, [vehicles, search, filter, deviceByVehicle]);

  // ── Alerts for the feed ──
  const alerts = useMemo(() => {
    return safetyEvents
      .filter((e) => e.is_active && e.visible_to_host !== false)
      .slice(0, 8)
      .map((e) => ({
        id: e.id,
        title: e.alert_title || e.alert_message || "Safety Alert",
        body: e.alert_message || e.vehicle_name,
        severity: e.severity || "warning",
        time: e.created_date ? new Date(e.created_date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "",
        vehicle_id: e.vehicle_id,
        href: "/host/alert360",
      }));
  }, [safetyEvents]);

  const activities = useMemo(() => {
    const recentBookings = bookings
      .filter((b) => b.created_date && Date.now() - new Date(b.created_date).getTime() < 24 * 60 * 60 * 1000)
      .slice(0, 5)
      .map((b) => ({
        id: `booking-${b.id}`,
        title: `New booking: ${b.vehicle_name || "Vehicle"}`,
        body: `${b.customer_full_name || b.user_email || "Customer"} · ${b.booking_type || "Weekly"}`,
        time: b.created_date ? new Date(b.created_date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "",
        vehicle_id: b.vehicle_id,
        href: "/host/booking-360",
      }));
    const recentActivity = activityEvents
      .slice(0, 8)
      .map((e) => ({
        id: `activity-${e.id}`,
        title: e.summary || e.event_title || "Activity",
        body: e.event_description || e.target_label || "",
        time: e.created_date ? new Date(e.created_date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "",
        vehicle_id: e.vehicle_id,
        href: null,
      }));
    return [...recentBookings, ...recentActivity].slice(0, 12);
  }, [bookings, activityEvents]);

  // ── Handlers ──
  const handleSelectVehicle = useCallback((vehicle) => {
    setSelectedVehicle(vehicle);
    setQuickMenu(null);
  }, []);

  const handleLongPressVehicle = useCallback((vehicle, evt) => {
    const touch = evt?.touches?.[0] || evt?.changedTouches?.[0];
    const x = touch ? touch.clientX : evt?.clientX || window.innerWidth / 2;
    const y = touch ? touch.clientY : evt?.clientY || window.innerHeight / 2;
    setQuickMenu({ vehicle, device: deviceByVehicle[vehicle.id], position: { x, y: y - 20 } });
  }, [deviceByVehicle]);

  const handleCommand = useCallback(async (type) => {
    const device = selectedVehicle ? deviceByVehicle[selectedVehicle.id] : quickMenu?.device;
    const vehicle = selectedVehicle || quickMenu?.vehicle;
    if (!device?.id || !vehicle?.id) return;
    setCommandLoading(type);
    try {
      const { default: TelematicsService } = await import("@/lib/telematics/TelematicsService");
      const { toast } = await import("sonner");
      if (type === "find" || type === "horn") {
        await TelematicsService.startAlarm({ vehicle_id: vehicle.id, telematics_device_id: device.id });
        toast.success("Alarm activated");
      } else {
        await TelematicsService.sendCommand({
          telematics_device_id: device.id, vehicle_id: vehicle.id,
          command_type: type, source: "fleet_map",
        });
        toast.success(`Command sent: ${type}`);
      }
    } catch (err) {
      const { toast } = await import("sonner");
      toast.error("Command failed", { description: err?.message || "Unknown error" });
    }
    setCommandLoading(null);
  }, [selectedVehicle, quickMenu, deviceByVehicle]);

  // ── Pending host ──
  if (!authLoading && host && host.status !== "approved") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#050506", color: "#F5F5F7" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Clock size={28} color="#8E8E93" />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>Application Pending</h2>
          <p style={{ fontSize: 14, color: "#8E8E93", maxWidth: 320 }}>Your Fleet Partner application is under review. You'll receive an email once approved.</p>
        </div>
      </div>
    );
  }

  if (authLoading || vehiclesLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#050506" }}>
        <div style={{ width: 32, height: 32, border: "3px solid #2F80FF", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  const fleetStats = {
    total: vehicles.length,
    available: vehicles.filter((v) => v.status === "Available").length,
    rented: vehicles.filter((v) => ["Booked", "Active Rental", "Reserved", "Payment Due", "Grace Period", "Dispute Hold", "Dropoff Submitted", "Return Pending Host Review"].includes(v.status) || activeBookingByVehicle[v.id]).length,
    attention: vehicles.filter((v) => ["Payment Due", "Grace Period", "Suspended", "Maintenance", "Compliance Hold"].includes(v.status)).length,
    contactless: vehicles.filter((v) => {
      const dev = deviceByVehicle[v.id];
      return !!dev?.traccar_device_id && dev?.online_status === "online";
    }).length,
  };

  return (
    <div ref={containerRef} style={{ position: "fixed", inset: 0, background: "#050506", overflow: "hidden" }}>
      {/* ── Full-screen map ── */}
      <FleetMap
        vehicles={filteredVehicles}
        devices={devices}
        onSelectVehicle={handleSelectVehicle}
        onLongPressVehicle={handleLongPressVehicle}
        focusVehicleId={focusVehicleId}
      />

      {/* ── Top bar (search + filter chips + stats) ── */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 30,
        padding: "10px 14px",
        background: "linear-gradient(180deg, rgba(5,5,6,0.92) 0%, rgba(5,5,6,0.6) 70%, transparent 100%)",
        pointerEvents: "none",
      }}>
        <div style={{ maxWidth: 430, margin: "0 auto", pointerEvents: "auto" }}>
          {/* Search */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(23,24,28,0.92)", backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14,
            padding: "8px 12px", marginBottom: 8,
          }}>
            <Search size={16} color="#8E8E93" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vehicle, VIN, plate..."
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                color: "#F5F5F7", fontSize: 14, fontFamily: "inherit",
              }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                <X size={14} color="#8E8E93" />
              </button>
            )}
          </div>

          {/* Filter chips */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }} className="no-scrollbar">
            <FilterChip label="All" count={fleetStats.total} active={filter === "all"} onClick={() => setFilter("all")} />
            <FilterChip label="Available" count={fleetStats.available} active={filter === "available"} onClick={() => setFilter("available")} color="#22C55E" />
            <FilterChip label="Rented" count={fleetStats.rented} active={filter === "rented"} onClick={() => setFilter("rented")} color="#3B82F6" />
            <FilterChip label="C360 GPS" count={fleetStats.contactless} active={filter === "contactless"} onClick={() => setFilter("contactless")} color="#22C55E" />
            {fleetStats.attention > 0 && (
              <FilterChip label="Attention" count={fleetStats.attention} active={filter === "attention"} onClick={() => {
                setFilter("attention");
                const attentionVehicles = vehicles.filter((v) => ["Payment Due", "Grace Period", "Suspended", "Maintenance", "Compliance Hold"].includes(v.status));
                if (attentionVehicles.length > 0) {
                  setFocusVehicleId(attentionVehicles[0].id);
                  setSelectedVehicle(attentionVehicles[0]);
                }
              }} color="#FF9F0A" pulse />
            )}
          </div>
        </div>
      </div>

      {/* ── Fullscreen toggle (top-right, for TV/desktop monitoring) ── */}
      <button
        onClick={toggleFullscreen}
        title={isFullscreen ? "Exit fullscreen" : "Fullscreen monitoring mode"}
        style={{
          position: "fixed", top: 10, right: 10, zIndex: 40,
          width: 38, height: 38, borderRadius: 12,
          background: "rgba(23,24,28,0.92)", backdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: "#F5F5F7",
          transition: "all 0.15s",
        }}
      >
        {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
      </button>

      {/* ── Live alert + activity feed ── */}
      <FleetAlertFeed
        alerts={alerts}
        activities={activities}
        onAlertClick={(item) => {
          if (item.vehicle_id) setFocusVehicleId(item.vehicle_id);
        }}
      />

      {/* ── Quick command menu (long-press) ── */}
      {quickMenu && (
        <QuickCommandMenu
          vehicle={quickMenu.vehicle}
          device={quickMenu.device}
          position={quickMenu.position}
          onClose={() => setQuickMenu(null)}
          onCommand={handleCommand}
        />
      )}

      {/* ── Vehicle action sheet (tap) ── */}
      {selectedVehicle && (
        <VehicleActionSheet
          vehicle={selectedVehicle}
          device={deviceByVehicle[selectedVehicle.id]}
          activeBooking={activeBookingByVehicle[selectedVehicle.id]}
          onClose={() => setSelectedVehicle(null)}
          onCommand={handleCommand}
        />
      )}

      {/* ── Collapsible bottom nav ── */}
      <FleetMapBottomNav visible={!isFullscreen} />

      {/* Loading overlay for commands */}
      {commandLoading && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", zIndex: 100 }}>
          <div style={{ width: 40, height: 40, border: "3px solid #2F80FF", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, count, active, onClick, color, pulse }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "6px 12px", borderRadius: 999,
        background: active ? (color ? `${color}25` : "rgba(47,128,255,0.15)") : "rgba(23,24,28,0.8)",
        border: active ? `1px solid ${color || "#2F80FF"}` : "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(12px)", cursor: "pointer", flexShrink: 0,
        transition: "all 0.15s",
      }}
    >
      {pulse && <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, animation: "pulse 1.5s infinite" }} />}
      <span style={{ fontSize: 12, fontWeight: 600, color: active ? (color || "#2F80FF") : "#8E8E93", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: active ? (color || "#2F80FF") : "#6B6B70" }}>{count}</span>
    </button>
  );
}