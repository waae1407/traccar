import React, { useState } from "react";
import { MapPin, Bell, CheckCircle } from "lucide-react";

export default function WaitlistEmptyState({ location, onChangeLocation }) {
  const [phone, setPhone] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!phone || phone.length < 10) return;
    setSubmitting(true);
    // Small delay for UX feel — no backend needed for now
    await new Promise((r) => setTimeout(r, 800));
    setSubmitted(true);
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="px-4 py-8 flex flex-col items-center text-center">
        <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <CheckCircle className="h-8 w-8 text-green-500" />
        </div>
        <p className="font-bold text-gray-900 text-lg" style={{ fontFamily: "var(--font-syne)" }}>
          You're on the list!
        </p>
        <p className="text-gray-400 text-sm mt-1">
          We'll text you the moment a vehicle becomes available near {location?.city || "you"}.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      {/* Main empty state card */}
      <div className="rounded-3xl overflow-hidden border border-gray-200 bg-white">
        {/* Header gradient */}
        <div className="px-5 pt-6 pb-5 text-center"
          style={{ background: "linear-gradient(160deg, #fff8fc 0%, #f5f0ff 100%)" }}>
          <div className="text-4xl mb-3">📍</div>
          <p className="font-bold text-gray-900 text-lg leading-snug" style={{ fontFamily: "var(--font-syne)" }}>
            No vehicles near {location?.city || "you"} right now
          </p>
          <p className="text-gray-400 text-sm mt-1">
            Our fleet hasn't reached your area yet — but it's growing.
          </p>
        </div>

        {/* Waitlist form */}
        <div className="px-5 pb-5 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="h-4 w-4 text-pink-500" />
            <p className="text-sm font-bold text-gray-800">Be first when we arrive near you</p>
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="tel"
              inputMode="numeric"
              placeholder="Your phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 outline-none focus:border-pink-300 transition-colors"
            />
            <button
              type="submit"
              disabled={submitting || phone.length < 10}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex-shrink-0"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
            >
              {submitting ? "…" : "Notify me"}
            </button>
          </form>
          <p className="text-[10px] text-gray-400 mt-2">No spam. One text when we launch near you.</p>
        </div>
      </div>

      {/* Change location nudge */}
      <button
        onClick={onChangeLocation}
        className="w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 active:scale-[0.98] transition-transform"
      >
        <MapPin className="h-4 w-4 text-gray-400" />
        Try a different location
      </button>
    </div>
  );
}