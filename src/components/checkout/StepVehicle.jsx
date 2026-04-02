import React, { useState } from "react";
import { Star, Zap, MapPin } from "lucide-react";

const PLACEHOLDER = "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=600&q=70";
const TYPES = ["Daily", "Weekly", "Monthly", "Rent-to-Own"];

export default function StepVehicle({ vehicles, bookingType, onSelect }) {
  const [type, setType] = useState(bookingType || "Weekly");
  const available = vehicles.filter((v) => {
    if (v.status !== "Available") return false;
    if (type === "Rent-to-Own") return v.rent_to_own_eligible;
    return true;
  });

  return (
    <div>
      <h2 className="font-bold text-gray-900 text-xl mb-1">Choose Your Vehicle</h2>
      <p className="text-gray-400 text-sm mb-4">Select a rental type and pick your car</p>

      {/* Type toggle */}
      <div className="flex gap-2 mb-5 overflow-x-auto no-scrollbar pb-1">
        {TYPES.map((t) => (
          <button key={t} onClick={() => setType(t)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
              type === t ? "text-white shadow-sm" : "bg-gray-100 text-gray-600"
            }`}
            style={type === t ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : {}}>
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {available.map((v) => (
          <button key={v.id} onClick={() => onSelect(v, type)}
            className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex active:scale-[0.98] transition-transform text-left">
            <div className="w-28 h-24 flex-shrink-0 bg-gray-100 overflow-hidden">
              <img src={v.image_url || PLACEHOLDER} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-gray-900 text-sm">{v.year} {v.make} {v.model}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3 text-gray-400" />
                    <span className="text-xs text-gray-500">{v.current_city || "Available"}</span>
                  </div>
                </div>
                {v.rent_to_own_eligible && (
                  <span className="flex items-center gap-0.5 text-[9px] font-bold text-pink-600 bg-pink-50 px-1.5 py-0.5 rounded-full border border-pink-100 flex-shrink-0">
                    <Zap className="h-2.5 w-2.5" />RTO
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-1">
                  <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                  <span className="text-xs font-medium text-gray-600">4.8</span>
                </div>
                <span className="font-bold text-pink-600 text-base">
                  ${v.weekly_rate || "—"}<span className="text-xs font-normal text-gray-400">/wk</span>
                </span>
              </div>
            </div>
          </button>
        ))}
        {available.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">🚗</p>
            <p className="font-semibold">No vehicles available for this type.</p>
          </div>
        )}
      </div>
    </div>
  );
}