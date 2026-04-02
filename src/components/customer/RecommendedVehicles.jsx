import React from "react";
import { Sparkles, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const PLACEHOLDER = "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=400&q=70";

function HorizontalVehicleRow({ v, onSelect }) {
  return (
    <button
      onClick={() => onSelect(v)}
      className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white border border-gray-100 shadow-sm active:scale-[0.98] transition-transform"
    >
      <div className="h-16 w-20 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
        <img
          src={v.image_url || PLACEHOLDER}
          alt={`${v.make} ${v.model}`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="font-bold text-gray-900 text-sm truncate">{v.year} {v.make} {v.model}</p>
        <p className="text-gray-400 text-xs">{v.current_city || "Available"}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs font-bold text-gray-800">
            ${v.weekly_rate || "—"}<span className="text-gray-400 font-normal">/wk</span>
          </span>
          <div className="flex items-center gap-0.5">
            <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
            <span className="text-[10px] text-gray-500">4.8</span>
          </div>
        </div>
      </div>
      <div className="flex-shrink-0">
        <div className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          Book
        </div>
      </div>
    </button>
  );
}

export default function RecommendedVehicles({ vehicles, isLoading, user, onSelect }) {
  return (
    <section className="mt-6 px-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-purple-500" />
        <h2 className="font-bold text-gray-900 text-base">
          {user ? `Picks for you` : "Best value picks"}
        </h2>
      </div>

      <div className="space-y-3">
        {isLoading
          ? Array(3).fill(0).map((_, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-2xl bg-white border border-gray-100">
                <Skeleton className="h-16 w-20 rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))
          : vehicles.map((v) => (
              <HorizontalVehicleRow key={v.id} v={v} onSelect={onSelect} />
            ))
        }
      </div>
    </section>
  );
}