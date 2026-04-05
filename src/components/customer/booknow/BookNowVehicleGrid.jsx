import React from "react";
import { MapPin, Star, Zap, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const PLACEHOLDER = "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=600&q=80";

function VehicleCard({ v, onSelect, featured = false }) {
  return (
    <button
      onClick={() => onSelect(v)}
      className="w-full text-left rounded-2xl overflow-hidden active:scale-[0.97] transition-all duration-200 relative group"
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        boxShadow: featured ? "0 4px 20px hsl(338 90% 56% / 0.12)" : "0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      {/* Image */}
      <div className="relative overflow-hidden" style={{ height: featured ? "180px" : "150px" }}>
        <img
          src={v.image_url || PLACEHOLDER}
          alt={`${v.make} ${v.model}`}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)" }} />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex gap-1.5">
          {v.rent_to_own_eligible && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              <Zap className="h-2.5 w-2.5" fill="white" />
              RTO
            </span>
          )}
          {featured && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold text-yellow-300 bg-yellow-500/20 border border-yellow-500/30">
              ⭐ Top Pick
            </span>
          )}
        </div>

        {/* Status dot */}
        <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
          <span className="text-[9px] text-white/80 font-medium">Available</span>
        </div>

        {/* Price overlay on image bottom */}
        <div className="absolute bottom-3 left-3">
          <span className="text-white text-xl font-bold" style={{ fontFamily: "var(--font-syne)" }}>
            ${v.weekly_rate || "—"}
          </span>
          <span className="text-white/50 text-xs font-normal">/wk</span>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 flex items-center justify-between">
        <div className="min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate">{v.year} {v.make} {v.model}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex items-center gap-0.5">
              <MapPin className="h-2.5 w-2.5 text-gray-400" />
              <span className="text-[10px] text-gray-400">{v.city || v.current_city || "Available"}</span>
            </div>
            <span className="text-gray-200">·</span>
            <div className="flex items-center gap-0.5">
              <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
              <span className="text-[10px] text-gray-400">4.9</span>
            </div>
          </div>
        </div>
        <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ml-2"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          <ChevronRight className="h-4 w-4 text-white" />
        </div>
      </div>
    </button>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden bg-white border border-gray-100">
      <Skeleton className="h-[150px] w-full rounded-none" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-2.5 w-20" />
      </div>
    </div>
  );
}

export default function BookNowVehicleGrid({ vehicles, isLoading, city, onSelect }) {
  if (isLoading) {
    return (
      <div className="px-4">
        <Skeleton className="h-5 w-36 mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (vehicles.length === 0) {
    return (
      <div className="px-4 flex flex-col items-center py-16 text-center">
        <div className="text-5xl mb-4">🚗</div>
        <p className="text-gray-500 font-semibold">No vehicles available</p>
        <p className="text-gray-400 text-sm mt-1">Check back soon or change your filter</p>
      </div>
    );
  }

  return (
    <div className="px-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-gray-900 text-base" style={{ fontFamily: "var(--font-syne)" }}>
            {city ? `Rides in ${city}` : "All Available Rides"}
          </h2>
          <p className="text-gray-400 text-xs mt-0.5">{vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""} ready to book</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {vehicles.map((v, i) => (
          <VehicleCard key={v.id} v={v} onSelect={onSelect} featured={i === 0} />
        ))}
      </div>
    </div>
  );
}