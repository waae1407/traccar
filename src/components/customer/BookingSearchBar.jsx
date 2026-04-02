import React, { useState } from "react";
import { Search, CalendarDays, ChevronDown } from "lucide-react";

const types = ["Daily", "Weekly", "Monthly", "Rent-to-Own"];

export default function BookingSearchBar({ bookingType, onBookingTypeChange, onTap }) {
  const [date, setDate] = useState("");

  return (
    <div className="relative rounded-2xl bg-white shadow-xl overflow-hidden">
      {/* Search row */}
      <button
        onClick={onTap}
        className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-gray-50 transition-colors"
      >
        <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          <Search className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 text-sm leading-tight">Where do you need a car?</p>
          <p className="text-gray-400 text-xs mt-0.5">City, airport, or address</p>
        </div>
        <ChevronDown className="h-4 w-4 text-gray-300 flex-shrink-0" />
      </button>

      {/* Divider */}
      <div className="h-px bg-gray-100 mx-4" />

      {/* Date + Type row */}
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <CalendarDays className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-xs text-gray-600 bg-transparent outline-none flex-1 min-w-0 cursor-pointer"
            placeholder="Pick a date"
          />
        </div>
        {/* Booking type pills */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => onBookingTypeChange(t)}
              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all ${
                bookingType === t
                  ? "text-white"
                  : "bg-gray-100 text-gray-500"
              }`}
              style={bookingType === t ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : {}}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}