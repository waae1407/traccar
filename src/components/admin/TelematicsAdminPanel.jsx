import React, { useState } from "react";
import { MapPin, Lock, Unlock, Volume2, Zap, ZapOff, Gauge, Navigation, Loader2, Activity } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

function AdminCmd({ icon: Icon, label, sublabel, color, onClick, loading, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-3 w-full p-3 rounded-xl transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
      style={{
        background: danger
          ? "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(220,38,38,0.06))"
          : `linear-gradient(135deg, ${color}18, ${color}08)`,
        border: `1px solid ${danger ? "rgba(239,68,68,0.25)" : color + "30"}`,
      }}
    >
      <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: danger ? "rgba(239,68,68,0.2)" : color + "22" }}>
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: danger ? "#ef4444" : color }} />
          : <Icon className="h-4 w-4" style={{ color: danger ? "#ef4444" : color }} />
        }
      </div>
      <div className="text-left">
        <p className="text-sm font-bold" style={{ color: danger ? "#ef4444" : "white" }}>{label}</p>
        {sublabel && <p className="text-[10px] text-white/35 mt-0.5">{sublabel}</p>}
      </div>
    </button>
  );
}

export default function TelematicsAdminPanel({ booking, onKillStateChange }) {
  const [loadingCmd, setLoadingCmd] = useState(null);
  const [location, setLocation] = useState(null);
  const [mileage, setMileage] = useState(null);
  const isKilled = booking.moovetrax_kill_active;

  const run = async (command) => {
    setLoadingCmd(command);
    try {
      const res = await base44.functions.invoke("moovetraxCommand", {
        command,
        booking_id: booking.id,
      });
      const result = res.data?.result;
      if (command === "location") {
        setLocation(result);
        toast.success("Location fetched");
      } else if (command === "mileage") {
        setMileage(result?.mileage || result?.odometer);
        toast.success("Mileage synced");
      } else if (command === "kill") {
        toast.error("Vehicle engine disabled");
        onKillStateChange?.(true);
      } else if (command === "unkill") {
        toast.success("Vehicle engine restored ✓");
        onKillStateChange?.(false);
      } else if (command === "lock") {
        toast.success("Vehicle locked");
      } else if (command === "unlock") {
        toast.success("Vehicle unlocked");
      } else if (command === "panic") {
        toast.success("Horn activated");
      }
    } catch (err) {
      toast.error(err.message || "Command failed");
    } finally {
      setLoadingCmd(null);
    }
  };

  return (
    <div className="rounded-2xl overflow-hidden border border-white/[0.07]"
      style={{ background: "hsl(222 24% 10% / 0.95)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #e91e8c22, #7c3aed22)", border: "1px solid #e91e8c33" }}>
            <Activity className="h-4 w-4" style={{ color: "#e91e8c" }} />
          </div>
          <div>
            <p className="text-sm font-black text-white" style={{ fontFamily: "var(--font-syne)" }}>
              MooveTrax™ Controls
            </p>
            <p className="text-[10px] text-white/30">Remote vehicle management</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{
            background: isKilled ? "rgba(239,68,68,0.12)" : "rgba(52,211,153,0.12)",
            border: isKilled ? "1px solid rgba(239,68,68,0.25)" : "1px solid rgba(52,211,153,0.25)",
          }}>
          <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${isKilled ? "bg-red-500" : "bg-emerald-400"}`} />
          <span className={`text-[10px] font-bold ${isKilled ? "text-red-400" : "text-emerald-400"}`}>
            {isKilled ? "KILLED" : "ACTIVE"}
          </span>
        </div>
      </div>

      <div className="p-3 space-y-2">
        {/* Tracking row */}
        <div className="grid grid-cols-2 gap-2">
          <AdminCmd icon={MapPin} label="Get Location" sublabel="Ping vehicle GPS" color="#60a5fa" onClick={() => run("location")} loading={loadingCmd === "location"} />
          <AdminCmd icon={Gauge} label="Sync Mileage" sublabel="Pull odometer" color="#a78bfa" onClick={() => run("mileage")} loading={loadingCmd === "mileage"} />
        </div>

        {/* Door controls */}
        <div className="grid grid-cols-3 gap-2">
          <AdminCmd icon={Unlock} label="Unlock" color="#34d399" onClick={() => run("unlock")} loading={loadingCmd === "unlock"} />
          <AdminCmd icon={Lock} label="Lock" color="#f59e0b" onClick={() => run("lock")} loading={loadingCmd === "lock"} />
          <AdminCmd icon={Volume2} label="Honk" color="#fb923c" onClick={() => run("panic")} loading={loadingCmd === "panic"} />
        </div>

        {/* Divider */}
        <div className="flex items-center gap-2 py-1">
          <div className="flex-1 h-px bg-white/[0.06]" />
          <span className="text-[9px] font-bold text-white/20 tracking-widest">ENGINE CONTROL</span>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>

        {/* Kill / Unkill */}
        {isKilled ? (
          <AdminCmd icon={Zap} label="Restore Engine" sublabel="Re-enable ignition" color="#34d399" onClick={() => run("unkill")} loading={loadingCmd === "unkill"} />
        ) : (
          <AdminCmd icon={ZapOff} label="Kill Engine" sublabel="Disable ignition remotely" color="#ef4444" danger onClick={() => run("kill")} loading={loadingCmd === "kill"} />
        )}

        {/* Location result */}
        {location && (
          <div className="rounded-xl px-3 py-2.5 flex items-center gap-2"
            style={{ background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.18)" }}>
            <Navigation className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
            <div>
              <p className="text-[9px] font-black text-blue-400 tracking-widest">GPS COORDINATES</p>
              <p className="text-[11px] text-white/60 font-mono mt-0.5">
                {location.lat ?? location.latitude}, {location.lng ?? location.longitude}
              </p>
              {location.speed !== undefined && (
                <p className="text-[10px] text-white/30 mt-0.5">Speed: {location.speed} mph</p>
              )}
            </div>
          </div>
        )}

        {/* Mileage result */}
        {mileage && (
          <div className="rounded-xl px-3 py-2.5 flex items-center gap-2"
            style={{ background: "rgba(167,139,250,0.07)", border: "1px solid rgba(167,139,250,0.18)" }}>
            <Gauge className="h-3.5 w-3.5 text-purple-400 flex-shrink-0" />
            <div>
              <p className="text-[9px] font-black text-purple-400 tracking-widest">ODOMETER</p>
              <p className="text-sm font-bold text-white mt-0.5">{Number(mileage).toLocaleString()} mi</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}