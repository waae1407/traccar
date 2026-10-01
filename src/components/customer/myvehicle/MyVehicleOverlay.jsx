import React from "react";
import { CornerUpRight, Shield, AlertTriangle, CheckCircle2 } from "lucide-react";
import SOSButton from "@/components/customer/sos/SOSButton";
import VehicleTopCard from "./VehicleTopCard";
import VehicleDock, { MoreStrip } from "./VehicleDock";
import VehicleExpandedDrawer from "./VehicleExpandedDrawer";

const COL = { maxWidth: 430, margin: "0 auto", width: "100%" };

function Banner({ icon, color, bg, text }) {
  return (
    <div style={{ background: bg, border: `1px solid ${color}`, borderRadius: 12, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(10px)" }}>
      {icon}
      <p style={{ fontSize: 14, fontWeight: 600, color: "#FFF", margin: 0 }}>{text}</p>
    </div>
  );
}

export default function MyVehicleOverlay({
  booking, device, gps, battInfo, addressLine, statusLabel,
  isReturnRequired, isOverdueRental, activeAlarms,
  isBookingActive, dropoffInspectionComplete, remainingStr,
  commandLoading, onCommand, expanded, setExpanded, onOpenDiagnostics, onEndRental,
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10, display: "flex", flexDirection: "column",
      pointerEvents: "none", boxSizing: "border-box",
      paddingTop: "max(10px, env(safe-area-inset-top))",
      paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)",
      fontFamily: "'Barlow Condensed', 'Oswald', -apple-system, sans-serif",
    }}>
      <div style={{ ...COL, padding: "0 12px", pointerEvents: "auto", flexShrink: 0 }}>
        <VehicleTopCard addressLine={addressLine} statusLabel={statusLabel} />
        {(isReturnRequired || isOverdueRental || activeAlarms.length > 0) && (
          <div style={{ paddingTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
            {isReturnRequired && <Banner icon={<Shield size={15} color="#FF9F0A" />} color="rgba(255,159,10,0.4)" bg="rgba(255,159,10,0.15)" text="Return Inspection Required" />}
            {isOverdueRental && !isReturnRequired && <Banner icon={<AlertTriangle size={15} color="#FF453A" />} color="rgba(255,69,58,0.4)" bg="rgba(255,69,58,0.15)" text="Rental Overdue — Return vehicle immediately" />}
            {activeAlarms.map((a) => <Banner key={a.id} icon={<AlertTriangle size={15} color={a.color} />} color={a.color} bg="rgba(255,69,58,0.15)" text={a.label} />)}
          </div>
        )}
      </div>

      {!expanded && (
        <div style={{
          position: "absolute", top: "calc(50% + 14px)", left: "50%", transform: "translateX(-50%)",
          display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 14px 4px 10px", borderRadius: 999,
          background: "linear-gradient(180deg, #1F6B40, #14492B)", border: "1.5px solid #4ADE80",
          boxShadow: "0 0 14px rgba(74,222,128,0.35)",
        }}>
          <CheckCircle2 size={16} color="#7DF0A5" />
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.03em", color: "#8CF5B0" }}>SAFE DRIVER</span>
        </div>
      )}

      {!expanded && (
        <div style={{
          position: "absolute", top: "46%", left: 0, right: 0,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "0 20px", pointerEvents: "none",
        }}>
          <div style={{ pointerEvents: "auto" }}>
            <SOSButton booking={booking} device={device} inline />
          </div>
          <button
            className="control-tap"
            aria-label="Navigate to vehicle"
            onClick={() => {
              if (device?.last_latitude && device?.last_longitude) {
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${device.last_latitude},${device.last_longitude}`, "_blank");
              }
            }}
            style={{
              width: 58, height: 58, borderRadius: "50%", cursor: "pointer",
              background: "radial-gradient(circle at 35% 30%, #5B9BFF, #2563EB 65%, #1A45B0)",
              border: "2px solid rgba(255,255,255,0.3)",
              boxShadow: "0 0 26px rgba(47,128,255,0.65), 0 4px 16px rgba(0,20,80,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "auto",
            }}
          >
            <CornerUpRight size={30} color="#FFF" strokeWidth={3} />
          </button>
        </div>
      )}

      <div style={{ flex: 1 }} />

      <div style={{ ...COL, pointerEvents: "auto", flexShrink: 0 }}>
        {!expanded ? (
          <>
            <VehicleDock commandLoading={commandLoading} disabled={dropoffInspectionComplete} onCommand={onCommand} />
            <MoreStrip onExpand={() => setExpanded(true)} />
          </>
        ) : (
          <div style={{
            padding: "14px 16px calc(16px + env(safe-area-inset-bottom))",
            background: "rgba(10,10,12,0.94)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTop: "1px solid rgba(255,255,255,0.1)",
          }}>
            <VehicleExpandedDrawer
              booking={booking} device={device} gps={gps} battInfo={battInfo}
              isOverdueRental={isOverdueRental} isBookingActive={isBookingActive}
              dropoffInspectionComplete={dropoffInspectionComplete} remainingStr={remainingStr}
              onClose={() => setExpanded(false)}
              onOpenDiagnostics={onOpenDiagnostics}
              onEndRental={onEndRental}
            />
          </div>
        )}
      </div>
    </div>
  );
}