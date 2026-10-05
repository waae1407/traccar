import React, { useState, useCallback } from "react";
import { AlertTriangle, Bell, X, ChevronRight, CheckCheck } from "lucide-react";

/**
 * FleetAlertFeed — floating ticker on the map showing live alerts + recent activity.
 * Tracks read state locally so the badge reflects UNREAD items only.
 * "Mark all read" clears the badge; new alerts (new IDs from refetch) re-trigger it.
 */
export default function FleetAlertFeed({ alerts = [], activities = [], onAlertClick }) {
  const [expanded, setExpanded] = useState(false);
  const [readIds, setReadIds] = useState(new Set());

  const markAllRead = useCallback(() => {
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const a of alerts) next.add(a.id);
      for (const a of activities) next.add(a.id);
      return next;
    });
  }, [alerts, activities]);

  const unreadAlerts = alerts.filter((a) => !readIds.has(a.id));
  const unreadActivities = activities.filter((a) => !readIds.has(a.id));
  const unreadCount = unreadAlerts.length + unreadActivities.length;

  // Collapsed: floating bell with badge (unread count only)
  if (!expanded) {
    return (
      <div style={{ position: "fixed", top: 60, right: 14, zIndex: 40, pointerEvents: "auto" }}>
        <button
          onClick={() => setExpanded(true)}
          className="control-tap"
          style={{
            width: 44, height: 44, borderRadius: "50%",
            background: "rgba(23,24,28,0.92)", backdropFilter: "blur(16px)",
            border: unreadCount > 0 ? "1px solid rgba(255,69,58,0.4)" : "1px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", position: "relative",
            boxShadow: unreadCount > 0 ? "0 0 12px rgba(255,69,58,0.25)" : "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <Bell size={18} color={unreadCount > 0 ? "#FF453A" : "#8E8E93"} />
          {unreadCount > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -4,
              background: "#FF453A", borderRadius: "50%",
              minWidth: 18, height: 18, padding: "0 4px",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 800, color: "#fff",
            }}>{unreadCount}</span>
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
          <AlertTriangle size={16} color={unreadCount > 0 ? "#FF453A" : "#8E8E93"} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#F5F5F7" }}>Live Fleet Alerts</span>
          {unreadCount > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "#FF453A", background: "rgba(255,69,58,0.15)", padding: "2px 8px", borderRadius: 999 }}>{unreadCount} new</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              title="Mark all as read"
              style={{
                display: "flex", alignItems: "center", gap: 4,
                background: "rgba(47,128,255,0.12)", border: "1px solid rgba(47,128,255,0.25)",
                borderRadius: 8, padding: "5px 10px", cursor: "pointer",
                fontSize: 11, fontWeight: 600, color: "#2F80FF",
              }}
            >
              <CheckCheck size={13} />
              <span>Mark all read</span>
            </button>
          )}
          <button onClick={() => setExpanded(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={16} color="#8E8E93" />
          </button>
        </div>
      </div>

      {/* Items */}
      <div style={{ padding: "8px 0" }}>
        {alerts.length === 0 && activities.length === 0 && (
          <p style={{ fontSize: 12, color: "#8E8E93", textAlign: "center", padding: "20px 16px" }}>No active alerts. All clear.</p>
        )}
        {alerts.map((a) => (
          <AlertItem key={a.id} item={a} variant="alert" isRead={readIds.has(a.id)} onClick={() => onAlertClick?.(a)} />
        ))}
        {activities.length > 0 && alerts.length > 0 && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "4px 0" }} />
        )}
        {activities.map((a) => (
          <AlertItem key={a.id} item={a} variant="activity" isRead={readIds.has(a.id)} onClick={() => onAlertClick?.(a)} />
        ))}
      </div>
    </div>
  );
}

function AlertItem({ item, variant, isRead, onClick }) {
  const isAlert = variant === "alert";
  const color = isAlert ? (item.severity === "critical" ? "#FF453A" : "#FF9F0A") : "#3B82F6";
  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "10px 16px", cursor: onClick ? "pointer" : "default",
        opacity: isRead ? 0.45 : 1,
        transition: "background 0.15s, opacity 0.2s",
      }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      onClick={onClick}
    >
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 5, boxShadow: isRead ? "none" : `0 0 6px ${color}` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: "#F5F5F7", margin: 0, lineHeight: 1.3 }}>{item.title}</p>
        <p style={{ fontSize: 11, color: "#8E8E93", margin: "2px 0 0", lineHeight: 1.3 }}>{item.body || item.summary}</p>
        {item.time && <p style={{ fontSize: 10, color: "#6B6B70", margin: "2px 0 0" }}>{item.time}</p>}
      </div>
      {onClick && <ChevronRight size={14} color="#6B6B70" style={{ flexShrink: 0, marginTop: 4 }} />}
    </div>
  );
}