import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Battery, ArrowUpRight } from "lucide-react";

/**
 * Dashboard warning banner showing vehicles with battery voltage ≤ 12.0V
 * or non-healthy severity. Renders with remediation instructions for both
 * admin (dark theme) and host (light theme) dashboards.
 */
export default function BatteryHealthWarningBanner({ role = "admin", hostId }) {
  const { data: scorecards = [] } = useQuery({
    queryKey: ["battery-warning-banner", role, hostId],
    queryFn: () =>
      role === "admin"
        ? base44.entities.BatteryHealthScorecard.list("-updated_date", 200)
        : base44.entities.BatteryHealthScorecard.filter({ host_id: hostId }),
    enabled: role === "admin" || !!hostId,
    refetchInterval: 60_000,
  });

  // Vehicles needing attention: voltage ≤ 12.0 or severity != healthy
  const needsAttention = scorecards.filter(
    (s) =>
      (s.severity && s.severity !== "healthy") ||
      (s.resting_voltage != null && s.resting_voltage <= 12.0 && s.resting_voltage > 0)
  );

  if (needsAttention.length === 0) return null;

  const isAdmin = role === "admin";
  const linkPath = isAdmin ? "/admin/battery-health" : "/host/battery-health";

  const order = { critical: 0, severe: 1, warning: 2, healthy: 3 };
  const sorted = [...needsAttention].sort(
    (a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4)
  );

  return (
    <div
      className={`rounded-2xl border-2 overflow-hidden ${
        isAdmin ? "border-lime-500/40" : "border-lime-400/50"
      }`}
      style={{
        background: isAdmin
          ? "linear-gradient(135deg, hsl(82 85% 50% / 0.10) 0%, hsl(38 95% 54% / 0.06) 100%)"
          : "linear-gradient(135deg, hsl(82 85% 95%) 0%, hsl(38 95% 54% / 0.05) 100%)",
      }}
    >
      <div
        className="h-1.5 w-full"
        style={{ background: "linear-gradient(90deg, hsl(82 85% 50%), hsl(38 95% 54%))" }}
      />
      <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div
            className={`h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
              isAdmin
                ? "bg-lime-500/20 border border-lime-500/30"
                : "bg-lime-100 border border-lime-200"
            }`}
          >
            <Battery className={`h-6 w-6 ${isAdmin ? "text-lime-400" : "text-lime-600"}`} />
          </div>
          <div className="min-w-0">
            <p className={`font-bold text-base ${isAdmin ? "text-lime-300" : "text-lime-900"}`}>
              {needsAttention.length} Vehicle{needsAttention.length > 1 ? "s" : ""} Need Battery Attention
            </p>
            <p className={`text-xs mt-1 ${isAdmin ? "text-white/50" : "text-gray-600"}`}>
              ⚠️ Please start the vehicle and allow it to run for at least 30 minutes to recharge the battery.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {sorted.slice(0, 4).map((s) => (
                <span
                  key={s.id}
                  className={`text-xs px-2 py-0.5 rounded-lg border ${
                    isAdmin
                      ? "text-white/60 bg-white/[0.06] border-white/10"
                      : "text-gray-600 bg-white border-gray-200"
                  }`}
                >
                  {s.vehicle_name || s.device_unique_id} · {s.resting_voltage?.toFixed(1)}V
                </span>
              ))}
              {sorted.length > 4 && (
                <span className={`text-xs ${isAdmin ? "text-white/40" : "text-gray-400"}`}>
                  +{sorted.length - 4} more
                </span>
              )}
            </div>
          </div>
        </div>
        <Link
          to={linkPath}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all hover:opacity-90 active:scale-95 flex-shrink-0 ${
            isAdmin ? "text-black" : "text-white"
          }`}
          style={{ background: "linear-gradient(135deg, hsl(82 85% 50%), hsl(38 95% 54%))" }}
        >
          Check & Remediate <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}