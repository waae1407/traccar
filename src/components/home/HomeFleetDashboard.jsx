import React from "react";
import { MapPin, Zap, CreditCard, Shield, CheckCircle2, AlertCircle, Clock } from "lucide-react";

// Static mockup data — purely visual, no backend
const MOCK_VEHICLES = [
  { name: "2022 Toyota Camry", plate: "GPX 4821", status: "active", gps: "Downtown LA", payment: "Paid", week: "Wk 4" },
  { name: "2021 Honda Civic", plate: "TRK 9034", status: "active", gps: "Compton, CA", payment: "Paid", week: "Wk 7" },
  { name: "2023 Nissan Altima", plate: "DRV 2210", status: "due", gps: "Inglewood, CA", payment: "Due today", week: "Wk 2" },
  { name: "2020 Hyundai Sonata", plate: "FLT 5571", status: "available", gps: "—", payment: "—", week: "—" },
];

const STATUS_MAP = {
  active: { label: "Active", dot: "bg-emerald-400", text: "text-emerald-600", bg: "bg-emerald-50" },
  due: { label: "Payment Due", dot: "bg-yellow-400", text: "text-yellow-600", bg: "bg-yellow-50" },
  available: { label: "Available", dot: "bg-blue-400", text: "text-blue-600", bg: "bg-blue-50" },
};

export default function HomeFleetDashboard() {
  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200"
      style={{ background: "linear-gradient(160deg, #0f0c29 0%, #1e1b4b 60%, #1a1040 100%)" }}>

      {/* Dashboard header bar */}
      <div className="px-4 pt-4 pb-3 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/40 text-[9px] font-bold uppercase tracking-widest mb-0.5">Fleet Operations Dashboard</p>
            <p className="text-white text-sm font-bold" style={{ fontFamily: "var(--font-syne)" }}>uRideHub Control Center</p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-[10px] font-bold">Live</span>
          </div>
        </div>

        {/* Mini stat row */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          {[
            { label: "Active Rentals", value: "3", icon: CheckCircle2, color: "text-emerald-400" },
            { label: "Due Today", value: "1", icon: AlertCircle, color: "text-yellow-400" },
            { label: "GPS Online", value: "3/4", icon: MapPin, color: "text-blue-400" },
          ].map((s, i) => (
            <div key={i} className="rounded-xl bg-white/[0.06] border border-white/[0.08] p-2.5 text-center">
              <s.icon className={`h-3.5 w-3.5 ${s.color} mx-auto mb-1`} />
              <p className="text-white text-sm font-black" style={{ fontFamily: "var(--font-syne)" }}>{s.value}</p>
              <p className="text-white/35 text-[9px] font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Vehicle list */}
      <div className="px-4 py-3 space-y-2">
        {MOCK_VEHICLES.map((v, i) => {
          const s = STATUS_MAP[v.status];
          return (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.07]">
              <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate">{v.name}</p>
                <p className="text-white/35 text-[10px]">{v.plate} · {v.gps}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{s.label}</span>
                {v.week !== "—" && <p className="text-white/30 text-[9px] mt-0.5">{v.week} · {v.payment}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom control bar */}
      <div className="px-4 pb-4 pt-2">
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: MapPin, label: "GPS Track", color: "text-blue-400" },
            { icon: Zap, label: "Remote Ctrl", color: "text-yellow-400" },
            { icon: CreditCard, label: "Payouts", color: "text-emerald-400" },
          ].map((btn, i) => (
            <div key={i}
              className="flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] cursor-default">
              <btn.icon className={`h-4 w-4 ${btn.color}`} />
              <span className="text-white/50 text-[10px] font-semibold">{btn.label}</span>
            </div>
          ))}
        </div>
        <p className="text-white/20 text-[9px] text-center mt-2">Preview only · Actual dashboard available after sign-in</p>
      </div>
    </div>
  );
}