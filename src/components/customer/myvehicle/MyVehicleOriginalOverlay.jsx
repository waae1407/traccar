import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield, AlertTriangle, CheckCircle2, Sun, Moon, CloudRain, Snowflake, Cloud, CloudLightning } from "lucide-react";
import SOSButton from "@/components/customer/sos/SOSButton";
import VehicleTopCard from "./VehicleTopCard";
import VehicleDock, { MoreStrip } from "./VehicleDock";
import VehicleExpandedDrawer from "./VehicleExpandedDrawer";

function getWeatherDisplay(weather) {
  if (!weather?.current_weather) return null;
  const { temperature, weathercode, is_day } = weather.current_weather;
  const temp = Math.round(temperature) + "°";
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(weathercode))
    return { icon: <CloudRain size={13} color="#89B4F8" />, label: "Rain", temp };
  if ([71,73,75,77,85,86].includes(weathercode))
    return { icon: <Snowflake size={13} color="#A7E4F2" />, label: "Snow", temp };
  if ([95,96,99].includes(weathercode))
    return { icon: <CloudLightning size={13} color="#C4A7E7" />, label: "Storm", temp };
  if ([2,3,45,48].includes(weathercode))
    return { icon: <Cloud size={13} color="#B5B9C2" />, label: "Cloudy", temp };
  return is_day
    ? { icon: <Sun size={13} color="#F8C455" />, label: "Clear", temp }
    : { icon: <Moon size={13} color="#9EA5F1" />, label: "Clear", temp };
}

function WeatherChip({ device }) {
  const { data: weather } = useQuery({
    queryKey: ["vehicle-weather", device?.last_latitude, device?.last_longitude],
    queryFn: async () => {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${device.last_latitude}&longitude=${device.last_longitude}&current_weather=true&temperature_unit=fahrenheit`
      );
      return res.json();
    },
    enabled: !!device?.last_latitude && !!device?.last_longitude,
    staleTime: 600000,
  });
  const w = getWeatherDisplay(weather);
  if (!w) return null;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px",
      borderRadius: 999, background: "rgba(8,9,12,0.72)", backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)",
    }}>
      {w.icon}
      <span style={{ fontSize: 13, fontWeight: 700, color: "#F5F5F7" }}>{w.temp}</span>
      <span style={{ fontSize: 11, fontWeight: 500, color: "#A1A1AA" }}>{w.label}</span>
    </div>
  );
}

// Frozen "original" skin — the My Vehicle UI before the compact mockup tweaks.
// SAFE DRIVER pill + stronger button glows + standard arrow icon.
const COL = { maxWidth: 430, margin: "0 auto", width: "100%" };

function Banner({ icon, color, bg, text }) {
  return (
    <div style={{ background: bg, border: `1px solid ${color}`, borderRadius: 12, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(10px)" }}>
      {icon}
      <p style={{ fontSize: 14, fontWeight: 600, color: "#FFF", margin: 0 }}>{text}</p>
    </div>
  );
}

export default function MyVehicleOriginalOverlay({
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
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 6 }}>
          <WeatherChip device={device} />
        </div>
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
          position: "absolute", top: "64%", left: 0, right: 0,
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
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12.7 2.3a1 1 0 0 0-1.4 0l-9 9a1 1 0 0 0 0 1.4l9 9a1 1 0 0 0 1.4 0l9-9a1 1 0 0 0 0-1.4z" fill="#FFF" />
              <path d="M8.5 16.5v-3.2a1.8 1.8 0 0 1 1.8-1.8H15" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13.3 9.3l2.6 2.2-2.6 2.2" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
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