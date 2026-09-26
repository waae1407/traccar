import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, ShieldAlert, X, Activity, Gauge, Zap, RotateCcw, Car, TrendingUp } from "lucide-react";

/**
 * RecklessDrivingCard — Pass/Fail monitoring card for the customer remote control screen.
 *
 * - Green box with white glowing "Monitoring" text = PASS (no reckless patterns detected)
 * - Red box = FAIL (reckless driving detected)
 * - Click → opens breakdown sheet showing all 5 monitored patterns with pass/fail
 */
export default function RecklessDrivingCard({ device }) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["reckless-driving-status", device?.id],
    queryFn: async () => {
      const res = await base44.functions.invoke("detectRecklessDriving", {
        device_id: device.id,
      });
      return res.data;
    },
    enabled: !!device?.id,
    refetchInterval: 60000,
  });

  const isFail = data?.status === "fail";
  const isPass = data?.status === "pass";

  return (
    <>
      {/* ── Pass / Fail Card ── */}
      <button
        onClick={() => setShowBreakdown(true)}
        className="monitoring-ring w-full flex items-center justify-between rounded-2xl border p-4 transition-all active:scale-[0.98] control-tap"
        style={{
          background: isFail
            ? "linear-gradient(135deg, rgba(255,69,58,0.12), rgba(183,28,28,0.08))"
            : "linear-gradient(135deg, rgba(48,209,88,0.10), rgba(48,209,88,0.05))",
          borderColor: isFail ? "rgba(255,69,58,0.4)" : "rgba(48,209,88,0.35)",
          boxShadow: isFail
            ? "0 0 20px rgba(255,69,58,0.15)"
            : "0 0 20px rgba(48,209,88,0.12)",
          "--ring-color": isFail
            ? "rgba(255,69,58,0.85)"
            : "rgba(48,209,88,0.75)",
        }}
      >
        <div className="flex items-center gap-3">
          {isFail ? (
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(255,69,58,0.15)" }}
            >
              <ShieldAlert size={22} color="#FF453A" />
            </div>
          ) : (
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(48,209,88,0.12)" }}
            >
              <ShieldCheck size={22} color="#30D158" />
            </div>
          )}
          <div className="text-left">
            <p className="text-sm font-bold" style={{ color: isFail ? "#FF453A" : "#30D158" }}>
              {isLoading ? "Checking…" : isFail ? "FAIL — Reckless Driving" : "PASS — Safe Driving"}
            </p>
            <p className="text-xs text-white/50">
              {isLoading
                ? "Analyzing recent trips…"
                : isFail
                ? "Reckless patterns detected — tap for details"
                : "No reckless patterns detected — tap for details"}
            </p>
          </div>
        </div>
        {/* White glowing monitoring indicator */}
        <div className="flex items-center gap-2">
          {!isLoading && (
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{
                color: "#FFFFFF",
                textShadow: isPass
                  ? "0 0 8px rgba(255,255,255,0.6), 0 0 16px rgba(48,209,88,0.4)"
                  : "0 0 8px rgba(255,255,255,0.4)",
                animation: "pulse-glow 2.5s ease-in-out infinite",
              }}
            >
              ● Monitoring
            </span>
          )}
        </div>
      </button>

      {/* ── Breakdown Sheet ── */}
      {showBreakdown && (
        <RecklessDrivingSheet
          data={data}
          isLoading={isLoading}
          onClose={() => setShowBreakdown(false)}
        />
      )}
    </>
  );
}

// ── Breakdown Sheet ─────────────────────────────────────────────
function RecklessDrivingSheet({ data, isLoading, onClose }) {
  const patterns = data?.patterns || {};

  const PATTERN_META = [
    { key: "sustained_high_speed", icon: Gauge, label: "Sustained High Speed" },
    { key: "rapid_accel_burst", icon: Zap, label: "Rapid Acceleration" },
    { key: "hard_cornering_chain", icon: RotateCcw, label: "Hard Cornering" },
    { key: "stop_and_dash_cycle", icon: Car, label: "Stop-and-Dash" },
    { key: "sustained_speeding_bursts", icon: TrendingUp, label: "Sustained Speeding" },
  ];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl border border-white/10 overflow-hidden"
        style={{
          background: "hsl(222 24% 11%)",
          maxHeight: "85vh",
          animation: "fade-in-up 0.3s ease-out forwards",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1.5 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Activity size={18} color="#71717A" />
            <h2 className="text-base font-bold text-white">Reckless Driving Monitor</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10">
            <X size={20} color="#71717A" />
          </button>
        </div>

        {/* Overall Status */}
        <div className="px-5 py-4">
          <div
            className="flex items-center gap-3 rounded-2xl border p-4"
            style={{
              background: data?.status === "fail"
                ? "linear-gradient(135deg, rgba(255,69,58,0.12), rgba(183,28,28,0.08))"
                : "linear-gradient(135deg, rgba(48,209,88,0.10), rgba(48,209,88,0.05))",
              borderColor: data?.status === "fail" ? "rgba(255,69,58,0.3)" : "rgba(48,209,88,0.3)",
            }}
          >
            {data?.status === "fail" ? (
              <ShieldAlert size={28} color="#FF453A" />
            ) : (
              <ShieldCheck size={28} color="#30D158" />
            )}
            <div>
              <p className="text-lg font-black" style={{ color: data?.status === "fail" ? "#FF453A" : "#30D158" }}>
                {isLoading ? "Analyzing…" : data?.status === "fail" ? "FAIL" : "PASS"}
              </p>
              <p className="text-xs text-white/50">
                {data?.status === "fail"
                  ? "Reckless driving patterns were detected in your recent trip"
                  : "No reckless driving patterns detected — you're driving safely"}
              </p>
            </div>
          </div>
        </div>

        {/* Pattern Breakdown */}
        <div className="px-5 pb-2">
          <p className="text-xs font-bold uppercase tracking-wider text-white/40 mb-3">
            5 Patterns Monitored
          </p>
          <div className="space-y-2">
            {PATTERN_META.map((meta) => {
              const pattern = patterns[meta.key] || { detected: false };
              const Icon = meta.icon;
              const passed = !pattern.detected;
              return (
                <div
                  key={meta.key}
                  className="flex items-start gap-3 rounded-xl border p-3"
                  style={{
                    background: passed ? "rgba(48,209,88,0.04)" : "rgba(255,69,58,0.06)",
                    borderColor: passed ? "rgba(48,209,88,0.15)" : "rgba(255,69,58,0.2)",
                  }}
                >
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background: passed ? "rgba(48,209,88,0.1)" : "rgba(255,69,58,0.1)",
                    }}
                  >
                    <Icon size={18} color={passed ? "#30D158" : "#FF453A"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-white">{meta.label}</p>
                      <span
                        className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{
                          background: passed ? "rgba(48,209,88,0.15)" : "rgba(255,69,58,0.15)",
                          color: passed ? "#30D158" : "#FF453A",
                        }}
                      >
                        {passed ? "PASS" : "FAIL"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer note */}
        <div className="px-5 py-4">
          <p className="text-[11px] text-white/30 text-center leading-relaxed">
            Monitoring is active during every trip. Normal driving always shows PASS.
          </p>
        </div>
      </div>
    </div>
  );
}