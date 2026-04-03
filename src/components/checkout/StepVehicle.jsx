import React, { useState, useMemo } from "react";
import { Car, Calendar, RefreshCw, AlertCircle, ChevronRight, Check, MapPin, Search, Zap, Star, SlidersHorizontal, X } from "lucide-react";
import { addWeeks, format } from "date-fns";

const BOOKING_TYPES = ["Weekly", "Rent-to-Own"];
const RADIUS_OPTIONS = [10, 25, 50, 100, 250];

// Common US zipcodes → { lat, lon, city, state }
const ZIPCODE_DB = {
  "60616": { lat: 41.8719, lon: -87.6183, city: "Chicago", state: "IL" },
  "60601": { lat: 41.8816, lon: -87.6191, city: "Chicago", state: "IL" },
  "10001": { lat: 40.7506, lon: -73.9972, city: "New York", state: "NY" },
  "90001": { lat: 33.9731, lon: -118.2479, city: "Los Angeles", state: "CA" },
  "77001": { lat: 29.7589, lon: -95.3677, city: "Houston", state: "TX" },
  "75201": { lat: 32.7767, lon: -96.7970, city: "Dallas", state: "TX" },
  "33101": { lat: 25.7617, lon: -80.1918, city: "Miami", state: "FL" },
  "75401": { lat: 25.7617, lon: -80.1918, city: "Miami", state: "FL" },
  // Add more as needed
};

function getZipcodeInfo(zipcode) {
  return ZIPCODE_DB[zipcode] || null;
}

function calcEndDate(startDate, type) {
  if (!startDate) return null;
  const d = new Date(startDate);
  if (type === "Weekly") return format(addWeeks(d, 1), "yyyy-MM-dd");
  if (type === "Rent-to-Own") return format(addWeeks(d, 52), "yyyy-MM-dd");
  return null;
}

// Haversine formula – returns miles between two lat/lon pairs
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Smart recommendation engine
function getSmartTip(type, filtered, startDate) {
  if (!startDate) return { icon: "📅", text: "Pick a start date to unlock available vehicles near you." };
  if (filtered.length === 0) return { icon: "🔍", text: "No vehicles match your filters. Try expanding the radius or switching to a different city." };
  if (type === "Weekly" && filtered.length < 3) return { icon: "⚡", text: "High demand! Only a few vehicles left — lock yours in now." };
  if (type === "Rent-to-Own") return { icon: "🏆", text: "Rent-to-Own builds equity toward ownership. Great choice for long-term drivers!" };
  const cheapest = [...filtered].sort((a, b) => (a.weekly_rate || 999) - (b.weekly_rate || 999))[0];
  if (cheapest) return { icon: "💡", text: `Best deal: ${cheapest.year} ${cheapest.make} ${cheapest.model} at $${cheapest.weekly_rate}/wk — No deposit required!` };
  return null;
}

