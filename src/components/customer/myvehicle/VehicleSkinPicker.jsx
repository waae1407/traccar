import React from "react";
import { X, Check } from "lucide-react";
import { VEHICLE_SKINS } from "@/hooks/useVehicleSkin";

// Bottom-sheet skin picker for the My Vehicle page.
// Shows a swatch + label for each skin; selecting persists the choice.
export default function VehicleSkinPicker({ currentSkin, onSelect, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div style={{
        position: "relative", background: "#0E0E11", borderTop: "1px solid rgba(255,255,255,0.1)",
        borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "20px 18px calc(24px + env(safe-area-inset-bottom))",
        boxShadow: "0 -10px 40px rgba(0,0,0,0.5)", animation: "fade-in-up 0.3s ease-out",
        maxWidth: 430, margin: "0 auto", width: "100%",
      }}>
        <style>{`@keyframes fade-in-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: "#FFF", margin: 0 }}>Vehicle Skin</h3>
            <p style={{ fontSize: 12, color: "#8E8E93", margin: "2px 0 0" }}>Choose a look for My Vehicle</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={16} color="#FFF" />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {VEHICLE_SKINS.map((s) => {
            const active = s.id === currentSkin;
            return (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className="control-tap"
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                  borderRadius: 14, cursor: "pointer", textAlign: "left",
                  background: active ? "rgba(212,175,55,0.12)" : "#1A1A1E",
                  border: active ? "1.5px solid rgba(212,175,55,0.6)" : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <SkinSwatch skinId={s.id} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#F5F5F7", margin: 0 }}>{s.label}</p>
                  <p style={{ fontSize: 12, color: "#8E8E93", margin: "1px 0 0" }}>{s.blurb}</p>
                </div>
                {active && (
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#D4AF37", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Check size={14} color="#0E0E11" strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Mini preview swatch representing each skin's map + accent feel.
function SkinSwatch({ skinId }) {
  const styles = {
    classic: { bg: "#050506", road: "#2F80FF", accent: "#F8C455" },
    neon: { bg: "#050505", road: "#2efd5f", accent: "#D4AF37" },
    slate: { bg: "#1a1e22", road: "#3a424a", accent: "#889096" },
  };
  const s = styles[skinId] || styles.classic;
  return (
    <div style={{ width: 52, height: 52, borderRadius: 12, background: s.bg, border: "1px solid rgba(255,255,255,0.08)", flexShrink: 0, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 6, right: 6, top: 18, height: 2, background: s.road, opacity: 0.8, borderRadius: 2 }} />
      <div style={{ position: "absolute", left: 6, right: 6, top: 30, height: 2, background: s.road, opacity: 0.5, borderRadius: 2 }} />
      <div style={{ position: "absolute", left: 22, top: 8, bottom: 8, width: 2, background: s.road, opacity: 0.6, borderRadius: 2 }} />
      <div style={{ position: "absolute", right: 6, top: 6, width: 10, height: 10, borderRadius: "50%", background: s.accent, boxShadow: `0 0 6px ${s.accent}` }} />
    </div>
  );
}