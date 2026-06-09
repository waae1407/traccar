import React, { useState } from "react";
import { MapPin, Clock, Copy, Check, Navigation } from "lucide-react";

export default function PickupAddressCard({ vehicle, booking }) {
  const [copied, setCopied] = useState(false);

  const address = vehicle?.pickup_address;
  const hours = vehicle?.pickup_hours;
  const approved = !booking || ["approved", "active", "confirmed"].includes(booking.booking_status);

  if (!approved) {
    const area = [vehicle?.city || booking?.city, vehicle?.state].filter(Boolean).join(", ") || booking?.city || "Pickup area";
    return (
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
            <MapPin className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-blue-900">Pickup details unlock after booking approval.</p>
            <p className="mt-1 text-xs font-semibold text-blue-700">General pickup area: {area}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!address) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDirections = () => {
    const encoded = encodeURIComponent(address);
    // Opens in Apple Maps on iOS, Google Maps on Android/desktop
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const url = isIOS
      ? `maps://maps.apple.com/?q=${encoded}`
      : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
    window.open(url, "_blank");
  };

  return (
    <div className="rounded-2xl overflow-hidden border-2 border-green-300"
      style={{ background: "linear-gradient(135deg, #f0fdf4, #dcfce7)" }}>
      
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-green-200"
        style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}>
        <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          <MapPin className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-white font-bold text-sm">📍 Pickup Address Unlocked</p>
          <p className="text-green-100 text-[10px]">Payment confirmed — your vehicle is ready</p>
        </div>
      </div>

      {/* Address */}
      <div className="px-4 py-3">
        <p className="text-gray-900 font-bold text-base leading-snug">{address}</p>

        {hours && (
          <div className="flex items-center gap-1.5 mt-2">
            <Clock className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800 font-semibold">{hours}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleDirections}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.97]"
            style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
          >
            <Navigation className="h-4 w-4" />
            Get Directions
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold border-2 border-green-300 text-green-700 bg-white transition-all active:scale-[0.97]"
          >
            {copied ? <><Check className="h-4 w-4 text-green-600" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy</>}
          </button>
        </div>
      </div>
    </div>
  );
}