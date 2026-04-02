import React from "react";
import { TrendingUp, MapPin, ArrowRight } from "lucide-react";

export default function CityInsightCard({ vehicles, city }) {
  const available = vehicles.filter((v) => v.status === "Available").length;
  const avgRate = vehicles.length
    ? Math.round(vehicles.filter((v) => v.weekly_rate).reduce((s, v) => s + v.weekly_rate, 0) / (vehicles.filter((v) => v.weekly_rate).length || 1))
    : null;

  return (
    <div className="mx-4 mt-6 rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-gray-50">
        <div className="h-8 w-8 rounded-xl bg-green-50 flex items-center justify-center">
          <TrendingUp className="h-4 w-4 text-green-600" />
        </div>
        <div>
          <p className="font-bold text-gray-900 text-sm">
            {city ? `${city} Fleet` : "Fleet Insights"}
          </p>
          <p className="text-gray-400 text-xs">Live availability</p>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-gray-100 px-0">
        <div className="flex flex-col items-center py-4">
          <span className="text-2xl font-bold text-gray-900">{available}</span>
          <span className="text-[10px] text-gray-400 mt-0.5">Available</span>
        </div>
        <div className="flex flex-col items-center py-4">
          <span className="text-2xl font-bold text-gray-900">{avgRate ? `$${avgRate}` : "—"}</span>
          <span className="text-[10px] text-gray-400 mt-0.5">Avg/week</span>
        </div>
        <div className="flex flex-col items-center py-4">
          <span className="text-2xl font-bold text-gray-900">4.9</span>
          <span className="text-[10px] text-gray-400 mt-0.5">Rating</span>
        </div>
      </div>

      <div className="px-4 pb-4">
        <button
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white active:opacity-80 transition-opacity"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
        >
          <MapPin className="h-4 w-4" />
          Browse all vehicles
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}