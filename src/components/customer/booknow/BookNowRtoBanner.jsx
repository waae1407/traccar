import React from "react";
import { Key, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function BookNowRtoBanner({ count, companySlug }) {
  const navigate = useNavigate();
  const companyParam = companySlug ? `&company=${companySlug}` : "";

  return (
    <div className="px-4 mb-5">
      <button
        onClick={() => navigate(`/checkout?type=Rent-to-Own${companyParam}`)}
        className="w-full rounded-2xl p-5 text-left relative overflow-hidden active:scale-[0.98] transition-transform"
        style={{ background: "linear-gradient(135deg, hsl(265 80% 96%) 0%, hsl(338 90% 96%) 100%)", border: "1px solid hsl(338 90% 88%)" }}
      >
        {/* Glow */}
        <div className="absolute top-0 right-0 h-32 w-32 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(338 90% 56% / 0.25) 0%, transparent 70%)" }} />

        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                <Key className="h-4 w-4 text-white" />
              </div>
              <span className="text-xs font-bold text-pink-400 uppercase tracking-wider">Rent-to-Own Program</span>
            </div>
            <p className="text-gray-900 font-bold text-lg leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
              Drive it. Own it. 🔑
            </p>
            <p className="text-gray-500 text-xs mt-1">
              {count} vehicle{count !== 1 ? "s" : ""} eligible · Pay weekly, own in 52 weeks
            </p>
          </div>
          <div className="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            <ArrowRight className="h-5 w-5 text-white" />
          </div>
        </div>
      </button>
    </div>
  );
}