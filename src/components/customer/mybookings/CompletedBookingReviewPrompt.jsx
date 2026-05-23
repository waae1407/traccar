import React, { useState } from "react";
import { Star, MessageSquareText } from "lucide-react";
import { base44 } from "@/api/base44Client";

const RATING_FIELDS = [
  ["overall_rating", "Overall"],
  ["host_experience_rating", "Host"],
  ["vehicle_condition_rating", "Vehicle"],
  ["cleanliness_rating", "Cleanliness"],
  ["communication_rating", "Communication"],
  ["pickup_dropoff_rating", "Pickup/dropoff"],
];

function RatingInput({ label, value, onChange }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-gray-600 mb-1">{label}</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)} className="p-0.5">
            <Star className={`h-5 w-5 ${n <= value ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CompletedBookingReviewPrompt({ booking, user, existingReview, onSubmitted }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    overall_rating: 5,
    host_experience_rating: 5,
    vehicle_condition_rating: 5,
    cleanliness_rating: 5,
    communication_rating: 5,
    pickup_dropoff_rating: 5,
    would_rent_again: true,
    review_text: "",
  });

  if (booking.booking_status !== "completed") return null;

  if (existingReview) {
    return (
      <div className="mb-3 px-3 py-2 rounded-xl bg-green-50 border border-green-100 text-[11px] text-green-700 font-semibold">
        Review submitted — pending internal moderation.
      </div>
    );
  }

  const submitReview = async () => {
    setSaving(true);
    await base44.functions.invoke("submitCompletedBookingReview", {
      booking_id: booking.id,
      ...form,
    });
    setSaving(false);
    setOpen(false);
    onSubmitted?.();
  };

  return (
    <div className="mb-3 rounded-2xl border border-pink-100 bg-pink-50/70 p-3">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-3 text-left">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-pink-500" />
          <div>
            <p className="text-sm font-black text-gray-900">Rate this completed rental</p>
            <p className="text-[11px] text-gray-500">Internal review only — not public yet.</p>
          </div>
        </div>
        <span className="text-xs font-bold text-pink-600">{open ? "Close" : "Review"}</span>
      </button>

      {open && (
        <div className="mt-3 pt-3 border-t border-pink-100 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {RATING_FIELDS.map(([key, label]) => (
              <RatingInput key={key} label={label} value={form[key]} onChange={(value) => setForm({ ...form, [key]: value })} />
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-gray-700">
            <input type="checkbox" checked={form.would_rent_again} onChange={(e) => setForm({ ...form, would_rent_again: e.target.checked })} />
            I would rent again
          </label>
          <textarea
            value={form.review_text}
            onChange={(e) => setForm({ ...form, review_text: e.target.value })}
            placeholder="Share what went well or what could improve..."
            className="w-full min-h-24 rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-pink-300"
          />
          <button
            onClick={submitReview}
            disabled={saving || !user?.email}
            className="w-full py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
          >
            {saving ? "Submitting..." : "Submit Internal Review"}
          </button>
        </div>
      )}
    </div>
  );
}