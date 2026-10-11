import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { X, AlertTriangle, ShieldAlert, Clock, Users, Wrench, FileCheck, ChevronRight } from "lucide-react";

const LABEL_FONT = "'Barlow Condensed', sans-serif";

const PRIORITY = { critical: 0, warning: 1, info: 2 };

const ICON_MAP = {
  pending_review: FileCheck,
  host_application: Users,
  overdue_payment: AlertTriangle,
  overdue_rental: Clock,
  out_of_service: Wrench,
  abandoned_checkout: Clock,
};

const SEVERITY_CONFIG = {
  critical: { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)", icon: ShieldAlert, iconColor: "#EF4444", label: "Critical", labelColor: "#EF4444" },
  warning: { bg: "rgba(255,159,10,0.10)", border: "rgba(255,159,10,0.25)", icon: AlertTriangle, iconColor: "#FF9F0A", label: "Warning", labelColor: "#FF9F0A" },
  info: { bg: "rgba(47,128,255,0.08)", border: "rgba(47,128,255,0.2)", icon: AlertTriangle, iconColor: "#2F80FF", label: "Info", labelColor: "#2F80FF" },
};

const TYPE_LABELS = {
  pending_review: "Pending Booking Review",
  host_application: "Host Application",
  overdue_payment: "Overdue Payment",
  overdue_rental: "Rental Overdue",
  out_of_service: "Out of Service",
  abandoned_checkout: "Abandoned Checkout",
};

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AdminSupportQueue({ items = [], onClose }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const pa = PRIORITY[a.severity] ?? 2;
      const pb = PRIORITY[b.severity] ?? 2;
      if (pa !== pb) return pa - pb;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }, [items]);

  const criticalCount = sorted.filter(i => i.severity === "critical").length;
  const warningCount = sorted.filter(i => i.severity === "warning").length;

  if (sorted.length === 0) return null;

  const handleItemClick = (item) => {
    if (item.href) navigate(item.href);
  };

  return (
    <>
      {/* Toggle button when collapsed */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            position: "fixed", bottom: 72, left: "50%", transform: "translateX(-50%)",
            zIndex: 45, maxWidth: 430, width: "calc(100% - 32px)",
            height: 48, borderRadius: 16,
            background: "rgba(23,24,28,0.92)", backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            cursor: "pointer", color: "#F5F5F7", fontWeight: 700, fontSize: 13,
          }}
        >
          <AlertTriangle size={16} color={criticalCount > 0 ? "#EF4444" : "#FF9F0A"} />
          <span>{sorted.length} support {sorted.length === 1 ? "item" : "items"}</span>
          {criticalCount > 0 && <span style={{ color: "#EF4444", fontWeight: 800 }}>{criticalCount} critical</span>}
        </button>
      )}

      {expanded && (
        <div style={{
          position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: 430, background: "#17181C",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "20px 20px 0 0",
          padding: "16px 16px 24px",
          zIndex: 46,
          maxHeight: "65vh", overflowY: "auto",
          animation: "slideUp 0.3s ease-out",
        }}>
          <style>{`@keyframes slideUp { from { transform: translateX(-50%) translateY(100%); } to { transform: translateX(-50%) translateY(0); } }`}</style>

          {/* Handle */}
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 12px" }} />

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 17, fontWeight: 800, color: "#F5F5F7", margin: 0, fontFamily: LABEL_FONT }}>
                Support Queue
              </p>
              <p style={{ fontSize: 12, color: "#8E8E93", margin: "2px 0 0" }}>
                {criticalCount > 0 && <span style={{ color: "#EF4444", fontWeight: 600 }}>{criticalCount} critical</span>}
                {criticalCount > 0 && warningCount > 0 && <span> · </span>}
                {warningCount > 0 && <span style={{ color: "#FF9F0A", fontWeight: 600 }}>{warningCount} warning{warningCount > 1 ? "s" : ""}</span>}
                {criticalCount === 0 && warningCount === 0 && <span>{sorted.length} items</span>}
              </p>
            </div>
            <button
              onClick={() => setExpanded(false)}
              style={{
                background: "rgba(255,255,255,0.06)", border: "none",
                width: 30, height: 30, borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "#8E8E93",
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Items */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sorted.slice(0, 20).map((item) => {
              const cfg = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.info;
              const Icon = ICON_MAP[item.type] || cfg.icon;

              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    background: cfg.bg, border: `1px solid ${cfg.border}`,
                    borderRadius: 14, padding: "12px 14px",
                    cursor: "pointer", textAlign: "left", width: "100%",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: "rgba(0,0,0,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Icon size={18} color={cfg.iconColor} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: 0.5, color: cfg.labelColor, fontFamily: LABEL_FONT,
                      }}>
                        {cfg.label}
                      </span>
                      <span style={{ fontSize: 10, color: "#8E8E93" }}>·</span>
                      <span style={{ fontSize: 10, color: "#8E8E93", fontWeight: 500 }}>
                        {TYPE_LABELS[item.type] || item.type}
                      </span>
                    </div>
                    <p style={{
                      fontSize: 14, fontWeight: 600, color: "#F5F5F7",
                      margin: 0, overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {item.title}
                    </p>
                    <p style={{
                      fontSize: 12, color: "#8E8E93", margin: "2px 0 0",
                      overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {item.subtitle}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                      {item.amount > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: cfg.iconColor }}>
                          ${item.amount.toLocaleString()}
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: "#6B6B70", display: "flex", alignItems: "center", gap: 3 }}>
                        <Clock size={9} /> {timeAgo(item.created_at)}
                      </span>
                    </div>
                  </div>

                  <ChevronRight size={16} color="#8E8E93" style={{ flexShrink: 0, marginTop: 10 }} />
                </button>
              );
            })}
          </div>

          {sorted.length > 20 && (
            <p style={{ fontSize: 11, color: "#6B6B70", textAlign: "center", marginTop: 10, fontWeight: 500 }}>
              +{sorted.length - 20} more items
            </p>
          )}
        </div>
      )}
    </>
  );
}