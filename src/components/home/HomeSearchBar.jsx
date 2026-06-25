import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Calendar, Car, Search } from "lucide-react";

const VEHICLE_TYPES = [
  { value: "", label: "Any Type" },
  { value: "sedan", label: "Sedan" },
  { value: "suv", label: "SUV" },
  { value: "truck", label: "Truck" },
  { value: "coupe", label: "Coupe" },
  { value: "convertible", label: "Convertible" },
  { value: "van", label: "Van" },
  { value: "wagon", label: "Wagon" },
  { value: "hatchback", label: "Hatchback" },
];

export default function HomeSearchBar() {
  const navigate = useNavigate();
  const [city, setCity] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [vehicleType, setVehicleType] = useState("");

  const today = new Date().toISOString().split("T")[0];
  const minReturn = pickupDate || today;

  const handlePickupChange = (val) => {
    setPickupDate(val);
    if (returnDate && returnDate < val) setReturnDate("");
  };

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (city.trim()) params.set("city", city.trim());
    if (pickupDate) params.set("pickup_date", pickupDate);
    if (returnDate) params.set("return_date", returnDate);
    if (vehicleType) params.set("vehicle_type", vehicleType);
    navigate(`/book-now?${params.toString()}`);
  };

  const canSearch = city.trim() || pickupDate || returnDate || vehicleType;

  const inputClass =
    "w-full h-11 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all";

  return (
    <div className="bg-white rounded-2xl shadow-2xl p-4 sm:p-5 max-w-2xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Location */}
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="City or ZIP"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={`${inputClass} pl-10`}
          />
        </div>

        {/* Vehicle Type */}
        <div className="relative">
          <Car className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <select
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
            className={`${inputClass} pl-10 appearance-none cursor-pointer`}
          >
            {VEHICLE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Pickup Date */}
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="date"
            min={today}
            value={pickupDate}
            onChange={(e) => handlePickupChange(e.target.value)}
            className={`${inputClass} pl-10`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 pointer-events-none">
            Pickup
          </span>
        </div>

        {/* Return Date */}
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="date"
            min={minReturn}
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
            className={`${inputClass} pl-10`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 pointer-events-none">
            Return
          </span>
        </div>
      </div>

      {/* Search Button */}
      <button
        onClick={handleSearch}
        disabled={!canSearch}
        className="w-full mt-3 h-12 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background:
            "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))",
        }}
      >
        <Search className="h-4 w-4" />
        Search Vehicles
      </button>
    </div>
  );
}