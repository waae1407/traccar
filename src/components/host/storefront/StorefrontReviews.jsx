import React from "react";
import { Star } from "lucide-react";

function StarRow({ rating }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={`h-4 w-4 ${i <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200"}`} />
      ))}
    </div>
  );
}

export default function StorefrontReviews({ reviews, brand }) {
  if (!reviews || reviews.length === 0) return null;

  const published = reviews.filter(r => r.status === "published");
  if (published.length === 0) return null;

  const avgRating = published.reduce((s, r) => s + r.rating, 0) / published.length;

  return (
    <section className="py-16 px-5 max-w-5xl mx-auto">
      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-2 mb-2">
          <StarRow rating={Math.round(avgRating)} />
          <span className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>{avgRating.toFixed(1)}</span>
        </div>
        <h2 className="text-3xl font-black text-gray-900 mb-1" style={{ fontFamily: "var(--font-syne)" }}>What Renters Say</h2>
        <p className="text-gray-400">{published.length} verified review{published.length !== 1 ? "s" : ""}</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {published.slice(0, 6).map(r => (
          <div key={r.id} className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${brand?.brand_color || "#e91e8c"}, ${brand?.secondary_color || "#7c3aed"})` }}>
                {r.reviewer_name?.charAt(0) || "?"}
              </div>
              <StarRow rating={r.rating} />
            </div>
            <p className="text-sm font-bold text-gray-900 mb-1">{r.reviewer_name}</p>
            {r.vehicle_name && <p className="text-xs text-gray-400 mb-2">{r.vehicle_name}</p>}
            <p className="text-sm text-gray-600 leading-relaxed">{r.review_text}</p>
            {r.host_response && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-bold text-gray-500 mb-1">Owner's Response:</p>
                <p className="text-xs text-gray-500 italic">{r.host_response}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}