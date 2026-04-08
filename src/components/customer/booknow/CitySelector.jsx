import React from "react";
import { MapPin, Flame, Zap } from "lucide-react";

const CITIES = [
  { name: "All",        badge: null,          icon: null },
  { name: "Detroit",    badge: "🔥 High Demand", hot: true },
  { name: "DTW Airport",badge: "⚡ Fast Pickup", fast: true },
  { name: "Southfield", badge: "⚡ Fast Pickup", fast: true },
  { name: "Troy",       badge: null,          stable: true },
];

export default function CitySelector({ selectedCity, onSelectCity }) {
  return (
    <div className="px-4 mb-4">
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {CITIES.map((c) => {
          const isActive = selectedCity === c.name;
          return (
            <button
              key={c.name}
              onClick={() => onSelectCity(c.name === "All" ? "" : c.name)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all active:scale-95"
              style={{
                background: isActive
                  ? "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))"
                  : "#fff",
                borderColor: isActive ? "transparent" : "#e5e7eb",
                color: isActive ? "white" : "#374151",
                boxShadow: isActive ? "0 2px 12px hsl(338 90% 56% / 0.25)" : "0 1px 3px rgba(0,0,0,0.06)",
              }}
            >
              {c.name === "All" ? (
                <><MapPin className="h-3 w-3" />All Cities</>
              ) : (
                <>{c.name}</>
              )}
              {c.badge && !isActive && (
                <span className={`ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  c.hot ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"
                }`}>
                  {c.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}