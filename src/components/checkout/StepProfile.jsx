import React, { useState } from "react";
import { User, Phone, MapPin, Heart, Sparkles } from "lucide-react";

const inputCls = "w-full h-11 px-4 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all";
const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5";

export default function StepProfile({ booking, saveAndAdvance }) {
  const [form, setForm] = useState({
    customer_full_name: booking?.customer_full_name || "",
    customer_phone: booking?.customer_phone || "",
    customer_dob: booking?.customer_dob || "",
    customer_address: booking?.customer_address || "",
    emergency_contact_name: booking?.emergency_contact_name || "",
    emergency_contact_phone: booking?.emergency_contact_phone || "",
    employer: booking?.employer || "",
    income_range: booking?.income_range || "",
  });

  const isRTO = booking?.booking_type === "Rent-to-Own";
  const isPreFilled = !!(booking?.customer_full_name && booking?.customer_phone);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const isValid = form.customer_full_name && form.customer_phone && form.customer_address;

  // Determine next step — skip verification if already verified
  const nextStep = booking?.verification_status === "verified" ? "terms" : "verification";

  return (
    <div>
      <h2 className="font-bold text-gray-900 text-xl mb-1">Your Profile</h2>
      <p className="text-gray-400 text-sm mb-3">We need your info to prepare your contract and verify your identity.</p>

      {isPreFilled && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-100 mb-4">
          <Sparkles className="h-4 w-4 text-green-500 flex-shrink-0" />
          <p className="text-xs text-green-700 font-medium">Pre-filled from your previous booking — review and update if needed.</p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className={labelCls}>Legal Full Name *</label>
          <input className={inputCls} value={form.customer_full_name} onChange={(e) => set("customer_full_name", e.target.value)} placeholder="As it appears on your ID" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Phone *</label>
            <input className={inputCls} value={form.customer_phone} onChange={(e) => set("customer_phone", e.target.value)} placeholder="(555) 000-0000" type="tel" />
          </div>
          <div>
            <label className={labelCls}>Date of Birth *</label>
            <input className={inputCls} value={form.customer_dob} onChange={(e) => set("customer_dob", e.target.value)} type="date" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Home Address *</label>
          <input className={inputCls} value={form.customer_address} onChange={(e) => set("customer_address", e.target.value)} placeholder="123 Main St, City, State ZIP" />
        </div>

        <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <Heart className="h-4 w-4 text-red-400" />
            <p className="font-semibold text-gray-700 text-sm">Emergency Contact</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Name</label>
              <input className={inputCls} value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} placeholder="Full name" />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input className={inputCls} value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} placeholder="Phone" type="tel" />
            </div>
          </div>
        </div>

        {isRTO && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100">
            <p className="font-semibold text-amber-800 text-sm mb-3">Rent-to-Own: Employment Info</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Employer</label>
                <input className={inputCls} value={form.employer} onChange={(e) => set("employer", e.target.value)} placeholder="Company name" />
              </div>
              <div>
                <label className={labelCls}>Weekly Income</label>
                <select className={inputCls} value={form.income_range} onChange={(e) => set("income_range", e.target.value)}>
                  <option value="">Select range</option>
                  <option>Under $500</option>
                  <option>$500–$1,000</option>
                  <option>$1,000–$2,000</option>
                  <option>$2,000+</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        disabled={!isValid}
        onClick={() => saveAndAdvance(form, nextStep)}
        className="w-full mt-6 py-3.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-40"
        style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
        Save & Continue
      </button>

      {booking?.verification_status === "verified" && (
        <p className="text-center text-xs text-green-600 mt-2 font-medium">✓ ID verification carried over from your previous booking</p>
      )}
    </div>
  );
}