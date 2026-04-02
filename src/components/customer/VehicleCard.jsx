import React from "react";
import { MapPin, Star, Zap } from "lucide-react";

export default function VehicleCard({ vehicle, onSelect }) {
  const price = vehicle.weekly_rate
    ? `$${vehicle.weekly_rate}/wk`
    : vehicle.daily_rate
    ? `$${vehicle.daily_rate}/day`
    : "Call for price";

  return (
    <div
      onClick={() => onSelect?.(vehicle)}
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-all active:scale-[0.98] cursor-pointer flex-shrink-0 w-52"
    >
      {/* Image */}
      <div className="relative h-32 bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
        {vehicle.image_url ? (
          <img src={vehicle.image_url} alt={`${vehicle.make} ${vehicle.model}`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-5xl">🚗</span>
          </div>
        )}
        {vehicle.rent_to_own_eligible && (
          <div className="absolute top-2 left-2 bg-pink-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
            <Zap className="h-2.5 w-2.5" /> RTO
          </div>
        )}
        <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
          {vehicle.status}
        </div>
      </div>

      {/* Details */}
      <div className="p-3">
        <p className="font-bold text-gray-900 text-sm leading-tight">{vehicle.year} {vehicle.make}</p>
        <p className="text-xs text-gray-500">{vehicle.model} · {vehicle.color}</p>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3 text-gray-400" />
            <span className="text-[10px] text-gray-400">{vehicle.current_city || "Available"}</span>
          </div>
          <p className="text-sm font-bold text-pink-600">{price}</p>
        </div>
        <div className="flex items-center gap-1 mt-1">
          <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
          <span className="text-[10px] font-semibold text-gray-600">4.8</span>
          <span className="text-[10px] text-gray-400">(24)</span>
        </div>
      </div>
    </div>
  );
}