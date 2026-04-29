import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Gift, X, ChevronRight } from "lucide-react";

export default function RentForFreeBanner() {
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  if (dismissed) return null;

  const handleClick = () => {
    navigate("/account#rent-for-free");
    setTimeout(() => {
      const el = document.getElementById("rent-for-free");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
  };

  return (
    <div className="mx-5 mb-4 relative">
      <button
        onClick={handleClick}
        className="w-full flex items-center gap-3 p-4 rounded-2xl overflow-hidden group active:scale-[0.98] transition-transform text-left"
        style={{
          background: "linear-gradient(135deg, hsl(338 90% 56% / 0.10) 0%, hsl(265 80% 62% / 0.08) 100%)",
          border: "1px solid hsl(338 90% 56% / 0.28)",
        }}
      >
        {/* Decorative glow orb */}
        <div
          className="absolute -top-4 -right-8 h-24 w-24 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(265 80% 62% / 0.20), transparent 70%)" }}
        />

        {/* Icon */}
        <div
          className="h-11 w-11 rounded-2xl flex items-center justify-center flex-shrink-0 relative z-10"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
        >
          <Gift className="h-5 w-5 text-white" />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0 relative z-10 pr-6">
          <p className="font-bold text-gray-900 text-sm leading-tight">
            🚗 Rent for Free Program
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Refer friends → earn <strong className="text-pink-600">$25/referral</strong>. Stack credits &amp; ride free.
          </p>
        </div>

        <ChevronRight className="h-4 w-4 text-pink-500 flex-shrink-0 relative z-10" />
      </button>

      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 z-20 h-6 w-6 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
      >
        <X className="h-3 w-3 text-gray-500" />
      </button>
    </div>
  );
}