import React, { useState } from "react";
import { MapPin, Navigation, Search, X, Loader2 } from "lucide-react";

export default function LocationBar({ location, detecting, source, onZipSearch, suggestedCities }) {
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
    <div className="px-4 mb-4">
      {/* Location display */}
      <div className="flex items-center justify-between gap-2 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            {detecting ? <Loader2 className="h-3.5 w-3.5 text-white animate-spin" /> : <Navigation className="h-3.5 w-3.5 text-white" />}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-400 leading-none">
              {detecting ? "Detecting location…" : source === "gps" ? "Detected location" : source === "manual" ? "Your location" : "Showing vehicles near"}
            </p>
            <p className="text-sm font-bold text-gray-900 truncate">
              {location.city}{location.state ? `, ${location.state}` : ""}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {showSearch ? "Cancel" : "Change"}
        </button>
      </div>

      {/* Zip search */}
      {showSearch && (
        <div className="mt-2 p-3 rounded-2xl border border-gray-200 bg-white">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50">
              <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <input
                type="text"
                inputMode="numeric"
                maxLength={5}
                placeholder="Enter zip code"
                value={zip}
                onChange={(e) => { setZip(e.target.value.replace(/\D/g, "")); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
                autoFocus
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching || zip.length !== 5}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
            >
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Go"}
            </button>
          </div>
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

          {/* Suggested cities */}
          {suggestedCities.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Popular nearby</p>
              <div className="flex gap-2 flex-wrap">
                {suggestedCities.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => { onZipSearch(null, c); setShowSearch(false); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <MapPin className="h-2.5 w-2.5 text-gray-400" />
                    {c.name}
                    {c.badge && (
                      <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full ${c.hot ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"}`}>
                        {c.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}