import React, { useState } from "react";
import { MapPin, Calendar, ChevronRight, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

const BOOKING_TYPES = ["Daily", "Weekly", "Monthly", "Rent-to-Own"];

export default function BookingSearchBox({ onSearch, city, setCity }) {
  const [pickupDate, setPickupDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [bookingType, setBookingType] = useState("Weekly");
  const [delivery, setDelivery] = useState(false);

  const handleSearch = () => {
    onSearch?.({ city, pickupDate, returnDate, bookingType, delivery });
  };

  return (
    <div className="mx-4 -mt-6 relative z-10">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Find your rental</p>
        </div>

        {/* City */}
        <div className="px-4 py-2 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-pink-50 flex items-center justify-center flex-shrink-0">
              <MapPin className="h-4 w-4 text-pink-600" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">City</p>
              <input
                className="w-full text-sm font-semibold text-gray-800 placeholder:text-gray-300 bg-transparent focus:outline-none"
                placeholder="Where are you booking?"
                value={city}
                onChange={(e) => setCity?.(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Dates */}
        <div className="flex border-b border-gray-100">
          <div className="flex-1 px-4 py-2 border-r border-gray-100">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-pink-600 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Pickup</p>
                <input type="date" className="text-sm font-semibold text-gray-800 bg-transparent focus:outline-none w-full"
                  value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="flex-1 px-4 py-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-pink-600 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Return</p>
                <input type="date" className="text-sm font-semibold text-gray-800 bg-transparent focus:outline-none w-full"
                  value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Booking type + delivery */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex gap-1.5">
            {BOOKING_TYPES.map((t) => (
              <button key={t} onClick={() => setBookingType(t)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-semibold transition-all",
                  bookingType === t
                    ? "bg-pink-600 text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                )}>{t}</button>
            ))}
          </div>
          <button onClick={() => setDelivery(!delivery)}
            className={cn("flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full transition-all",
              delivery ? "bg-pink-50 text-pink-600" : "text-gray-400")}>
            <Truck className="h-3.5 w-3.5" />
            Deliver
          </button>
        </div>

        {/* Search button */}
        <div className="px-4 pb-4">
          <button onClick={handleSearch}
            className="w-full h-11 rounded-xl font-bold text-sm text-white flex items-center justify-between px-5 transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            <span>Search Available Cars</span>
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}