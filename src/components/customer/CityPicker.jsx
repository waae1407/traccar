import React from "react";
import { MapPin, X } from "lucide-react";

const CITIES = ["Dallas", "Houston", "Atlanta", "Chicago", "Miami", "Los Angeles", "Phoenix", "Denver"];

export default function CityPicker({ open, onClose, onSelect, selected }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-auto bg-white rounded-t-3xl p-6 pb-10 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-lg">Choose City</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {CITIES.map((city) => (
            <button key={city} onClick={() => { onSelect(city); onClose(); }}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${selected === city ? "border-pink-500 bg-pink-50 text-pink-700" : "border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-200"}`}>
              <MapPin className="h-4 w-4 text-pink-500" />
              {city}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}