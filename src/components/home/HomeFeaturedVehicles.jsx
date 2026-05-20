import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Car, ArrowRight } from "lucide-react";

export default function HomeFeaturedVehicles() {
  const { data: vehicles = [] } = useQuery({
    queryKey: ["home-featured-vehicles"],
    queryFn: () => base44.entities.Vehicle.filter({ status: "Available" }, "-created_date", 6),
  });

  if (vehicles.length === 0) {
    return (
      <div className="text-center py-6">
        <div className="h-12 w-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
          <Car className="h-6 w-6 text-gray-300" />
        </div>
        <p className="text-sm font-semibold text-gray-400">Approved vehicles will appear here soon.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>
          Featured Weekly Rentals
        </h3>
        <Link to="/book-now" className="text-xs font-bold text-pink-600 flex items-center gap-1 hover:underline">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {vehicles.slice(0, 6).map((v) => (
          <Link to="/book-now" key={v.id}
            className="rounded-2xl border border-gray-100 bg-white overflow-hidden hover:shadow-md transition-shadow">
            {v.image_url ? (
              <img src={v.image_url} alt={`${v.make} ${v.model}`} className="w-full h-28 object-cover" />
            ) : (
              <div className="w-full h-28 bg-gray-100 flex items-center justify-center">
                <Car className="h-8 w-8 text-gray-300" />
              </div>
            )}
            <div className="p-3">
              <p className="text-xs font-bold text-gray-900 truncate">{v.year} {v.make} {v.model}</p>
              {v.city && <p className="text-[10px] text-gray-400">{v.city}{v.state ? `, ${v.state}` : ""}</p>}
              {v.weekly_rate && (
                <p className="text-sm font-black text-pink-600 mt-1" style={{ fontFamily: "var(--font-syne)" }}>
                  ${v.weekly_rate}<span className="text-[10px] font-normal text-gray-400">/wk</span>
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}