import React from "react";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function StorefrontHero({ brand, host }) {
  const navigate = useNavigate();
  const isPrestige = brand?.layout_template === "prestige";
  const isStreet = brand?.layout_template === "street";

  const handleBook = () => navigate(`/book-now?host_id=${host?.id}`);

  return (
    <div className="relative overflow-hidden min-h-[420px] flex items-end"
      style={brand?.cover_image_url ? {} : { background: `linear-gradient(135deg, ${brand?.brand_color || "#e91e8c"}, ${brand?.secondary_color || "#7c3aed"})` }}>
      {brand?.cover_image_url && (
        <>
          <img src={brand.cover_image_url} alt="cover" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.75) 100%)" }} />
        </>
      )}

      <div className="relative z-10 w-full px-6 pb-12 pt-24 max-w-2xl mx-auto">
        {/* Host badges */}
        {(host?.badge_top_earner || host?.badge_five_star || host?.badge_compliance_king) && (
          <div className="flex flex-wrap gap-2 mb-4">
            {host.badge_top_earner && <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-yellow-400/90 text-yellow-900">🏆 Top Earner</span>}
            {host.badge_five_star && <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/20 text-white">⭐ 5-Star Host</span>}
            {host.badge_compliance_king && <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/20 text-white">🛡️ Verified</span>}
          </div>
        )}

        <h1 className={`font-black text-white mb-3 leading-tight ${isPrestige || isStreet ? "text-5xl" : "text-4xl"}`}
          style={{ fontFamily: isPrestige || isStreet ? "var(--font-syne)" : "var(--font-inter)" }}>
          {brand?.hero_title || "Premium Vehicles for Every Journey"}
        </h1>
        <p className="text-white/80 text-base leading-relaxed mb-8 max-w-md">
          {brand?.hero_subtitle || "Flexible rentals. No credit check. On the road in 24 hours."}
        </p>
        <button onClick={handleBook}
          className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-bold text-white shadow-2xl transition-all active:scale-95"
          style={{ background: `linear-gradient(135deg, ${brand?.brand_color || "#e91e8c"}, ${brand?.secondary_color || "#7c3aed"})` }}>
          {brand?.cta_button_text || "Book Now"} <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}