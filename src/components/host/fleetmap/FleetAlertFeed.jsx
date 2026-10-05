import React, { useState } from "react";
import { AlertTriangle, Bell, X, ChevronRight } from "lucide-react";

/**
 * FleetAlertFeed — floating ticker on the map showing live alerts + recent activity.
 * Shows: telematics safety alerts (active rentals), new bookings, recent host activity.
 * Collapsible to a small bell icon with a count badge.
 */
export default function FleetAlertFeed({ alerts = [], activities = [], onAlertClick }) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState({});

  const visibleAlerts = alerts.filter((a) => !dismissed[a.id]);
  const visibleActivities = activities.filter((a) => !dismissed[a.id]);
  const totalCount = visibleAlerts.length + visibleActivities.length;

  if (totalCount === 0 && !expanded) return null;

  // Collapsed: floating bell with badge
  if (!expanded) {
    return (
      <div style={{
        position: "fixed", top: 60, right: 14, zIndex: 40,
        pointerEvents: "auto",
      }}>
        <button
          onClick={() => setExpanded(true)}
          className="control-tap"
          style={{
            width: 44, height: 44, borderRadius: "50%",
            background: "rgba(23,24,28,0.92)", backdropFilter: "blur(16px)",
            border: totalCount > 0 ? "1px solid rgba(255,69,58,0.4)" : "1px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", position: "relative",
            boxShadow: totalCount > 0 ? "0 0 12px rgba(255,69,58,0.25)" : "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <Bell size={18} color={totalCount > 0 ? "#FF453A" : "#8E8E93"} />
          {totalCount > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -4,
              background: "#FF453A", borderRadius: "50%",
              minWidth: 18, height: 18, padding: "0 4px",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 800, color: "#fff",
            }}>{totalCount}</span>
          )}
        </button>
      </div>
    );
  }

  // Expanded: floating panel
  return (
    <div style={{
      position: "fixed", top: 60, right: 14, left: 14, maxWidth: 400, margin: "0 auto",
      zIndex: 40, pointerEvents: "auto",
      background: "rgba(23,24,28,0.94)", backdropFilter: "blur(20px)",
      border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16,
      maxHeight: "60vh", overflowY: "auto",
      boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)",
        position: "sticky", top: 0, background: "rgba(23,24,28,0.94)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={16} color="#FF453A" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#F5F5F7" }}>Live Fleet Alerts</span>
          {totalCount > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "#FF453A", background: "rgba(255,69,58,0.15)", padding: "2px 8px", borderRadius: 999 }}>{totalCount}</span>
          )}
        </div>
        <button onClick={() => setExpanded(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <X size={16} color="#8E8E93" />
        </button>
      </div>

      {/* Alert items */}
      <div style={{ padding: "8px 0" }}>
        {visibleAlerts.length === 0 && visibleActivities.length === 0 && (
          <p style={{ fontSize: 12, color: "#8E8E93", textAlign: "center", padding: "20px 16px" }}>No active alerts. All clear.</p>
        )}
        {visibleAlerts.map((a) => (
          <AlertItem key={a.id} item={a} variant="alert" onClick={() => onAlertClick?.(a)} onDismiss={() => setDismissed((p) => ({ ...p, [a.id]: true }))} />
        ))}
        {visibleActivities.length > 0 && visibleAlerts.length > 0 && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "4px 0" }} />
        )}
        {visibleActivities.map((a) => (
          <AlertItem key={a.id} item={a} variant="activity" onClick={() => onAlertClick?.(a)} onDismiss={() => setDismissed((p) => ({ ...p, [a.id]: true }))} />
        ))}
      </div>
    </div>
  );
}

function AlertItem({ item, variant, onClick, onDismiss }) {
  const isAlert = variant === "alert";
  const color = isAlert ? (item.severity === "critical" ? "#FF453A" : "#FF9F0A") : "#3B82F6";
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "10px 16px", cursor: onClick ? "pointer" : "default",
      transition: "background 0.15s",
    }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      onClick={onClick}
    >
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 5, boxShadow: `0 0 6px ${color}` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: "#F5F5F7", margin: 0, lineHeight: 1.3 }}>{item.title}</p>
        <p style={{ fontSize: 11, color: "#8E8E93", margin: "2px 0 0", lineHeight: 1.3 }}>{item.body || item.summary}</p>
        {item.time && <p style={{ fontSize: 10, color: "#6B6B70", margin: "2px 0 0" }}>{item.time}</p>}
      </div>
      {onDismiss && (
        <button onClick={(e) => { e.stopPropagation(); onDismiss(); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}>
          <X size={12} color="#6B6B70" />
        </button>
      )}
      {onClick && <ChevronRight size={14} color="#6B6B70" style={{ flexShrink: 0, marginTop: 4 }} />}
    </div>
  );
}