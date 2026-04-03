import React, { useState } from "react";
import { Car, RefreshCw, AlertCircle, ChevronRight, Check, Zap, MapPin } from "lucide-react";
import { addWeeks, format } from "date-fns";

const BOOKING_TYPES = ["Weekly", "Rent-to-Own"];

function calcEndDate(startDate, type) {
  if (!startDate) return null;
  const d = new Date(startDate);
  if (type === "Weekly") return format(addWeeks(d, 1), "yyyy-MM-dd");
  if (type === "Rent-to-Own") return format(addWeeks(d, 52), "yyyy-MM-dd");
  return null;
}

const inputCls = "w-full h-11 px-4 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all";

export default function StepVehicle({ vehicles = [], vehicleId, bookingType: initialType, onSelect }) {
  const validInitialType = BOOKING_TYPES.includes(initialType) ? initialType : "Weekly";
  const [type, setType] = useState(validInitialType);
  const [startDate, setStartDate] = useState("");
  const [autoRenew, setAutoRenew] = useState(true);
  const [selectedId, setSelectedId] = useState(vehicleId || null);

  const available = vehicles.filter((v) => v.status === "Available");
  const filtered = type === "Rent-to-Own" ? available.filter((v) => v.rent_to_own_eligible) : available;
  const endDate = calcEndDate(startDate, type);
  const selectedVehicle = vehicles.find((v) => v.id === selectedId);

  const handleConfirm = () => {
    if (!startDate || !selectedVehicle) return;
    onSelect(selectedVehicle, type, { startDate, endDate, autoRenew });
  };

  return (
    <div className="px-4 py-5">
      <h2 className="font-bold text-gray-900 text-xl mb-1">Choose Your Rental</h2>
      <p className="text-gray-400 text-sm mb-5">Select a rental type, pick a start date, then confirm your vehicle.</p>

      {/* Rental type selector */}
      <div className="flex gap-2 mb-5">
        {BOOKING_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`flex-1 py-3 rounded-xl font-bold text-sm border-2 transition-all ${
              type === t ? "border-pink-500 text-pink-600 bg-pink-50" : "border-gray-200 text-gray-500 bg-white"
            }`}
          >
            {t === "Rent-to-Own" && <Zap className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />}
            {t}
          </button>
        ))}
      </div>

      {/* Tips */}
      {type === "Weekly" && (
        <div className="flex gap-2 p-3 rounded-xl bg-blue-50 border border-blue-100 mb-4">
          <AlertCircle className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">Weekly rentals are in high demand. Rent-to-Own offers better long-term pricing.</p>
        </div>
      )}
      {type === "Rent-to-Own" && (
        <div className="flex gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100 mb-4">
          <Zap className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">Own your vehicle after 52 weekly payments. No credit check required.</p>
        </div>
      )}

      {/* Start date */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          Start Date <span className="text-pink-500">*</span>
        </label>
        <input
          type="date"
          min={format(new Date(), "yyyy-MM-dd")}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className={inputCls}
        />
        {startDate && endDate && (
          <p className="text-xs text-gray-400 mt-1.5">
            End date: <strong className="text-gray-700">{format(new Date(endDate), "MMM d, yyyy")}</strong>
            {type === "Rent-to-Own" && <span className="text-amber-600"> · 52-week program</span>}
          </p>
        )}
      </div>

      {/* Auto-renew toggle (Weekly only) */}
      {type === "Weekly" && (
        <>
          <button
            onClick={() => setAutoRenew(!autoRenew)}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 text-left mb-2"
          >
            <div className={`h-5 w-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${autoRenew ? "border-pink-500 bg-pink-500" : "border-gray-300"}`}>
              {autoRenew && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5 text-gray-400" /> Auto-Renew</p>
              <p className="text-xs text-gray-400">Automatically renew each week. You can cancel anytime.</p>
            </div>
          </button>
          {!autoRenew && (
            <div className="flex gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100 mb-4">
              <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700"><strong>Auto-renew is off.</strong> Your rental will expire on the end date. Log in and manually renew before it expires.</p>
            </div>
          )}
        </>
      )}

      {/* Vehicle list */}
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 mt-4">
        {filtered.length} vehicle{filtered.length !== 1 ? "s" : ""} available
      </p>
      <div className="space-y-3 mb-5">
        {filtered.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-2xl border border-gray-100">
            <Car className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No {type === "Rent-to-Own" ? "Rent-to-Own eligible" : ""} vehicles available right now.</p>
          </div>
        ) : (
          filtered.map((v) => {
            const isSelected = selectedId === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setSelectedId(v.id)}
                className={`w-full text-left rounded-2xl border-2 overflow-hidden transition-all active:scale-[0.98] ${
                  isSelected ? "border-pink-500 shadow-md" : "border-gray-100 bg-white shadow-sm hover:border-pink-200"
                }`}
                style={isSelected ? { background: "linear-gradient(135deg, #fff5f8 0%, #fdf4ff 100%)" } : {}}
              >
                {v.image_url ? (
                  <img src={v.image_url} alt={`${v.year} ${v.make} ${v.model}`} className="w-full h-36 object-cover" />
                ) : (
                  <div className="w-full h-36 bg-gray-100 flex items-center justify-center">
                    <Car className="h-10 w-10 text-gray-300" />
                  </div>
                )}
                <div className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-900 text-sm">{v.year} {v.make} {v.model}</p>
                      {v.rent_to_own_eligible && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 border border-amber-200">RTO</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-1 text-xs text-gray-400"><MapPin className="h-3 w-3" />{v.current_city}</span>
                      <span className="text-gray-200">·</span>
                      <span className="text-xs text-gray-400">{v.color}</span>
                    </div>
                    <p className="text-base font-bold text-pink-600 mt-1">${v.weekly_rate}<span className="text-xs font-normal text-gray-400">/wk</span></p>
                  </div>
                  <div className={`h-7 w-7 rounded-full flex-shrink-0 flex items-center justify-center transition-all border-2 ${isSelected ? "border-pink-500 bg-pink-500" : "border-gray-200"}`}>
                    {isSelected && <Check className="h-4 w-4 text-white" />}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Confirm button */}
      <button
        disabled={!startDate || !selectedVehicle}
        onClick={handleConfirm}
        className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
        style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
      >
        Confirm & Continue
        <ChevronRight className="h-4 w-4" />
      </button>
      {(!startDate || !selectedVehicle) && (
        <p className="text-center text-xs text-gray-400 mt-2">
          {!selectedVehicle ? "Select a vehicle" : "Pick a start date"} to continue
        </p>
      )}
    </div>
  );
}