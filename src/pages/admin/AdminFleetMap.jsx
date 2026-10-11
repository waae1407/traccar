import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Search, X, Maximize, Minimize, ChevronDown, Check } from "lucide-react";
import FleetMap from "@/components/host/fleetmap/FleetMap";
import AdminScorecardStack from "@/components/admin/fleetmap/AdminScorecardStack";
import AdminSupportQueue from "@/components/admin/fleetmap/AdminSupportQueue";
import AdminVehicleActionSheet from "@/components/admin/fleetmap/AdminVehicleActionSheet";

const ACTIVE_RENTAL_STATUSES = new Set(["active", "confirmed", "approved", "checked_out", "return_required", "payment_due", "grace_period"]);
const OVERDUE_BOOKING_STATUSES = new Set(["payment_due", "grace_period", "suspended"]);
const OVERDUE_PAYMENT_STATUSES = new Set(["failed", "overdue"]);
const ABANDONED_STATUSES = new Set(["draft", "pending_verification", "pending_contract", "pending_payment"]);

export default function AdminFleetMap() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedHostId, setSelectedHostId] = useState(null);
  const [hostDropdownOpen, setHostDropdownOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [focusVehicleId, setFocusVehicleId] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

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

  // ── Data: all vehicles, hosts, devices, bookings ──
  const { data: hosts = [], isLoading: hostsLoading } = useQuery({
    queryKey: ["admin-fleetmap-hosts"],
    queryFn: () => base44.entities.Host.filter({ status: "approved" }, "full_name", 500),
  });

  const { data: vehicles = [], isLoading: vehiclesLoading } = useQuery({
    queryKey: ["admin-fleetmap-vehicles"],
    queryFn: () => base44.entities.Vehicle.filter({}, "-created_date", 500),
    refetchInterval: 60_000,
  });

  const { data: devices = [] } = useQuery({
    queryKey: ["admin-fleetmap-devices"],
    queryFn: () => base44.entities.TelematicsDevice.list("-location_updated_at", 500),
    refetchInterval: 30_000,
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["admin-fleetmap-bookings"],
    queryFn: () => base44.entities.BookingRequest.filter({}, "-created_date", 500),
    refetchInterval: 30_000,
  });

  const { data: pendingHosts = [] } = useQuery({
    queryKey: ["admin-fleetmap-pending-hosts"],
    queryFn: () => base44.entities.Host.filter({ status: "pending" }),
    refetchInterval: 60_000,
  });

  // ── Maps ──
  const hostMap = useMemo(() => {
    const map = {};
    for (const h of hosts) map[h.id] = h;
    for (const h of pendingHosts) map[h.id] = h;
    return map;
  }, [hosts, pendingHosts]);

  const deviceByVehicle = useMemo(() => {
    const map = {};
    for (const d of devices) { if (d.vehicle_id) map[d.vehicle_id] = d; }
    return map;
  }, [devices]);

  const activeBookingByVehicle = useMemo(() => {
    const map = {};
    for (const b of bookings) {
      if (ACTIVE_RENTAL_STATUSES.has(b.booking_status) && b.vehicle_id) {
        if (!map[b.vehicle_id]) map[b.vehicle_id] = b;
      }
    }
    return map;
  }, [bookings]);

  // ── Filtered vehicles (by host + search + filter chip) ──
  const filteredVehicles = useMemo(() => {
    let result = vehicles;
    if (selectedHostId) result = result.filter(v => v.host_id === selectedHostId);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(v => {
        const hostName = hostMap[v.host_id]?.full_name || "";
        return [v.make, v.model, v.vin, v.plate, v.display_name, v.year, hostName]
          .filter(Boolean).some(f => String(f).toLowerCase().includes(q));
      });
    }
    if (filter === "available") result = result.filter(v => v.status === "Available");
    if (filter === "rented") result = result.filter(v => activeBookingByVehicle[v.id] || ["Booked", "Active Rental", "Reserved", "Payment Due", "Grace Period", "Dropoff Submitted", "Return Pending Host Review"].includes(v.status));
    if (filter === "attention") result = result.filter(v => ["Payment Due", "Grace Period", "Suspended", "Maintenance", "Compliance Hold", "Out of Service"].includes(v.status));
    if (filter === "offline") result = result.filter(v => {
      const dev = deviceByVehicle[v.id];
      return !!dev?.id && dev?.online_status !== "online";
    });
    if (filter === "pending_review") {
      const reviewVehicleIds = new Set(bookings.filter(b => b.booking_status === "pending_review").map(b => b.vehicle_id));
      result = result.filter(v => reviewVehicleIds.has(v.id));
    }
    return result;
  }, [vehicles, selectedHostId, search, filter, hostMap, deviceByVehicle, activeBookingByVehicle, bookings]);

  // ── Scorecard counts ──
  const pendingReviews = useMemo(() => bookings.filter(b => b.booking_status === "pending_review").length, [bookings]);
  const overdueRentals = useMemo(() => bookings.filter(b => OVERDUE_BOOKING_STATUSES.has(b.booking_status)).length, [bookings]);
  const overduePayments = useMemo(() => {
    const overdueBookings = bookings.filter(b => OVERDUE_PAYMENT_STATUSES.has(b.payment_status) || OVERDUE_BOOKING_STATUSES.has(b.booking_status));
    return overdueBookings.length;
  }, [bookings]);
  const outOfService = useMemo(() => vehicles.filter(v => v.status === "Out of Service").length, [vehicles]);

  // ── Support queue items ──
  const supportItems = useMemo(() => {
    const items = [];

    // Pending reviews
    for (const b of bookings) {
      if (b.booking_status !== "pending_review") continue;
      items.push({
        id: `review-${b.id}`,
        type: "pending_review",
        severity: "warning",
        title: b.vehicle_name || "Vehicle",
        subtitle: `${b.customer_full_name || b.user_email || "Customer"} · ${b.booking_type || "Weekly"}`,
        created_at: b.submitted_at || b.created_date,
        href: `/admin/booking-360?id=${b.id}`,
      });
    }

    // Host applications
    for (const h of pendingHosts) {
      items.push({
        id: `host-${h.id}`,
        type: "host_application",
        severity: "warning",
        title: h.full_name || h.business_name || "Applicant",
        subtitle: h.email || "—",
        created_at: h.created_date,
        href: `/admin/host-360?id=${h.id}`,
      });
    }

    // Overdue payments
    for (const b of bookings) {
      if (!OVERDUE_PAYMENT_STATUSES.has(b.payment_status) && !OVERDUE_BOOKING_STATUSES.has(b.booking_status)) continue;
      if (["cancelled", "completed", "rejected"].includes(b.booking_status)) continue;
      items.push({
        id: `overdue-${b.id}`,
        type: "overdue_payment",
        severity: "critical",
        title: b.vehicle_name || "Vehicle",
        subtitle: `${b.customer_full_name || b.user_email || "Customer"} · ${b.booking_status?.replace(/_/g, " ") || "Payment issue"}`,
        amount: b.weekly_rate || b.total_due_now || 0,
        created_at: b.last_payment_failure_at || b.grace_period_started_at || b.created_date,
        href: `/admin/booking-360?id=${b.id}`,
      });
    }

    // Out of service vehicles
    for (const v of vehicles) {
      if (v.status !== "Out of Service") continue;
      const host = hostMap[v.host_id];
      items.push({
        id: `oos-${v.id}`,
        type: "out_of_service",
        severity: "warning",
        title: `${v.year} ${v.make} ${v.model}`,
        subtitle: host ? `Host: ${host.full_name}` : "No host linked",
        created_at: v.created_date,
        href: `/admin/vehicle-360?id=${v.id}`,
      });
    }

    // Abandoned checkouts
    for (const b of bookings) {
      if (!ABANDONED_STATUSES.has(b.booking_status)) continue;
      if (b.abandoned_checkout) continue;
      items.push({
        id: `abandoned-${b.id}`,
        type: "abandoned_checkout",
        severity: "info",
        title: b.vehicle_name || "Vehicle",
        subtitle: `${b.customer_full_name || b.user_email || "Customer"} · ${b.booking_status?.replace(/_/g, " ")}`,
        created_at: b.created_date,
        href: `/admin/booking-360?id=${b.id}`,
      });
    }

    return items;
  }, [bookings, pendingHosts, vehicles, hostMap]);

  // ── Fleet stats ──
  const fleetStats = useMemo(() => ({
    total: filteredVehicles.length,
    available: filteredVehicles.filter(v => v.status === "Available").length,
    rented: filteredVehicles.filter(v => activeBookingByVehicle[v.id] || ["Booked", "Active Rental", "Reserved", "Payment Due", "Grace Period", "Dropoff Submitted", "Return Pending Host Review"].includes(v.status)).length,
    attention: filteredVehicles.filter(v => ["Payment Due", "Grace Period", "Suspended", "Maintenance", "Compliance Hold", "Out of Service"].includes(v.status)).length,
    offline: filteredVehicles.filter(v => {
      const dev = deviceByVehicle[v.id];
      return !!dev?.id && dev?.online_status !== "online";
    }).length,
  }), [filteredVehicles, activeBookingByVehicle, deviceByVehicle]);

  // ── Handlers ──
  const handleSelectVehicle = useCallback((vehicle) => {
    setSelectedVehicle(vehicle);
    setFocusVehicleId(vehicle.id);
  }, []);

  const selectedHost = selectedVehicle ? hostMap[selectedVehicle.host_id] : null;
  const selectedDevice = selectedVehicle ? deviceByVehicle[selectedVehicle.id] : null;
  const selectedBooking = selectedVehicle ? activeBookingByVehicle[selectedVehicle.id] : null;

  if (hostsLoading || vehiclesLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#050506" }}>
        <div style={{ width: 32, height: 32, border: "3px solid #E91E8C", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  const selectedHostName = selectedHostId ? hostMap[selectedHostId]?.full_name || "Unknown Host" : "All Hosts";

  return (
    <div ref={containerRef} style={{ position: "fixed", inset: 0, background: "#050506", overflow: "hidden" }}>
      {/* ── Full-screen map ── */}
      <FleetMap
        vehicles={filteredVehicles}
        devices={devices}
        onSelectVehicle={handleSelectVehicle}
        onLongPressVehicle={() => {}}
        focusVehicleId={focusVehicleId}
      />

      {/* ── Top bar ── */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 30,
        padding: "10px 14px",
        background: "linear-gradient(180deg, rgba(5,5,6,0.92) 0%, rgba(5,5,6,0.6) 70%, transparent 100%)",
        pointerEvents: "none",
      }}>
        <div style={{ maxWidth: 430, margin: "0 auto", pointerEvents: "auto" }}>
          {/* Search + Host filter */}
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(23,24,28,0.92)", backdropFilter: "blur(16px)",
              border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14,
              padding: "8px 12px", flex: 1,
            }}>
              <Search size={16} color="#8E8E93" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search vehicle, VIN, host..."
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#F5F5F7", fontSize: 14, fontFamily: "inherit" }}
              />
              {search && (
                <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                  <X size={14} color="#8E8E93" />
                </button>
              )}
            </div>

            {/* Host filter dropdown */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setHostDropdownOpen(!hostDropdownOpen)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "rgba(23,24,28,0.92)", backdropFilter: "blur(16px)",
                  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14,
                  padding: "8px 12px", cursor: "pointer", color: "#F5F5F7",
                  fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                }}
              >
                <span style={{ maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis" }}>{selectedHostName}</span>
                <ChevronDown size={14} color="#8E8E93" />
              </button>
              {hostDropdownOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setHostDropdownOpen(false)} />
                  <div style={{
                    position: "absolute", top: "100%", right: 0, marginTop: 4,
                    background: "#1C1D21", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 14, padding: 6, maxHeight: 300, overflowY: "auto",
                    zIndex: 41, minWidth: 200, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                  }}>
                    <button
                      onClick={() => { setSelectedHostId(null); setHostDropdownOpen(false); }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "8px 12px", borderRadius: 10, cursor: "pointer", width: "100%",
                        background: !selectedHostId ? "rgba(233,30,140,0.15)" : "none", border: "none",
                        color: "#F5F5F7", fontSize: 13, fontWeight: 600, textAlign: "left",
                      }}
                    >
                      All Hosts
                      {!selectedHostId && <Check size={14} color="#E91E8C" />}
                    </button>
                    {hosts.map(h => (
                      <button
                        key={h.id}
                        onClick={() => { setSelectedHostId(h.id); setHostDropdownOpen(false); }}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "8px 12px", borderRadius: 10, cursor: "pointer", width: "100%",
                          background: selectedHostId === h.id ? "rgba(233,30,140,0.15)" : "none", border: "none",
                          color: "#F5F5F7", fontSize: 13, textAlign: "left",
                        }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {h.full_name || h.business_name || h.email}
                        </span>
                        {selectedHostId === h.id && <Check size={14} color="#E91E8C" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Filter chips */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }} className="no-scrollbar">
            <FilterChip label="All" count={fleetStats.total} active={filter === "all"} onClick={() => setFilter("all")} />
            <FilterChip label="Available" count={fleetStats.available} active={filter === "available"} onClick={() => setFilter("available")} color="#22C55E" />
            <FilterChip label="Rented" count={fleetStats.rented} active={filter === "rented"} onClick={() => setFilter("rented")} color="#3B82F6" />
            {fleetStats.attention > 0 && <FilterChip label="Attention" count={fleetStats.attention} active={filter === "attention"} onClick={() => setFilter("attention")} color="#FF9F0A" pulse />}
            {fleetStats.offline > 0 && <FilterChip label="Offline GPS" count={fleetStats.offline} active={filter === "offline"} onClick={() => setFilter("offline")} color="#8E8E93" />}
            {pendingReviews > 0 && <FilterChip label="Pending Review" count={pendingReviews} active={filter === "pending_review"} onClick={() => setFilter("pending_review")} color="#FF9F0A" />}
          </div>
        </div>
      </div>

      {/* ── Scorecard stack (left side) ── */}
      <AdminScorecardStack
        pendingReviews={pendingReviews}
        pendingHosts={pendingHosts.length}
        overdueRentals={overdueRentals}
        outOfService={outOfService}
        overduePayments={overduePayments}
        onNavigate={(path) => window.location.assign(path)}
      />

      {/* ── Fullscreen toggle ── */}
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
        }}
      >
        {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
      </button>

      {/* ── Support queue (bottom) ── */}
      <AdminSupportQueue items={supportItems} />

      {/* ── Vehicle action sheet ── */}
      {selectedVehicle && (
        <AdminVehicleActionSheet
          vehicle={selectedVehicle}
          device={selectedDevice}
          host={selectedHost}
          activeBooking={selectedBooking}
          onClose={() => setSelectedVehicle(null)}
        />
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
        background: active ? (color ? `${color}25` : "rgba(233,30,140,0.15)") : "rgba(23,24,28,0.8)",
        border: active ? `1px solid ${color || "#E91E8C"}` : "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(12px)", cursor: "pointer", flexShrink: 0,
        transition: "all 0.15s",
      }}
    >
      {pulse && <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, animation: "pulse 1.5s infinite" }} />}
      <span style={{ fontSize: 12, fontWeight: 600, color: active ? (color || "#E91E8C") : "#8E8E93", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: active ? (color || "#E91E8C") : "#6B6B70" }}>{count}</span>
    </button>
  );
}