import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, Zap } from "lucide-react";

const PLACEHOLDER = "https://images.unsplash.com/photo-1581235720704-06d3acfcb36f?w=400&q=70";

function VehicleCard({ v, onSelect }) {
  return (
    <button
      onClick={() => onSelect(v)}
      className="flex-shrink-0 w-44 rounded-2xl bg-white shadow-sm overflow-hidden active:scale-95 transition-transform border border-gray-100"
    >
      {/* Image */}
      <div className="relative h-28 w-full overflow-hidden bg-gray-100">
        <img
          src={v.image_url || PLACEHOLDER}
          alt={`${v.make} ${v.model}`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        {v.rent_to_own_eligible && (
          <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            <Zap className="h-2.5 w-2.5" fill="white" />
            RTO
          </span>
        )}
        {v.status === "Available" && (
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-green-400 border-2 border-white" />
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-bold text-gray-900 text-sm leading-tight truncate">
          {v.year} {v.make}
        </p>
        <p className="text-gray-500 text-xs truncate">{v.model}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="font-bold text-gray-900 text-sm">
            ${v.weekly_rate || "—"}
            <span className="text-gray-400 font-normal text-[10px]">/wk</span>
          </span>
          <div className="flex items-center gap-0.5">
            <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
            <span className="text-[10px] text-gray-500 font-medium">4.9</span>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function PopularVehicles({ vehicles, isLoading, city, onSelect }) {
  return (
    <section className="mt-5">
      <div className="flex items-center justify-between px-4 mb-3">
        <div>
          <h2 className="font-bold text-gray-900 text-base">Popular near you</h2>
          <p className="text-gray-400 text-xs">{city ? `Available in ${city}` : "All locations"}</p>
        </div>
        <button className="text-pink-600 text-xs font-semibold">See all</button>
      </div>

      <div className="flex gap-3 overflow-x-auto px-4 pb-1 no-scrollbar">
        {isLoading
          ? Array(4).fill(0).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-44 rounded-2xl overflow-hidden">
                <Skeleton className="h-28 w-full" />
                <div className="p-3 space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))
          : vehicles.slice(0, 8).map((v) => (
              <VehicleCard key={v.id} v={v} onSelect={onSelect} />
            ))
        }
      </div>
    </section>
  );
}