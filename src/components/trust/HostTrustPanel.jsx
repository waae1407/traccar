import React from "react";
import { Star, Users } from "lucide-react";
import PublicRating from "./PublicRating";
import PublicTrustBadges from "./PublicTrustBadges";

export default function HostTrustPanel({ labels = [], rating, reviewCount, completedTrips }) {
  if (!labels.length && !reviewCount && !completedTrips) return null;

  return (
    <section className="px-5 py-4">
      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-black text-gray-900">Host trust signals</p>
            <p className="text-xs text-gray-400 mt-0.5">Verified public evidence only — no internal scores shown.</p>
          </div>
          <PublicRating rating={rating} count={reviewCount} />
        </div>
        <PublicTrustBadges labels={labels} />
        {completedTrips > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-gray-600">
            <Users className="h-3.5 w-3.5 text-gray-400" /> {completedTrips} completed trip{completedTrips !== 1 ? "s" : ""}
          </div>
        )}
        {reviewCount > 0 && !rating && (
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-gray-600">
            <Star className="h-3.5 w-3.5 text-amber-400" /> {reviewCount} approved review{reviewCount !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </section>
  );
}