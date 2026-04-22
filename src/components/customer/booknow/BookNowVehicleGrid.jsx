import React from "react";
import { MapPin, Star, Zap, ChevronRight, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const PLACEHOLDER = "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=600&q=80";

// Heuristic tags based on vehicle properties
function getVehicleTags(v) {
  const tags = [];
  const model = (v.model || "").toLowerCase();
  const make = (v.make || "").toLowerCase();
  const year = v.year || 0;

  // Gig-friendly makes/models
  const gigModels = ["prius", "camry", "accord", "civic", "altima", "sentra", "malibu", "fusion", "elantra", "sonata", "corolla"];
  if (gigModels.some((m) => model.includes(m))) tags.push("uber");

  // Fuel efficiency heuristic
  const efficientModels = ["prius", "civic", "corolla", "elantra", "sentra", "fit", "accent"];
  if (efficientModels.some((m) => model.includes(m))) tags.push("fuel");

  return tags;
}

function VehicleCard({ v, onSelect, featured = false }) {
  const tags = getVehicleTags(v);

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
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)" }} />

        {/* Top-left badges */}
        <div className="absolute top-3 left-3 flex gap-1.5">
          {v.rent_to_own_eligible && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              <Zap className="h-2.5 w-2.5" fill="white" />RTO
            </span>
          )}
          {featured && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold text-yellow-300 bg-yellow-500/20 border border-yellow-500/30">
              ⭐ Top Pick
            </span>
          )}
        </div>

        {/* Approval badge top-right */}
        <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm">
          <Clock className="h-2.5 w-2.5 text-amber-300" />
          <span className="text-[9px] text-white/80 font-medium">~24hr review</span>
        </div>

        {/* Price */}
        <div className="absolute bottom-3 left-3">
          <span className="text-white text-xl font-bold" style={{ fontFamily: "var(--font-syne)" }}>
            ${v.weekly_rate || "—"}
          </span>
          <span className="text-white/50 text-xs font-normal">/wk</span>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-bold text-gray-900 text-sm truncate">{v.year} {v.make} {v.model}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <div className="flex items-center gap-0.5">
            <MapPin className="h-2.5 w-2.5 text-gray-400" />
            <span className="text-[10px] text-gray-400">
              {v.city || "Available"}
              {v.distance !== undefined && <span className="ml-1 text-gray-300">({v.distance.toFixed(1)} mi)</span>}
            </span>
          </div>
          <span className="text-gray-200">·</span>
          <div className="flex items-center gap-0.5">
            <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
            <span className="text-[10px] text-gray-400">4.9</span>
          </div>
        </div>

        {/* Gig tags — only show if relevant */}
        {tags.length > 0 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {tags.includes("uber") && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-black text-white">
                🚗 Uber ready
              </span>
            )}
            {tags.includes("fuel") && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-green-50 text-green-700 border border-green-200">
                ⛽ Fuel efficient
              </span>
            )}
          </div>
        )}
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

export default function BookNowVehicleGrid({ vehicles, isLoading, location, onSelect, isExpandedRadius }) {
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
        <p className="text-gray-400 text-sm mt-1">Try a different location or check back soon</p>
      </div>
    );
  }

  return (
    <div className="px-4">
      {/* Expanded radius notice */}
      {isExpandedRadius && (
        <div className="mb-4 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
          <MapPin className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 font-medium">
            No vehicles within 50 miles — showing nearest available rides outside your area.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-gray-900 text-base" style={{ fontFamily: "var(--font-syne)" }}>
            {isExpandedRadius ? "Nearest Available Rides" : "Nearby Rides"}
          </h2>
          <p className="text-gray-400 text-xs mt-0.5">
            {vehicles.length > 5 ? `🔥 High demand in your area` : `${vehicles.length} vehicle${vehicles.length !== 1 ? "s" : ""} available`}
            {" "}· Approval required · Response within 24hrs
          </p>
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