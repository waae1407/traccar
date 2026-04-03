import React, { useState } from "react";
import { Car, Calendar, RefreshCw, AlertCircle, ChevronRight } from "lucide-react";
import { addWeeks, addDays, format } from "date-fns";

const BOOKING_TYPES = ["Weekly", "Rent-to-Own"];

function calcEndDate(startDate, type) {
  if (!startDate) return null;
  const d = new Date(startDate);
  if (type === "Weekly") return format(addWeeks(d, 1), "yyyy-MM-dd");
  if (type === "Rent-to-Own") return format(addWeeks(d, 52), "yyyy-MM-dd");
  return null;
}

export default function StepVehicle({ vehicles = [], vehicleId, bookingType: initialType, onSelect }) {
  const [type, setType] = useState(BOOKING_TYPES.includes(initialType) ? initialType : "Weekly");
  const [startDate, setStartDate] = useState("");
  const [autoRenew, setAutoRenew] = useState(true);

  const available = vehicles.filter((v) => v.status === "Available");
  const rtoFiltered = type === "Rent-to-Own" ? available.filter((v) => v.rent_to_own_eligible) : available;

  const endDate = calcEndDate(startDate, type);

  const handleSelect = (vehicle) => {
    if (!startDate) return;
    onSelect(vehicle, type, { startDate, endDate, autoRenew });
  };

  return (
    <div>
      <h2 className="font-bold text-gray-900 text-xl mb-1">Choose Your Rental</h2>
      <p className="text-gray-400 text-sm mb-5">Select a rental type and pick a start date to see available vehicles.</p>

      {/* Rental type selector */}
      <div className="flex gap-2 mb-5">
        {BOOKING_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`flex-1 py-3 rounded-xl font-bold text-sm border-2 transition-all ${
              type === t
                ? "border-pink-500 text-pink-600 bg-pink-50"
                : "border-gray-200 text-gray-500 bg-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Weekly disclaimer */}
      {type === "Weekly" && (
        <div className="flex gap-2 p-3 rounded-xl bg-blue-50 border border-blue-100 mb-4">
          <AlertCircle className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">Weekly rentals are in high demand and may have limited availability. Rent-to-Own offers better long-term pricing.</p>
        </div>
      )}

      {/* Start date */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          <Calendar className="inline h-3.5 w-3.5 mr-1" />Start Date <span className="text-pink-500">*</span>
        </label>
        <input
          type="date"
          min={format(new Date(), "yyyy-MM-dd")}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all"
        />
        {startDate && endDate && (
          <p className="text-xs text-gray-400 mt-1.5">
            End date: <strong className="text-gray-700">{format(new Date(endDate), "MMM d, yyyy")}</strong>
            {type === "Rent-to-Own" && " (52-week program)"}
          </p>
        )}
      </div>

      {/* Auto-renew toggle (Weekly only) */}
      {type === "Weekly" && (
        <button
          onClick={() => setAutoRenew(!autoRenew)}
          className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 text-left mb-5"
        >
          <div className={`h-5 w-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${autoRenew ? "border-pink-500 bg-pink-500" : "border-gray-300"}`}>
            {autoRenew && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5 text-gray-400" />Auto-Renew</p>
            <p className="text-xs text-gray-400">Automatically renew each week. You can cancel anytime.</p>
          </div>
        </button>
      )}

      {!autoRenew && type === "Weekly" && (
        <div className="flex gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100 mb-4">
          <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            <strong>Auto-renew is off.</strong> Your rental will expire on the end date. To extend, log in and manually renew your booking before it expires.
          </p>
        </div>
      )}

      {/* Vehicle list */}
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
        {rtoFiltered.length} vehicle{rtoFiltered.length !== 1 ? "s" : ""} available
      </p>
      <div className="space-y-3">
        {rtoFiltered.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-2xl border border-gray-100">
            <Car className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No {type === "Rent-to-Own" ? "Rent-to-Own eligible" : ""} vehicles available right now.</p>
          </div>
        ) : (
          rtoFiltered.map((v) => (
            <button
              key={v.id}
              disabled={!startDate}
              onClick={() => handleSelect(v)}
              className="w-full flex items-center gap-3 p-3 bg-white rounded-2xl border border-gray-100 shadow-sm text-left hover:border-pink-300 hover:shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {v.image_url ? (
                <img src={v.image_url} alt="" className="h-16 w-24 rounded-xl object-cover flex-shrink-0" />
              ) : (
                <div className="h-16 w-24 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Car className="h-7 w-7 text-gray-300" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm">{v.year} {v.make} {v.model}</p>
                <p className="text-xs text-gray-400 mt-0.5">{v.current_city} · {v.color}</p>
                <p className="text-sm font-bold text-pink-600 mt-1">${v.weekly_rate}<span className="text-xs font-normal text-gray-400">/wk</span></p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0" />
            </button>
          ))
        )}
      </div>

      {!startDate && rtoFiltered.length > 0 && (
        <p className="text-center text-xs text-gray-400 mt-4">Pick a start date above to select a vehicle</p>
      )}
    </div>
  );
}