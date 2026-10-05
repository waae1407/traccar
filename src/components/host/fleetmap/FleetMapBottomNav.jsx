import React, { useState } from "react";
import { Link } from "react-router-dom";
import { getBusinessPortalMenu } from "@/components/business/roleBasedMenuConfig";
import { ChevronUp, ChevronDown, LayoutDashboard, LogOut, User } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

/**
 * FleetMapBottomNav — collapsible bottom bar with all existing host menu links.
 * Hidden by default, reveals on scroll-to-bottom or tap.
 * Groups menu sections from roleBasedMenuConfig.
 */
export default function FleetMapBottomNav({ visible, onNavigate }) {
  const { user, logout } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [openSection, setOpenSection] = useState(null);
  const { sections } = getBusinessPortalMenu({ role: "host", isSuperadmin: false, showDealerNetwork: false });

  return (
    <>
      {/* Toggle handle */}
      <div style={{
        position: "fixed", bottom: visible ? 0 : -60, left: "50%",
        transform: "translateX(-50%)", transition: "bottom 0.3s ease",
        width: "100%", maxWidth: 430, zIndex: 50,
      }}>
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{
            width: "100%", background: "rgba(23,24,28,0.95)", backdropFilter: "blur(16px)",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px 16px 0 0", padding: "8px 16px",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            cursor: "pointer", border: "none",
          }}
        >
          {expanded ? <ChevronDown size={16} color="#8E8E93" /> : <ChevronUp size={16} color="#8E8E93" />}
          <span style={{ fontSize: 11, fontWeight: 600, color: "#8E8E93", textTransform: "uppercase", letterSpacing: "0.05em" }}>Menu</span>
        </button>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 49 }} onClick={() => setExpanded(false)} />
          <div style={{
            position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
            width: "100%", maxWidth: 430, zIndex: 51,
            background: "#17181C", borderTop: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "20px 20px 0 0", padding: "12px 16px 20px",
            maxHeight: "70vh", overflowY: "auto",
          }}>
            {/* Quick links */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <Link to="/host/dashboard" onClick={() => { setExpanded(false); onNavigate?.(); }} style={navLinkStyle}>
                <LayoutDashboard size={16} color="#8E8E93" /> <span>Dashboard</span>
              </Link>
              <Link to="/host/vehicles/setup" onClick={() => { setExpanded(false); onNavigate?.(); }} style={navLinkStyle}>
                <User size={16} color="#8E8E93" /> <span>Add Vehicle</span>
              </Link>
              <button onClick={() => { logout(true); }} style={{ ...navLinkStyle, border: "none" }}>
                <LogOut size={16} color="#FF453A" /> <span style={{ color: "#FF453A" }}>Sign Out</span>
              </button>
            </div>

            {/* Menu sections */}
            {sections.map((section) => {
              const isOpen = openSection === section.label;
              return (
                <div key={section.label} style={{ marginBottom: 4 }}>
                  <button
                    onClick={() => setOpenSection(isOpen ? null : section.label)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 8px", background: "transparent", border: "none", cursor: "pointer",
                    }}
                  >
                    <section.icon size={16} color="#8E8E93" />
                    <span style={{ flex: 1, textAlign: "left", fontSize: 13, fontWeight: 600, color: "#F5F5F7" }}>{section.label}</span>
                    <ChevronDown size={14} color="#6B6B70" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                  </button>
                  {isOpen && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 24 }}>
                      {section.items.map((item) => (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => { setExpanded(false); onNavigate?.(); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "8px 8px", borderRadius: 8,
                            fontSize: 12, color: "#8E8E93", textDecoration: "none",
                            transition: "background 0.15s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <item.icon size={14} color="#6B6B70" />
                          <span>{item.label}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

const navLinkStyle = {
  display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
  borderRadius: 10, fontSize: 12, fontWeight: 600, color: "#F5F5F7",
  textDecoration: "none", border: "1px solid rgba(255,255,255,0.06)",
  background: "rgba(255,255,255,0.03)", cursor: "pointer",
};