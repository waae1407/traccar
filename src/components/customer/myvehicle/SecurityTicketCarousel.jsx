import React, { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Siren, Truck, Gauge, Users, Flame, Clock, ShieldCheck } from "lucide-react";

const LABEL_FONT = "'Barlow Condensed', sans-serif";

/**
 * SecurityTicketCarousel — Horizontal live-scrolling security monitor.
 *
 * Six "tickets" scroll continuously, each showing a monitored threat:
 *   Theft · Tow · Drag Racing · Street Takeover · Smoke · Overnight Parked
 *
 * Green = OK, Red = issue detected.
 * When a NEW issue appears: plays a short alert tone and drops a
 * yellow "post-it note" onto the map overlay.
 */
export default function SecurityTicketCarousel({ device }) {
  const [activeAlert, setActiveAlert] = useState(null);
  const [fading, setFading] = useState(false);
  const prevKeysRef = useRef(new Set());
  const dismissTimerRef = useRef(null);

  // Safe Driving status from reckless-driving detector
  const { data: recklessData } = useQuery({
    queryKey: ["reckless-driving-status", device?.id],
    queryFn: async () => {
      const res = await base44.functions.invoke("detectRecklessDriving", { device_id: device.id });
      return res.data;
    },
    enabled: !!device?.id,
    refetchInterval: 60000,
  });
  const unsafeDriving = recklessData?.status === "fail";

  const tickets = useMemo(() => {
    const now = Date.now();

    // Theft: movement while ignition off OR while doors are locked
    // (lock-state fallback catches theft when ignition is motion-inferred)
    const theft = device?.movement_alarm && (device?.ignition_status === "off" || device?.lock_state === "locked");

    // Tow: movement alarm while parked (no ignition)
    const tow = device?.movement_alarm && (!device?.ignition_status || device?.ignition_status === "off") && !device?.speed;

    // Drag racing: overspeed alarm
    const drag = device?.overspeed_alarm;

    // Street takeover: shock alarm + overspeed (crowd + speed)
    const takeover = device?.shock_alarm && device?.overspeed_alarm;

    // Smoke: device smoke sensor
    const smoke = device?.smoke_detected;

    // Overnight parked: parked > 8 hours
    let idle = false;
    if (device?.parked_at) {
      idle = now - new Date(device.parked_at).getTime() > 8 * 60 * 60 * 1000;
    }

    return [
      { key: "theft", label: "Theft Detection", icon: Siren, ok: !theft, detail: theft ? "Movement — ignition off" : "Secured" },
      { key: "tow", label: "Tow Detection", icon: Truck, ok: !tow, detail: tow ? "Towing detected" : "Stationary" },
      { key: "drag", label: "Drag Racing", icon: Gauge, ok: !drag, detail: drag ? "Speed burst" : "Normal" },
      { key: "takeover", label: "Street Takeover", icon: Users, ok: !takeover, detail: takeover ? "Gathering + speed" : "Clear" },
      { key: "smoke", label: "Smoke Detection", icon: Flame, ok: !smoke, detail: smoke ? "Smoke detected!" : "Clear" },
      { key: "idle", label: "Overnight Parked", icon: Clock, ok: !idle, detail: idle ? "Parked > 8 hrs" : "Active" },
      { key: "safe", label: "Safe Driving", icon: ShieldCheck, ok: !unsafeDriving, detail: unsafeDriving ? "Reckless detected" : "All clear" },
    ];
  }, [device, unsafeDriving]);

  const issues = tickets.filter((t) => !t.ok);

  // Play alert tone
  const playAlert = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) { /* no-op */ }
  };

  // Detect NEW issues → sound + post-it
  useEffect(() => {
    const currentKeys = new Set(issues.map((i) => i.key));
    const newKeys = [...currentKeys].filter((k) => !prevKeysRef.current.has(k));

    if (newKeys.length > 0) {
      playAlert();
      const firstNew = issues.find((i) => i.key === newKeys[0]);
      setActiveAlert(firstNew);
      setFading(false);

      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      // Start fade at 4.5s, remove at 5s
      dismissTimerRef.current = setTimeout(() => setFading(true), 4500);
      dismissTimerRef.current = setTimeout(() => setActiveAlert(null), 5000);
    }

    prevKeysRef.current = currentKeys;
    return () => { if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current); };
  }, [issues]);

  // Duplicate for seamless loop
  const loopTickets = [...tickets, ...tickets];

  return (
    <>
      {/* ── Post-it note on map overlay ── */}
      {activeAlert && (
        <div
          className={`post-it-note ${fading ? "post-it-fade" : ""}`}
          style={{
            position: "fixed",
            top: "32%",
            left: "50%",
            zIndex: 45,
            background: "linear-gradient(135deg, #FFE873, #FFD966)",
            color: "#1a1a1a",
            padding: "14px 18px",
            borderRadius: 3,
            boxShadow: "0 10px 40px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.5)",
            maxWidth: 270,
          }}
        >
          {/* Folded corner */}
          <div style={{
            position: "absolute", bottom: 0, right: 0,
            width: 16, height: 16,
            background: "linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.12) 50%)",
            borderRadius: "0 0 3px 0",
          }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <activeAlert.icon size={20} color="#B91C1C" strokeWidth={2.5} />
            <span style={{ fontSize: 15, fontWeight: 800, textTransform: "uppercase", fontFamily: LABEL_FONT, letterSpacing: "0.04em" }}>
              {activeAlert.label}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, lineHeight: 1.3, color: "#3a2a00" }}>
            {activeAlert.detail}
          </p>
        </div>
      )}

      {/* ── Security Monitor header + scrolling tickets ── */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 800, fontFamily: LABEL_FONT, color: "#8E8E93", letterSpacing: "0.14em", textTransform: "uppercase", margin: 0 }}>
            Security Monitor
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: issues.length > 0 ? "#FF453A" : "#22C55E",
              boxShadow: issues.length > 0 ? "0 0 8px rgba(255,69,58,0.7)" : "0 0 6px rgba(34,197,94,0.6)",
            }} />
            <span style={{
              fontSize: 14, fontWeight: 800, fontFamily: LABEL_FONT, letterSpacing: "0.02em",
              color: issues.length > 0 ? "#FF453A" : "#22C55E",
            }}>
              {issues.length > 0 ? `${issues.length} Alert${issues.length > 1 ? "s" : ""}` : "All Clear"}
            </span>
          </div>
        </div>

        {/* Scrolling ticket track */}
        <div
          className="ticket-scroll-container"
          style={{
            overflow: "hidden",
            position: "relative",
            borderRadius: 14,
            background: "rgba(26,26,26,0.72)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.08)",
            padding: "10px 0",
          }}
        >
          {/* Edge fades */}
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 20, background: "linear-gradient(90deg, rgba(26,26,26,0.95), transparent)", zIndex: 2, pointerEvents: "none" }} />
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 20, background: "linear-gradient(270deg, rgba(26,26,26,0.95), transparent)", zIndex: 2, pointerEvents: "none" }} />

          <div className="ticket-scroll-track" style={{ display: "flex", gap: 10, width: "max-content" }}>
            {loopTickets.map((ticket, idx) => {
              const Icon = ticket.icon;
              const isOk = ticket.ok;
              return (
                <div
                  key={`${ticket.key}-${idx}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 14px", borderRadius: 12,
                    background: isOk ? "rgba(34,197,94,0.08)" : "rgba(255,69,58,0.12)",
                    border: isOk ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,69,58,0.35)",
                    flexShrink: 0, minWidth: 145,
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: isOk ? "rgba(34,197,94,0.15)" : "rgba(255,69,58,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Icon size={18} color={isOk ? "#22C55E" : "#FF453A"} strokeWidth={2.5} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 800, fontFamily: LABEL_FONT, color: "#FFFFFF", letterSpacing: "0.02em", textTransform: "uppercase", lineHeight: 1.1, margin: 0 }}>
                      {ticket.label}
                    </p>
                    <p style={{ fontSize: 10, color: isOk ? "#22C55E" : "#FF453A", fontWeight: 600, margin: "2px 0 0", lineHeight: 1.1 }}>
                      {ticket.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}