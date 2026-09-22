import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { TrendingUp, Loader2, CheckCircle, Car } from "lucide-react";

/**
 * StartRentingButton — Upsell for GPS-only customers to convert to hosts.
 * Calls convertToHost backend function which creates a Host + Vehicle record
 * and transitions the device from personal → rental mode.
 */
export default function StartRentingButton({ device, user }) {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [converting, setConverting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [vehicleInfo, setVehicleInfo] = useState({
    make: "",
    model: "",
    year: "",
    color: "",
    plate: "",
    vin: "",
  });

  const handleConvert = async () => {
    setConverting(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("convertToHost", vehicleInfo);
      if (res.data?.ok) {
        setDone(true);
        setTimeout(() => {
          navigate(res.data.redirect_url);
        }, 1500);
      } else {
        setError(res.data?.error || "Conversion failed");
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Conversion failed");
    }
    setConverting(false);
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-5 text-center space-y-2">
        <CheckCircle size={32} color="#30D158" className="mx-auto" />
        <p className="text-sm font-bold text-white">Host Account Created!</p>
        <p className="text-xs text-white/50">Redirecting to your vehicle setup wizard…</p>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="rounded-2xl border border-pink-500/20 bg-gradient-to-br from-pink-500/5 to-purple-500/5 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Car size={18} color="#E91E8C" />
          <h3 className="text-sm font-bold text-white">List Your Vehicle on the Marketplace</h3>
        </div>
        <p className="text-xs text-white/50">
          Enter your vehicle details. Your GPS device will transfer to your new host account — no service interruption.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="Make"
            value={vehicleInfo.make}
            onChange={(e) => setVehicleInfo({ ...vehicleInfo, make: e.target.value })}
            className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-pink-500/50"
          />
          <input
            type="text"
            placeholder="Model"
            value={vehicleInfo.model}
            onChange={(e) => setVehicleInfo({ ...vehicleInfo, model: e.target.value })}
            className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-pink-500/50"
          />
          <input
            type="number"
            placeholder="Year"
            value={vehicleInfo.year}
            onChange={(e) => setVehicleInfo({ ...vehicleInfo, year: parseInt(e.target.value) || "" })}
            className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-pink-500/50"
          />
          <input
            type="text"
            placeholder="Color"
            value={vehicleInfo.color}
            onChange={(e) => setVehicleInfo({ ...vehicleInfo, color: e.target.value })}
            className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-pink-500/50"
          />
          <input
            type="text"
            placeholder="Plate (optional)"
            value={vehicleInfo.plate}
            onChange={(e) => setVehicleInfo({ ...vehicleInfo, plate: e.target.value })}
            className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-pink-500/50"
          />
          <input
            type="text"
            placeholder="VIN (optional)"
            value={vehicleInfo.vin}
            onChange={(e) => setVehicleInfo({ ...vehicleInfo, vin: e.target.value })}
            className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-pink-500/50"
          />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => setShowForm(false)}
            disabled={converting}
            className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-semibold text-white/60 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={handleConvert}
            disabled={converting || !vehicleInfo.make || !vehicleInfo.model}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
          >
            {converting && <Loader2 size={14} className="animate-spin" />}
            {converting ? "Converting…" : "Start Renting"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowForm(true)}
      className="w-full rounded-2xl border border-pink-500/20 bg-gradient-to-r from-pink-500/10 to-purple-500/5 p-4 flex items-center gap-3 transition-all hover:from-pink-500/15 hover:to-purple-500/10"
    >
      <div
        className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
      >
        <TrendingUp size={20} color="white" />
      </div>
      <div className="text-left flex-1">
        <p className="text-sm font-bold text-white">Start Renting This Vehicle</p>
        <p className="text-xs text-white/50">List on the marketplace and start earning weekly income</p>
      </div>
    </button>
  );
}