export default function StepVehicle({ vehicles = [], vehicleId, bookingType: initialType, onSelect }) {
  const validInitialType = BOOKING_TYPES.includes(initialType) ? initialType : "Weekly";
  const [type, setType] = useState(validInitialType);
  const [startDate, setStartDate] = useState("");
  const [autoRenew, setAutoRenew] = useState(true);
  const [selectedId, setSelectedId] = useState(vehicleId || null);
  const [zipcode, setZipcode] = useState("");
  const [radius, setRadius] = useState(50);
  const [showFilters, setShowFilters] = useState(false);
  const [locating, setLocating] = useState(false);
  const [userCoords, setUserCoords] = useState(null);
  const [zipcodeCoords, setZipcodeCoords] = useState(null);

  const available = vehicles.filter((v) => v.status === "Available");
  const typeFiltered = type === "Rent-to-Own" ? available.filter((v) => v.rent_to_own_eligible) : available;

  // Geo-filter if coords are available
  const geoFiltered = useMemo(() => {
    const coords = zipcodeCoords || userCoords;
    if (!coords) return typeFiltered;
    // Filter vehicles by distance from search coords
    return typeFiltered.filter((v) => {
      if (!v.latitude || !v.longitude) return false;
      const dist = haversine(coords.lat, coords.lon, v.latitude, v.longitude);
      return dist <= radius;
    });
  }, [typeFiltered, zipcodeCoords, userCoords, radius]);

  const filtered = geoFiltered;
  const displayLocationName = zipcodeCoords?.city && zipcodeCoords?.state
    ? `${zipcodeCoords.city}, ${zipcodeCoords.state}`
    : userCoords?.label || null;
  const endDate = calcEndDate(startDate, type);
  const selectedVehicle = vehicles.find((v) => v.id === selectedId);
  const smartTip = getSmartTip(type, filtered, startDate);

  const handleLocate = () => {
    setLocating(true);
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false)
    );
  };

  const handleZipcodeSearch = async () => {
    if (!zipcode || zipcode.length < 5) return;
    const info = getZipcodeInfo(zipcode);
    if (info) {
      setZipcodeCoords(info);
    } else {
      alert("Zipcode not found. Please try another.");
    }
  };

  const handleConfirm = () => {
    if (!startDate || !selectedVehicle) return;
    onSelect(selectedVehicle, type, { startDate, endDate, autoRenew });
  };

  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="font-bold text-gray-900 text-2xl">Choose Your Ride</h2>
        <p className="text-gray-400 text-sm mt-1">Select type · Set date · Pick your vehicle</p>
      </div>

      {/* Rental type tabs */}
      <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl">
        {BOOKING_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => { setType(t); setSelectedId(null); }}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${
              type === t
                ? "bg-white shadow-sm text-gray-900"
                : "text-gray-400"
            }`}
            style={type === t ? {} : {}}
          >
            {t === "Weekly" ? "📅 Weekly" : "🔑 Rent-to-Own"}
          </button>
        ))}
      </div>

      {/* Smart tip banner */}
      {smartTip && (
        <div className="flex gap-3 p-3.5 rounded-2xl border items-start"
          style={{ background: "linear-gradient(135deg, #fdf2f8, #faf5ff)", borderColor: "#f0abdc" }}>
          <span className="text-lg flex-shrink-0 mt-0.5">{smartTip.icon}</span>
          <p className="text-xs text-gray-700 leading-relaxed">{smartTip.text}</p>
        </div>
      )}

      {/* Start Date */}
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
          Start Date <span className="text-pink-500">*</span>
        </label>
        <div className="relative">
          <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="date"
            min={today}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full h-12 pl-10 pr-4 rounded-2xl border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all"
          />
        </div>
        {startDate && endDate && (
          <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-pink-400" />
            {type === "Rent-to-Own" ? "52-week program" : "1-week rental"} · ends{" "}
            <strong className="text-gray-700">{format(new Date(endDate), "MMM d, yyyy")}</strong>
          </p>
        )}
      </div>

      {/* Auto-renew (Weekly only) */}
      {type === "Weekly" && (
        <button
          onClick={() => setAutoRenew(!autoRenew)}
          className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 text-left transition-all ${
            autoRenew ? "border-pink-200 bg-pink-50" : "border-gray-100 bg-gray-50"
          }`}
        >
          <div className={`h-5 w-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${autoRenew ? "border-pink-500 bg-pink-500" : "border-gray-300"}`}>
            {autoRenew && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${autoRenew ? "text-pink-500" : "text-gray-400"}`} />
              Auto-Renew Weekly
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Cancel anytime — no commitment</p>
          </div>
          {autoRenew && (
            <span className="text-[10px] font-bold text-pink-600 bg-pink-100 px-2 py-0.5 rounded-full">ON</span>
          )}
        </button>
      )}

      {/* Location filter */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Filter by Location</label>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1.5 text-xs font-semibold text-pink-600"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {showFilters ? "Hide" : "Show"} filters
          </button>
        </div>

        {showFilters && (
          <div className="space-y-3 p-4 rounded-2xl bg-gray-50 border border-gray-100">
            {/* Zipcode input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={zipcode}
                  onChange={(e) => setZipcode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  placeholder="Enter ZIP code"
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all"
                />
              </div>
              <button
                onClick={handleZipcodeSearch}
                className="px-3 h-10 rounded-xl font-semibold text-xs text-white flex items-center gap-1.5 flex-shrink-0"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
              >
                <Search className="h-3.5 w-3.5" /> Search
              </button>
              <button
                onClick={handleLocate}
                disabled={locating}
                className="h-10 w-10 rounded-xl border border-gray-200 bg-white flex items-center justify-center flex-shrink-0 hover:border-pink-300 transition-colors"
                title="Use my location"
              >
                {locating
                  ? <div className="h-4 w-4 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" />
                  : <MapPin className="h-4 w-4 text-gray-500" />}
              </button>
            </div>

            {/* Radius selector */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Search radius</p>
              <div className="flex gap-2 flex-wrap">
                {RADIUS_OPTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRadius(r)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      radius === r
                        ? "text-white shadow-sm"
                        : "bg-white border border-gray-200 text-gray-500"
                    }`}
                    style={radius === r ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : {}}
                  >
                    {r} mi
                  </button>
                ))}
              </div>
            </div>

            {(userCoords || zipcodeCoords) && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-green-600 font-semibold flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  {displayLocationName || "Using your location"} · {radius} mi radius
                </p>
                <button onClick={() => { setUserCoords(null); setZipcodeCoords(null); setZipcode(""); }}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
                  <X className="h-3 w-3" /> Clear
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Vehicle list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {filtered.length} vehicle{filtered.length !== 1 ? "s" : ""} available
          </p>
          {type === "Rent-to-Own" && (
            <span className="text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Zap className="h-2.5 w-2.5" /> RTO Eligible Only
            </span>
          )}
        </div>

        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
              <div className="h-16 w-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                <Car className="h-8 w-8 text-gray-300" />
              </div>
              <p className="font-semibold text-gray-500 text-sm">No vehicles available</p>
              <p className="text-xs text-gray-400 mt-1">
                {type === "Rent-to-Own" ? "No Rent-to-Own eligible vehicles right now." : "Check back soon or expand your search."}
              </p>
            </div>
          ) : (
            filtered.map((v) => {
              const isSelected = selectedId === v.id;
              const deposit = Math.round((v.weekly_rate || 0) * 0.5);
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedId(isSelected ? null : v.id)}
                  className={`w-full text-left rounded-2xl border-2 overflow-hidden transition-all active:scale-[0.98] ${
                    isSelected
                      ? "border-pink-500 shadow-lg"
                      : "border-gray-100 bg-white shadow-sm hover:border-pink-200 hover:shadow-md"
                  }`}
                >
                  {/* Vehicle image */}
                  <div className="relative">
                    {v.image_url ? (
                      <img
                        src={v.image_url}
                        alt={`${v.year} ${v.make} ${v.model}`}
                        className="w-full h-36 object-cover"
                      />
                    ) : (
                      <div className="w-full h-28 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                        <Car className="h-12 w-12 text-gray-300" />
                      </div>
                    )}
                    {/* Badges on image */}
                    <div className="absolute top-2.5 left-2.5 flex gap-1.5">
                      {v.rent_to_own_eligible && (
                        <span className="text-[10px] font-bold bg-purple-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Zap className="h-2.5 w-2.5" /> RTO
                        </span>
                      )}
                    </div>
                    {/* No deposit badge */}
                    <div className="absolute top-2.5 right-2.5">
                      <span className="text-[10px] font-bold bg-green-500 text-white px-2 py-0.5 rounded-full rotate-[-2deg] inline-block shadow">
                        $0 Deposit!
                      </span>
                    </div>
                    {/* Selected overlay */}
                    {isSelected && (
                      <div className="absolute inset-0 bg-pink-500/10" />
                    )}
                  </div>

                  {/* Card body */}
                  <div className={`p-3.5 ${isSelected ? "bg-pink-50" : "bg-white"}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-base">
                          {v.year} {v.make} {v.model}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <MapPin className="h-3 w-3 text-gray-300" />
                            {v.current_city || "Available"}
                          </span>
                          {v.color && (
                            <span className="text-xs text-gray-400">· {v.color}</span>
                          )}
                          {v.mileage && (
                            <span className="text-xs text-gray-400">· {v.mileage.toLocaleString()} mi</span>
                          )}
                        </div>
                      </div>
                      <div className={`h-6 w-6 rounded-full flex-shrink-0 flex items-center justify-center transition-all ml-3 mt-0.5 ${
                        isSelected ? "bg-pink-500 shadow-md" : "border-2 border-gray-200"
                      }`}>
                        {isSelected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                      </div>
                    </div>

                    {/* Pricing row */}
                    <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-gray-100">
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-pink-600">${v.weekly_rate}</span>
                        <span className="text-xs text-gray-400">/wk</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 line-through">${deposit} deposit</span>
                        <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-100 px-1.5 py-0.5 rounded-full">FREE</span>
                      </div>
                    </div>

                    {/* Selected: show mini summary */}
                    {isSelected && startDate && (
                      <div className="mt-2.5 p-2.5 rounded-xl bg-white border border-pink-100 flex items-center gap-2">
                        <Check className="h-4 w-4 text-pink-500 flex-shrink-0" />
                        <p className="text-xs text-gray-700">
                          <strong>{type}</strong> starting <strong>{format(new Date(startDate), "MMM d, yyyy")}</strong>
                          {endDate && <> → {format(new Date(endDate), "MMM d")}</>}
                        </p>
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="sticky bottom-0 bg-white pt-3 pb-1">
        <button
          disabled={!startDate || !selectedVehicle}
          onClick={handleConfirm}
          className="w-full py-4 rounded-2xl font-bold text-base text-white transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
        >
          {selectedVehicle && startDate ? (
            <>
              Confirm {selectedVehicle.make} {selectedVehicle.model}
              <ChevronRight className="h-5 w-5" />
            </>
          ) : (
            <>
              <ChevronRight className="h-5 w-5" />
              {!startDate ? "Pick a start date to continue" : !selectedVehicle ? "Select a vehicle to continue" : "Confirm & Continue"}
            </>
          )}
        </button>
        {selectedVehicle && startDate && (
          <p className="text-center text-xs text-gray-400 mt-2">
            ${selectedVehicle.weekly_rate}/wk · No deposit · Cancel anytime
          </p>
        )}
      </div>
    </div>
  );
}