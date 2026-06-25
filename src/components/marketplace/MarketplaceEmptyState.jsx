import React from "react";
import { Calendar, MapPin, Search, RotateCcw, Sparkles } from "lucide-react";
import { format, addDays } from "date-fns";

export default function MarketplaceEmptyState({
  city,
  pickupDate,
  returnDate,
  onExpandRadius,
  onAdjustDates,
  onClearFilters,
  suggestedDates = [],
}) {
  // Generate alternative dates if none suggested
  const altDates = suggestedDates.length > 0
    ? suggestedDates
    : [
        { start: format(addDays(new Date(), 3), "yyyy-MM-dd"), end: format(addDays(new Date(), 10), "yyyy-MM-dd") },
        { start: format(addDays(new Date(), 7), "yyyy-MM-dd"), end: format(addDays(new Date(), 14), "yyyy-MM-dd") },
        { start: format(addDays(new Date(), 14), "yyyy-MM-dd"), end: format(addDays(new Date(), 21), "yyyy-MM-dd") },
      ];

  return (
    <div className="px-4 py-8">
      <div className="rounded-3xl overflow-hidden border border-gray-200 bg-white">
        {/* Header */}
        <div className="px-5 pt-6 pb-5 text-center"
          style={{ background: "linear-gradient(160deg, #fff8fc 0%, #f5f0ff 100%)" }}>
          <div className="h-16 w-16 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center mx-auto mb-3">
            <Calendar className="h-7 w-7 text-gray-400" />
          </div>
          <p className="font-bold text-gray-900 text-lg leading-snug" style={{ fontFamily: "var(--font-syne)" }}>
            No vehicles available for these dates
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {city && <>in {city} · </>}
            {pickupDate && returnDate
              ? `${format(new Date(pickupDate), "MMM d")} → ${format(new Date(returnDate), "MMM d")}`
              : "Try adjusting your search"}
          </p>
        </div>

        {/* Action suggestions */}
        <div className="px-5 pb-5 pt-4 space-y-3">
          {/* Expand search radius */}
          <button
            onClick={onExpandRadius}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-pink-300 hover:bg-pink-50/50 transition-all text-left"
          >
            <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <MapPin className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">Expand search radius</p>
              <p className="text-xs text-gray-400">Look for vehicles in nearby cities</p>
            </div>
          </button>

          {/* Adjust dates */}
          <button
            onClick={onAdjustDates}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-pink-300 hover:bg-pink-50/50 transition-all text-left"
          >
            <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
              <Calendar className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">Adjust your dates</p>
              <p className="text-xs text-gray-400">Try different pickup or return dates</p>
            </div>
          </button>

          {/* Clear all filters */}
          <button
            onClick={onClearFilters}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-pink-300 hover:bg-pink-50/50 transition-all text-left"
          >
            <div className="h-9 w-9 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
              <RotateCcw className="h-4 w-4 text-gray-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">Clear all filters</p>
              <p className="text-xs text-gray-400">Start fresh with no filters</p>
            </div>
          </button>

          {/* Alternative available dates */}
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-pink-500" />
              <p className="text-sm font-bold text-gray-800">Try these alternative dates</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {altDates.map((d, i) => (
                <button
                  key={i}
                  onClick={() => onAdjustDates(d.start, d.end)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-gray-50 hover:border-pink-300 hover:bg-pink-50 transition-all"
                >
                  {format(new Date(d.start), "MMM d")} → {format(new Date(d.end), "MMM d")}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}