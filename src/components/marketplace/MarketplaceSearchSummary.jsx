import React from "react";
import { MapPin, Calendar, SlidersHorizontal, X, Map } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function MarketplaceSearchSummary({
  vehicleCount,
  city,
  pickupDate,
  returnDate,
  activeFilters = [],
  sort,
  onClearFilters,
  onClearFilter,
  isLoading,
}) {
  const sortLabels = {
    recommended: "Recommended",
    lowest_price: "Price: Low to High",
    highest_price: "Price: High to Low",
    newest: "Newest",
    closest: "Closest Distance",
    available_soonest: "Available Soonest",
  };

  return (
    <div className="max-w-5xl mx-auto px-4 mt-3">
      <div className="rounded-xl bg-white border border-gray-200 shadow-sm px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Vehicle count + location + dates */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-bold text-gray-900 text-sm">
              {isLoading ? "Searching…" : `${vehicleCount} vehicle${vehicleCount !== 1 ? "s" : ""} available`}
            </span>
            {city && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <MapPin className="h-3 w-3" /> {city}
              </span>
            )}
            {pickupDate && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <Calendar className="h-3 w-3" />
                {format(new Date(pickupDate), "MMM d")}
                {returnDate && ` → ${format(new Date(returnDate), "MMM d")}`}
              </span>
            )}
          </div>

          {/* Sort + Clear */}
          <div className="flex items-center gap-2">
            {sort && sortLabels[sort] && (
              <Badge variant="outline" className="text-xs gap-1">
                <SlidersHorizontal className="h-2.5 w-2.5" /> {sortLabels[sort]}
              </Badge>
            )}
            {activeFilters.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-gray-500 h-7 px-2"
                onClick={onClearFilters}
              >
                <X className="h-3 w-3 mr-1" /> Clear All
              </Button>
            )}
          </div>
        </div>

        {/* Active filter tags */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-gray-100">
            {activeFilters.map((f, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="gap-1 text-xs cursor-pointer"
                onClick={() => onClearFilter(f.key)}
              >
                {f.label}
                <X className="h-2.5 w-2.5" />
              </Badge>
            ))}
          </div>
        )}

        {/* Map toggle placeholder */}
        <div className="mt-2 pt-2 border-t border-gray-100">
          <button
            className="text-xs text-gray-400 flex items-center gap-1.5 hover:text-gray-600 transition-colors"
            disabled
          >
            <Map className="h-3 w-3" /> Map view coming soon
          </button>
        </div>
      </div>
    </div>
  );
}