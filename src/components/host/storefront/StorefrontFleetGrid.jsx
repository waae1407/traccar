import React from "react";
import { Car, MapPin, Tag } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function StorefrontFleetGrid({ vehicles, brand, hostId }) {
  const navigate = useNavigate();

  const handleBook = (vehicleId) => {
    navigate(`/book-now?host_id=${hostId}&vehicle_id=${vehicleId}`);
  };

  if (!vehicles || vehicles.length === 0) return null;

  return (
    <section className="py-16 px-5 max-w-5xl mx-auto">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-black text-gray-900 mb-2" style={{ fontFamily: "var(--font-syne)" }}>Available Vehicles</h2>
        <p className="text-gray-400">All vehicles verified and ready to drive</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {vehicles.map(v => (
          <div key={v.id} className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden hover:shadow-lg transition-all group">
            <div className="relative h-48 overflow-hidden">
              {v.image_url
                ? <img src={v.image_url} alt={`${v.make} ${v.model}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                : <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center"><Car className="h-16 w-16 text-gray-300" /></div>}
              {v.rent_to_own_eligible && (
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500 text-white shadow-sm">RTO Available</div>
              )}
            </div>

            <div className="p-4">
              <h3 className="font-black text-gray-900 text-base" style={{ fontFamily: "var(--font-syne)" }}>
                {v.year} {v.make} {v.model}
              </h3>
              {v.city && (
                <p className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                  <MapPin className="h-3 w-3" />{v.city}, {v.state}
                </p>
              )}

              <div className="flex flex-wrap gap-1.5 mt-3 mb-4">
                {v.allow_daily_booking && v.daily_rate && (
                  <span className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-700">
                    ${v.daily_rate}/day
                  </span>
                )}
                {v.weekly_rate && (
                  <span className="px-2 py-1 rounded-lg text-xs font-semibold text-white" style={{ background: `linear-gradient(135deg, ${brand?.brand_color || "#e91e8c"}, ${brand?.secondary_color || "#7c3aed"})` }}>
                    ${v.weekly_rate}/wk
                  </span>
                )}
                {v.allow_monthly_booking && v.monthly_rate && (
                  <span className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-700">
                    ${v.monthly_rate}/mo
                  </span>
                )}
              </div>

              {v.minimum_rental_days && (
                <p className="text-[10px] text-gray-400 mb-3 flex items-center gap-1">
                  <Tag className="h-3 w-3" />Min {v.minimum_rental_days} day{v.minimum_rental_days > 1 ? "s" : ""}
                </p>
              )}

              <button onClick={() => handleBook(v.id)}
                className="w-full py-2.5 rounded-2xl text-sm font-bold text-white transition-all active:scale-[0.98] shadow-sm"
                style={{ background: `linear-gradient(135deg, ${brand?.brand_color || "#e91e8c"}, ${brand?.secondary_color || "#7c3aed"})` }}>
                Book This Car
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}