import React from "react";
import { useNavigate } from "react-router-dom";
import { X, Users, Car, DollarSign, BarChart3, CalendarDays, MapPin, Wrench, Shield, Satellite, BookOpen, Lock, Unlock, Navigation } from "lucide-react";

const LABEL_FONT = "'Barlow Condensed', sans-serif";

export default function VehicleActionSheet({ vehicle, device, activeBooking, onClose, onCommand }) {
  const navigate = useNavigate();
  if (!vehicle) return null;

  const v = vehicle;
  const name = v.display_name || [v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle";
  const photo = v.hero_image_url || v.image_url;
  const hasGps = !!device?.id;

  const actions = [
    { icon: Users, label: "Customer 360", sub: activeBooking ? activeBooking.customer_full_name || activeBooking.user_email : "Rental history", href: activeBooking ? `/host/customer-360?search=${encodeURIComponent(activeBooking.user_email || activeBooking.customer_full_name || "")}` : `/host/customer-360`, color: "#3B82F6" },
    { icon: Car, label: "Vehicle 360", sub: "Full operational view", href: `/host/vehicle-360?id=${v.id}`, color: "#8B5CF6" },
    { icon: DollarSign, label: "P&L", sub: "Profitability", href: `/host/pnl?vehicle_id=${v.id}`, color: "#22C55E" },
    { icon: BarChart3, label: "Reports", sub: "Run reports", href: `/host/reports?vehicle_id=${v.id}`, color: "#F59E0B" },
    { icon: CalendarDays, label: "Schedule", sub: "Availability calendar", href: `/host/vehicles?vehicle_id=${v.id}`, color: "#EC4899" },
    { icon: MapPin, label: "Geofencing", sub: "Location alerts", href: `/host/telematics?vehicle_id=${v.id}`, color: "#06B6D4" },
    { icon: Wrench, label: "Maintenance", sub: "Service history", href: `/host/maintenance?vehicle_id=${v.id}`, color: "#F97316" },
    { icon: Shield, label: "Compliance", sub: "Docs & expiry", href: `/host/compliance?vehicle_id=${v.id}`, color: "#EF4444" },
    { icon: Satellite, label: "Telematics", sub: "GPS & controls", href: `/host/telematics?vehicle_id=${v.id}`, color: "#10B981" },
    { icon: BookOpen, label: "Bookings", sub: "All rentals", href: `/host/booking-360?vehicle_id=${v.id}`, color: "#6366F1" },
  ];

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90 }} onClick={onClose} />
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 430, background: "#17181C",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "20px 20px 0 0",
        padding: "16px 16px 24px",
        zIndex: 91,
        maxHeight: "80vh", overflowY: "auto",
        animation: "slideUp 0.3s ease-out",
      }}>
        <style>{`@keyframes slideUp { from { transform: translateX(-50%) translateY(100%); } to { transform: translateX(-50%) translateY(0); } }`}</style>

        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 12px" }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          {photo ? (
            <img src={photo} alt={name} style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover", border: "1px solid rgba(255,255,255,0.1)" }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: 12, background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🚗</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#F5F5F7", margin: 0, textTransform: "capitalize" }}>{name.toLowerCase()}</p>
            <p style={{ fontSize: 12, color: "#8E8E93", margin: "2px 0 0" }}>
              {v.plate || v.vin?.slice(-6) || "—"} · {v.status}
            </p>
            {activeBooking && (
              <p style={{ fontSize: 11, color: "#3B82F6", margin: "2px 0 0", fontWeight: 600 }}>
                Rented by {activeBooking.customer_full_name || activeBooking.user_email}
              </p>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 8 }}>
            <X size={20} color="#8E8E93" />
          </button>
        </div>

        {/* Quick Controls (GPS only) */}
        {hasGps && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <QuickControlBtn icon={Lock} label="Lock" onClick={() => onCommand("lock")} />
            <QuickControlBtn icon={Unlock} label="Unlock" onClick={() => onCommand("unlock")} />
            <QuickControlBtn icon={Navigation} label="Locate" onClick={() => onCommand("find")} />
          </div>
        )}

        {/* Action Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={() => navigate(a.href)}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 14,
                padding: "12px 8px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                cursor: "pointer", transition: "all 0.15s",
              }}
              className="control-tap"
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${a.color}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <a.icon size={18} color={a.color} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#F5F5F7", fontFamily: LABEL_FONT, letterSpacing: "0.03em", textTransform: "uppercase", lineHeight: 1.1, textAlign: "center" }}>{a.label}</span>
              <span style={{ fontSize: 9, color: "#8E8E93", textAlign: "center", lineHeight: 1.1 }}>{a.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function QuickControlBtn({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="control-tap"
      style={{
        flex: 1, height: 52, borderRadius: 12,
        background: "rgba(47,128,255,0.10)", border: "1px solid rgba(59,130,246,0.3)",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        cursor: "pointer", transition: "all 0.15s",
      }}
    >
      <Icon size={18} color="#3B82F6" />
      <span style={{ fontSize: 12, fontWeight: 700, color: "#F5F5F7", fontFamily: LABEL_FONT, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</span>
    </button>
  );
}