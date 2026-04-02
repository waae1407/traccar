import React, { useState } from "react";
import { format } from "date-fns";
import { Car, MapPin, Calendar, DollarSign } from "lucide-react";

export default function StepTerms({ booking, vehicle, saveAndAdvance }) {
  const [consents, setConsents] = useState({
    consent_esign: booking?.consent_esign || false,
    consent_verification: booking?.consent_verification || false,
    consent_terms: booking?.consent_terms || false,
    info_accurate: false,
  });

  const toggle = (k) => setConsents((p) => ({ ...p, [k]: !p[k] }));
  const allChecked = Object.values(consents).every(Boolean);

  return (
    <div>
      <h2 className="font-bold text-gray-900 text-xl mb-1">Review & Agree</h2>
      <p className="text-gray-400 text-sm mb-5">Review your booking summary and confirm your consents.</p>

      {/* Booking summary */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5">
        <p className="font-bold text-gray-900 mb-3">Booking Summary</p>
        <div className="space-y-2.5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-pink-50 flex items-center justify-center"><Car className="h-4 w-4 text-pink-600" /></div>
            <div>
              <p className="text-xs text-gray-400">Vehicle</p>
              <p className="font-semibold text-gray-900 text-sm">{booking?.vehicle_name || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-blue-50 flex items-center justify-center"><MapPin className="h-4 w-4 text-blue-600" /></div>
            <div>
              <p className="text-xs text-gray-400">City</p>
              <p className="font-semibold text-gray-900 text-sm">{booking?.city || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-green-50 flex items-center justify-center"><Calendar className="h-4 w-4 text-green-600" /></div>
            <div>
              <p className="text-xs text-gray-400">Type</p>
              <p className="font-semibold text-gray-900 text-sm">{booking?.booking_type}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-purple-50 flex items-center justify-center"><DollarSign className="h-4 w-4 text-purple-600" /></div>
            <div>
              <p className="text-xs text-gray-400">Due at Checkout</p>
              <p className="font-bold text-gray-900">${(booking?.total_due_now || 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-gray-100 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Weekly rate</span>
            <span className="font-semibold">${booking?.weekly_rate || 0}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Security deposit</span>
            <span className="font-semibold">${booking?.deposit_amount || 0}</span>
          </div>
          <div className="flex justify-between text-sm font-bold border-t border-gray-100 pt-1.5 mt-1">
            <span>Total Due Now</span>
            <span className="text-pink-600">${booking?.total_due_now || 0}</span>
          </div>
        </div>
      </div>

      {/* Consents */}
      <div className="space-y-3 mb-5">
        {[
          { key: "info_accurate", label: "I confirm that all information I've provided is accurate and truthful." },
          { key: "consent_verification", label: "I consent to identity verification for this rental." },
          { key: "consent_esign", label: "I consent to electronic signature for my rental contract." },
          { key: "consent_terms", label: "I agree to uRide's Rental Terms & Conditions and Privacy Policy." },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => toggle(key)}
            className="w-full flex items-start gap-3 p-3 rounded-xl border border-gray-100 bg-white text-left hover:bg-gray-50 transition-colors">
            <div className={`h-5 w-5 rounded-md border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${consents[key] ? "border-pink-500 bg-pink-500" : "border-gray-300"}`}>
              {consents[key] && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </div>
            <p className="text-sm text-gray-700">{label}</p>
          </button>
        ))}
      </div>

      <button
        disabled={!allChecked}
        onClick={() => saveAndAdvance({ ...consents, booking_status: "pending_contract" }, "contract")}
        className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-40"
        style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
        Agree & Continue
      </button>
    </div>
  );
}