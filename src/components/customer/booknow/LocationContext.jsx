import React, { useState } from "react";
import { Navigation, Search, MapPin, Loader2 } from "lucide-react";

export default function LocationContext({ location, detecting, source, onZipSearch, suggestedCities, vehicleCount }) {
  const [showSearch, setShowSearch] = useState(false);
  const [zip, setZip] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    if (zip.length !== 5) { setError("Enter a 5-digit zip code"); return; }
    setSearching(true);
    setError("");
    try {
      await onZipSearch(zip);
      setShowSearch(false);
      setZip("");
    } catch {
      setError("Zip code not found");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="px-4 mb-6">
      {/* Compact context block */}
      <div className="rounded-2xl border border-gray-200 bg-white p-3.5">
        {/* Location row */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              {detecting ? <Loader2 className="h-3 w-3 text-white animate-spin" /> : <Navigation className="h-3 w-3 text-white" />}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider leading-none">Your location</p>
              <p className="text-sm font-bold text-gray-900 truncate mt-0.5">
                {location.city}{location.state ? `, ${location.state}` : ""}
              </p>
            </div>
          </div>
          <button
            id="location-context-change"
            onClick={() => setShowSearch(!showSearch)}
            className="flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {showSearch ? "Cancel" : "Change"}
          </button>
        </div>

        {/* Availability row */}
        <div className="flex items-center gap-2 pt-3">
          <span className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-gray-700">
            {vehicleCount} vehicle{vehicleCount !== 1 ? "s" : ""} available now
          </span>
        </div>

        {/* Zip search expansion */}
        {showSearch && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50">
                <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="Enter zip"
                  value={zip}
                  onChange={(e) => { setZip(e.target.value.replace(/\D/g, "")); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="flex-1 bg-transparent text-xs text-gray-900 outline-none placeholder:text-gray-400"
                  autoFocus
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={searching || zip.length !== 5}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
              >
                {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : "Go"}
              </button>
            </div>
            {error && <p className="text-[10px] text-red-500">{error}</p>}

            {/* Suggested cities */}
            {suggestedCities.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Popular nearby</p>
                <div className="flex gap-1.5 flex-wrap">
                  {suggestedCities.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => { onZipSearch(null, c); setShowSearch(false); }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 text-[10px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <MapPin className="h-2 w-2 text-gray-400" />
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}