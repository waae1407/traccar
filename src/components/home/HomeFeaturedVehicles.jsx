import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Car, ArrowRight, MapPin, Fingerprint, Shield } from "lucide-react";

const TRUST_BADGES = [
  { icon: Fingerprint, label: "Contactless" },
  { icon: MapPin, label: "GPS" },
  { icon: Shield, label: "Verified" },
];

export default function HomeFeaturedVehicles() {
  const { data: vehicles = [] } = useQuery({
    queryKey: ["home-featured-vehicles"],
    queryFn: async () => {
      const [vehicleRows, plans] = await Promise.all([
        base44.entities.Vehicle.filter({ status: "Available" }, "-created_date", 30),
        base44.entities.OperatorPlanConfiguration.list("-updated_date", 500),
      ]);
      const planByHost = plans.reduce((map, plan) => {
        if (!plan.host_id || map[plan.host_id]) return map;
        map[plan.host_id] = plan;
        return map;
      }, {});
      return vehicleRows.filter((vehicle) => {
        const plan = planByHost[vehicle.host_id];
        return !plan || plan.marketplace_enabled !== false;
      }).slice(0, 6);
    },
  });

  if (vehicles.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-10 text-center">
        <div className="h-12 w-12 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center mx-auto mb-3">
          <Car className="h-5 w-5 text-gray-300" />
        </div>
        <p className="text-sm font-semibold text-gray-400">Approved vehicles will appear here soon.</p>
        <p className="text-xs text-gray-300 mt-1">Fleet partners are onboarding now.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Available Now</p>
          <h3 className="text-lg font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>
            Featured Weekly Rentals
          </h3>
        </div>
        <Link to="/book-now" className="text-xs font-bold text-pink-600 flex items-center gap-1 hover:underline">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {vehicles.slice(0, 6).map((v) => (
          <Link to="/book-now" key={v.id}
            className="rounded-2xl border border-gray-100 bg-white overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all group">
            {/* Image */}
            <div className="relative">
              {v.image_url ? (
                <img src={v.image_url} alt={`${v.make} ${v.model}`} className="w-full h-28 object-cover group-hover:scale-[1.02] transition-transform" />
              ) : (
                <div className="w-full h-28 flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, hsl(265 20% 94%) 0%, hsl(338 20% 94%) 100%)" }}>
                  <Car className="h-8 w-8 text-gray-300" />
                </div>
              )}
              {/* Availability badge */}
              <div className="absolute top-2 left-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/90 text-white text-[9px] font-bold backdrop-blur-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Available
                </span>
              </div>
            </div>

            {/* Card body */}
            <div className="p-3">
              <p className="text-xs font-bold text-gray-900 truncate leading-tight">{v.year} {v.make} {v.model}</p>
              {v.city && (
                <p className="text-[10px] text-gray-400 flex items-center gap-0.5 mt-0.5">
                  <MapPin className="h-2.5 w-2.5" />{v.city}{v.state ? `, ${v.state}` : ""}
                </p>
              )}
              {v.weekly_rate ? (
                <p className="text-base font-black mt-1.5" style={{ fontFamily: "var(--font-syne)", background: "linear-gradient(135deg, hsl(338 90% 50%), hsl(265 80% 55%))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  ${v.weekly_rate}<span className="text-[10px] font-normal" style={{ WebkitTextFillColor: "#9ca3af" }}>/wk</span>
                </p>
              ) : null}

              {/* Trust mini badges */}
              <div className="flex gap-1 mt-2 flex-wrap">
                {TRUST_BADGES.map((b, bi) => (
                  <span key={bi} className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-semibold" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569" }}>
                    <b.icon className="h-2.5 w-2.5" />{b.label}
                  </span>
                ))}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}