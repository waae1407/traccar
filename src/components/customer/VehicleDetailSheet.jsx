import React, { useState } from "react";
import { X, MapPin, Zap, ChevronRight, Check, Calendar } from "lucide-react";
import PublicTrustBadges from "@/components/trust/PublicTrustBadges";
import PublicRating from "@/components/trust/PublicRating";
import VehicleDetailCalendar from "@/components/customer/VehicleDetailCalendar";
import { latestSnapshotFor, publicRating, publicVehicleLabels } from "@/lib/reputation/publicTrust";

export default function VehicleDetailSheet({ vehicle, onClose, onBook, user, reviews = [], signalSnapshots = [], bookingDisabled = false, disabledReason = "" }) {
  const [selectedDates, setSelectedDates] = useState({ pickup: null, return: null });

  if (!vehicle) return null;

  const weeklyRate = vehicle.weekly_rate || 0;
  const deposit = Math.round(weeklyRate * 0.5);
  const snapshot = latestSnapshotFor(signalSnapshots, "vehicle", vehicle.id);
  const labels = publicVehicleLabels(snapshot);
  const rating = publicRating(reviews.filter((r) => r.vehicle_id === vehicle.id));

  return (
    <div className="fixed inset-0 z-[60] flex items-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-auto bg-white rounded-t-3xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Image */}
        <div className="relative h-56 bg-gradient-to-br from-gray-100 to-gray-200">
          {vehicle.image_url ? (
            <img src={vehicle.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-7xl">🚗</div>
          )}
          <button onClick={onClose} className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/90 flex items-center justify-center shadow-md">
            <X className="h-4 w-4 text-gray-700" />
          </button>
          {vehicle.rent_to_own_eligible && (
            <div className="absolute bottom-4 left-4 bg-pink-600 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
              <Zap className="h-3 w-3" /> Rent-to-Own Available
            </div>
          )}
        </div>

        <div className="p-5">
          {/* Title */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{vehicle.year} {vehicle.make} {vehicle.model}</h2>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-sm text-gray-500">{vehicle.current_city || "Available"}</span>
                </div>
                <PublicRating rating={rating.rating} count={rating.count} />
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-pink-600">${vehicle.weekly_rate}</p>
              <p className="text-xs text-gray-400">per week</p>
            </div>
          </div>

          <div className="mt-3"><PublicTrustBadges labels={labels} /></div>

          {/* Specs */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            {[
              { label: "Color", value: vehicle.color || "—" },
              { label: "Mileage", value: vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : "—" },
              { label: "Availability", value: "Available" },
            ].map(({ label, value }) => (
              <div key={label} className="text-center p-3 bg-gray-50 rounded-xl">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                <p className="text-sm font-bold text-gray-800 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Pricing breakdown */}
          <div className="mt-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
            <p className="font-semibold text-gray-800 text-sm mb-2">Pricing Summary</p>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Weekly rate</span>
                <span className="font-semibold text-gray-800">${weeklyRate}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-gray-500">Security deposit</span>
                <div className="flex items-center gap-2">
                  <span className="line-through text-gray-300 font-medium">${deposit}</span>
                  <span className="bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full rotate-[-2deg] inline-block shadow-sm">$0 — No Deposit!</span>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Delivery fee</span>
                <span className="font-semibold text-gray-800">Free</span>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="mt-4">
            <p className="font-semibold text-gray-800 text-sm mb-2">Includes</p>
            <div className="grid grid-cols-2 gap-1.5">
              {["Insurance ready", "Full tank pickup", "24/7 support", "Digital contract"].map((f) => (
                <div key={f} className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <Check className="h-2.5 w-2.5 text-green-600" />
                  </div>
                  <span className="text-xs text-gray-600">{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Availability Calendar — shown by default */}
          <div className="mt-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-4 w-4 text-pink-600" />
              <p className="font-semibold text-gray-800 text-sm">Availability Calendar</p>
              <span className="text-xs text-gray-400 ml-auto">Select pickup → return dates</span>
            </div>
            <VehicleDetailCalendar
              vehicle={vehicle}
              onDatesSelected={(pickup, returnDate) => setSelectedDates({ pickup, return: returnDate })}
            />
          </div>

          {/* CTA */}
          {bookingDisabled && disabledReason && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              {disabledReason}
            </div>
          )}
          <button
            onClick={() => {
              if (bookingDisabled) return;
              const vehicleWithDates = selectedDates.pickup
                ? { ...vehicle, selected_pickup_date: selectedDates.pickup, selected_return_date: selectedDates.return }
                : vehicle;
              onBook(vehicleWithDates);
            }}
            disabled={bookingDisabled}
            className="w-full mt-3 h-13 py-3.5 rounded-xl font-bold text-sm text-white flex items-center justify-between px-5 transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
          >
            <span>
              {bookingDisabled
                ? "Bookings Disabled"
                : selectedDates.pickup && selectedDates.return
                ? `Book ${selectedDates.pickup} → ${selectedDates.return}`
                : "Book This Vehicle"}
            </span>
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}