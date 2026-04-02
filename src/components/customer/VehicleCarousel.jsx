import React from "react";
import VehicleCard from "./VehicleCard";
import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function VehicleCarousel({ title, subtitle, vehicles, isLoading, onSelectVehicle, onViewAll }) {
  if (isLoading) {
    return (
      <div className="px-4 mt-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-20 bg-gray-100 rounded animate-pulse mt-1" />
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-52 w-52 bg-gray-100 rounded-2xl animate-pulse flex-shrink-0" />)}
        </div>
      </div>
    );
  }

  if (!vehicles || vehicles.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="px-4 flex items-center justify-between mb-3">
        <div>
          <h2 className="font-bold text-gray-900 text-base">{title}</h2>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {onViewAll && (
          <button onClick={onViewAll} className="flex items-center gap-1 text-pink-600 text-xs font-semibold">
            See all <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 px-4 scrollbar-hide" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {vehicles.map((v) => (
          <VehicleCard key={v.id} vehicle={v} onSelect={onSelectVehicle} />
        ))}
      </div>
    </div>
  );
}