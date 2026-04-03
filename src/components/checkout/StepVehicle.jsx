import React, { useState } from "react";
import { Car, RefreshCw, AlertCircle, ChevronRight, Check, Zap, MapPin, Star } from "lucide-react";
import { addWeeks, format } from "date-fns";

const BOOKING_TYPES = ["Weekly", "Rent-to-Own"];

function calcEndDate(startDate, type) {
  if (!startDate) return null;
  const d = new Date(startDate);
  if (type === "Weekly") return format(addWeeks(d, 1), "yyyy-MM-dd");
  if (type === "Rent-to-Own") return format(addWeeks(d, 52), "yyyy-MM-dd");
  return null;
}

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
    <div className="min-h-screen" style={{ background: "linear-gradient(160deg, #0f0818 0%, #130920 50%, #0d0d1a 100%)" }}>
      {/* Hero header */}
      <div className="relative px-4 pt-6 pb-8">
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 h-40 w-40 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(338 90% 56% / 0.2) 0%, transparent 70%)" }} />

        <p className="text-pink-400/80 text-xs font-semibold uppercase tracking-widest mb-1">Step 1</p>
        <h2 className="text-white text-2xl font-bold leading-tight mb-1" style={{ fontFamily: "var(--font-syne)" }}>
          Choose Your Ride
        </h2>
        <p className="text-white/40 text-sm">Pick a type, set a date, select your vehicle.</p>
      </div>

      <div className="px-4 pb-10 space-y-5">
        {/* Rental type pills */}
        <div className="flex gap-3">
          {BOOKING_TYPES.map((t) => {
            const isActive = type === t;
            const isRTO = t === "Rent-to-Own";
            return (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 py-3.5 rounded-2xl font-bold text-sm transition-all relative overflow-hidden ${
                  isActive ? "text-white shadow-lg" : "text-white/50 border border-white/10"
                }`}
                style={isActive ? { background: isRTO ? "linear-gradient(135deg, hsl(38 95% 54%), hsl(338 90% 56%))" : "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : { background: "hsl(222 24% 11% / 0.8)" }}
              >
                {isRTO && <Zap className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />}
                {t}
              </button>
            );
          })}
        </div>

        {/* Weekly tip */}
        {type === "Weekly" && (
          <div className="flex gap-2.5 p-3.5 rounded-2xl border border-blue-500/20 bg-blue-500/10">
            <AlertCircle className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-300">Weekly rentals are in high demand. Rent-to-Own offers better long-term pricing.</p>
          </div>
        )}
        {type === "Rent-to-Own" && (
          <div className="flex gap-2.5 p-3.5 rounded-2xl border border-amber-500/20 bg-amber-500/10">
            <Zap className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">Own your vehicle after 52 weekly payments. No credit check required.</p>
          </div>
        )}

        {/* Start date */}
        <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: "hsl(222 24% 11% / 0.9)" }}>
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Start Date <span className="text-pink-500">*</span></p>
          </div>
          <input
            type="date"
            min={format(new Date(), "yyyy-MM-dd")}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-4 pb-3.5 text-sm font-semibold text-white bg-transparent outline-none"
            style={{ colorScheme: "dark" }}
          />
          {startDate && endDate && (
            <div className="px-4 pb-3 border-t border-white/5 pt-2">
              <p className="text-xs text-white/40">
                End: <span className="text-white/70 font-semibold">{format(new Date(endDate), "MMM d, yyyy")}</span>
                {type === "Rent-to-Own" && <span className="ml-1 text-amber-400"> · 52-week program</span>}
              </p>
            </div>
          )}
        </div>

        {/* Auto-renew toggle (Weekly only) */}
        {type === "Weekly" && (
          <>
            <button
              onClick={() => setAutoRenew(!autoRenew)}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all"
              style={{
                background: autoRenew ? "hsl(338 90% 56% / 0.1)" : "hsl(222 24% 11% / 0.9)",
                borderColor: autoRenew ? "hsl(338 90% 56% / 0.4)" : "hsl(222 18% 18%)"
              }}
            >
              <div className={`h-5 w-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${autoRenew ? "border-pink-500 bg-pink-500" : "border-white/20"}`}>
                {autoRenew && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5 text-pink-400" /> Auto-Renew
                </p>
                <p className="text-xs text-white/40">Renews every week automatically. Cancel anytime.</p>
              </div>
            </button>
            {!autoRenew && (
              <div className="flex gap-2.5 p-3.5 rounded-2xl border border-amber-500/20 bg-amber-500/10">
                <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300"><strong>Auto-renew off.</strong> Rental expires on end date. Log in to renew manually before expiry.</p>
              </div>
            )}
          </>
        )}

        {/* Vehicle list */}
        <div>
          <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-3">
            {filtered.length} vehicle{filtered.length !== 1 ? "s" : ""} available
          </p>
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border border-white/10" style={{ background: "hsl(222 24% 11% / 0.8)" }}>
                <Car className="h-8 w-8 text-white/20 mx-auto mb-2" />
                <p className="text-white/30 text-sm">No {type === "Rent-to-Own" ? "Rent-to-Own eligible" : ""} vehicles available.</p>
              </div>
            ) : (
              filtered.map((v) => {
                const isSelected = selectedId === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedId(v.id)}
                    className="w-full text-left rounded-2xl border-2 overflow-hidden transition-all active:scale-[0.98]"
                    style={{
                      borderColor: isSelected ? "hsl(338 90% 56%)" : "hsl(222 18% 18%)",
                      background: isSelected ? "hsl(338 90% 56% / 0.08)" : "hsl(222 24% 11% / 0.9)",
                      boxShadow: isSelected ? "0 0 20px hsl(338 90% 56% / 0.2)" : "none"
                    }}
                  >
                    {/* Vehicle image */}
                    {v.image_url ? (
                      <img src={v.image_url} alt={`${v.year} ${v.make} ${v.model}`} className="w-full h-36 object-cover" />
                    ) : (
                      <div className="w-full h-36 flex items-center justify-center" style={{ background: "hsl(222 28% 8%)" }}>
                        <span className="text-5xl">🚗</span>
                      </div>
                    )}

                    {/* Info row */}
                    <div className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-white text-sm">{v.year} {v.make} {v.model}</p>
                          {v.rent_to_own_eligible && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">RTO</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-1 text-xs text-white/40">
                            <MapPin className="h-3 w-3" />{v.current_city}
                          </span>
                          <span className="text-white/20">·</span>
                          <span className="text-xs text-white/40">{v.color}</span>
                        </div>
                        <p className="text-base font-bold mt-1" style={{ color: "hsl(338 90% 65%)" }}>
                          ${v.weekly_rate}<span className="text-xs font-normal text-white/30">/wk</span>
                        </p>
                      </div>
                      <div className={`h-7 w-7 rounded-full flex-shrink-0 flex items-center justify-center transition-all border-2 ${isSelected ? "border-pink-500 bg-pink-500" : "border-white/20"}`}>
                        {isSelected && <Check className="h-4 w-4 text-white" />}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Confirm button */}
        <button
          disabled={!startDate || !selectedVehicle}
          onClick={handleConfirm}
          className="w-full py-4 rounded-2xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
        >
          Confirm & Continue
          <ChevronRight className="h-4 w-4" />
        </button>
        {(!startDate || !selectedVehicle) && (
          <p className="text-center text-xs text-white/30 -mt-2">
            {!selectedVehicle ? "Select a vehicle" : "Pick a start date"} to continue
          </p>
        )}
      </div>
    </div>
  );
}