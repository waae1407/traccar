import React from "react";
import { useNavigate } from "react-router-dom";
import { X, MapPin, User, Calendar, ExternalLink, Settings, Flame } from "lucide-react";
import { getCheckoutStepProgress } from "@/lib/fleetmap/bookingIntent";

const LABEL_FONT = "'Barlow Condensed', sans-serif";

const STATUS_COLORS = {
  Available: "#22C55E",
  Booked: "#3B82F6",
  "Active Rental": "#22C55E",
  Reserved: "#3B82F6",
  "Payment Due": "#FF9F0A",
  "Grace Period": "#FF9F0A",
  Suspended: "#EF4444",
  Maintenance: "#FF9F0A",
  "Compliance Hold": "#FF9F0A",
  "Out of Service": "#EF4444",
  "Dropoff Submitted": "#2F80FF",
  "Return Pending Host Review": "#FF9F0A",
  "Dispute Hold": "#EF4444",
  "Cleaning Hold": "#FF9F0A",
  "Maintenance Hold": "#FF9F0A",
  Retired: "#8E8E93",
  Transferred: "#8E8E93",
};

export default function AdminVehicleActionSheet({ vehicle, device, host, activeBooking, pendingBooking, onClose }) {
  const navigate = useNavigate();
  if (!vehicle) return null;

  const vehicleName = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle";
  const statusColor = STATUS_COLORS[vehicle.status] || "#8E8E93";
  const hasGps = !!device?.id;
  const isOnline = device?.online_status === "online";

  const actionBtn = (label, Icon, onClick, color = "#2F80FF") => (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "12px 14px", borderRadius: 12,
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
        cursor: "pointer", width: "100%", textAlign: "left",
        transition: "all 0.15s",
      }}
    >
      <Icon size={16} color={color} />
      <span style={{ fontSize: 13, fontWeight: 600, color: "#F5F5F7" }}>{label}</span>
      <ExternalLink size={12} color="#6B6B70" style={{ marginLeft: "auto" }} />
    </button>
  );

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
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                color: statusColor, fontFamily: LABEL_FONT,
                background: `${statusColor}20`, padding: "2px 8px", borderRadius: 6,
              }}>
                {vehicle.status || "Unknown"}
              </span>
              {hasGps && (
                <span style={{
                  fontSize: 10, fontWeight: 600, color: isOnline ? "#22C55E" : "#8E8E93",
                  display: "flex", alignItems: "center", gap: 3,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: isOnline ? "#22C55E" : "#8E8E93" }} />
                  GPS {isOnline ? "Online" : "Offline"}
                </span>
              )}
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "#F5F5F7", margin: 0, fontFamily: LABEL_FONT }}>
              {vehicleName}
            </h3>
            {vehicle.plate && <p style={{ fontSize: 12, color: "#8E8E93", margin: "2px 0 0" }}>{vehicle.plate}</p>}
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.06)", border: "none",
            width: 30, height: 30, borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "#8E8E93", flexShrink: 0,
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Host info */}
        {host && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(47,128,255,0.08)", borderRadius: 12,
            padding: "10px 14px", marginBottom: 12,
            border: "1px solid rgba(47,128,255,0.15)",
          }}>
            <User size={16} color="#2F80FF" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, color: "#8E8E93", margin: 0 }}>Host</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#F5F5F7", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {host.full_name || host.business_name || "—"}
              </p>
            </div>
            <button onClick={() => navigate(`/admin/host-360?id=${host.id}`)} style={{
              background: "none", border: "none", cursor: "pointer", color: "#2F80FF", fontSize: 11, fontWeight: 600,
            }}>
              View →
            </button>
          </div>
        )}

        {/* Active booking info */}
        {activeBooking && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(34,197,94,0.08)", borderRadius: 12,
            padding: "10px 14px", marginBottom: 12,
            border: "1px solid rgba(34,197,94,0.15)",
          }}>
            <Calendar size={16} color="#22C55E" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, color: "#8E8E93", margin: 0 }}>Active Booking</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#F5F5F7", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activeBooking.customer_full_name || activeBooking.user_email || "Customer"}
              </p>
            </div>
            {activeBooking.weekly_rate > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: "#22C55E" }}>
                ${activeBooking.weekly_rate}/wk
              </span>
            )}
          </div>
        )}

        {/* Live Interest — customer in checkout flow right now */}
        {pendingBooking && (() => {
          const prog = getCheckoutStepProgress(pendingBooking.checkout_step);
          const minsAgo = pendingBooking.created_date
            ? Math.floor((Date.now() - new Date(pendingBooking.created_date).getTime()) / 60000)
            : 0;
          const timeLabel = minsAgo < 1 ? "just now" : minsAgo < 60 ? `${minsAgo}m ago` : `${Math.floor(minsAgo / 60)}h ago`;
          return (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "linear-gradient(135deg, rgba(255,159,10,0.12), rgba(255,159,10,0.04))",
              borderRadius: 12, padding: "10px 14px", marginBottom: 12,
              border: "1px solid rgba(255,159,10,0.3)",
            }}>
              <Flame size={16} color="#FF9F0A" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#FF9F0A", margin: 0, fontFamily: LABEL_FONT }}>
                  Live Interest
                </p>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#F5F5F7", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pendingBooking.customer_full_name || pendingBooking.user_email || "Customer"}
                </p>
                <p style={{ fontSize: 11, color: "#8E8E93", margin: "2px 0 0" }}>
                  Step {prog.step}/{prog.total} · {prog.label?.replace(/_/g, " ") || "checkout"} · {timeLabel}
                </p>
              </div>
              <button onClick={() => navigate(`/admin/booking-360?id=${pendingBooking.id}`)} style={{
                background: "rgba(255,159,10,0.15)", border: "1px solid rgba(255,159,10,0.3)",
                borderRadius: 8, padding: "5px 10px", cursor: "pointer",
                fontSize: 11, fontWeight: 700, color: "#FF9F0A", whiteSpace: "nowrap",
              }}>
                View →
              </button>
            </div>
          );
        })()}

        {/* GPS location */}
        {hasGps && device?.last_latitude && device?.last_longitude && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,0.04)", borderRadius: 12,
            padding: "10px 14px", marginBottom: 12,
          }}>
            <MapPin size={16} color="#8E8E93" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, color: "#8E8E93", margin: 0 }}>GPS Location</p>
              <p style={{ fontSize: 12, color: "#F5F5F7", margin: "2px 0 0" }}>
                {device.address || `${device.last_latitude.toFixed(4)}, ${device.last_longitude.toFixed(4)}`}
              </p>
            </div>
            <a
              href={`https://www.google.com/maps?q=${device.last_latitude},${device.last_longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: "none", border: "none", cursor: "pointer", color: "#2F80FF", fontSize: 11, fontWeight: 600 }}
            >
              Open →
            </a>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {activeBooking && actionBtn("View Booking 360", Calendar, () => navigate(`/admin/booking-360?id=${activeBooking.id}`))}
          {actionBtn("View Vehicle 360", Settings, () => navigate(`/admin/vehicle-360?id=${vehicle.id}`), "#FF9F0A")}
          {host && actionBtn("View Host 360", User, () => navigate(`/admin/host-360?id=${host.id}`), "#2F80FF")}
        </div>
      </div>
    </>
  );
}