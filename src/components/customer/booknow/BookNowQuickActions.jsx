import React from "react";
import { CalendarCheck, Key, TrendingDown, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

const BOOKING_TYPES = [
  {
    label: "Weekly",
    icon: CalendarCheck,
    type: "Weekly",
    gradient: "linear-gradient(135deg, hsl(265 80% 62%), hsl(220 80% 60%))",
    glow: "hsl(265 80% 62% / 0.3)",
  },
  {
    label: "Rent-to-Own",
    icon: Key,
    type: "Rent-to-Own",
    gradient: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))",
    glow: "hsl(338 90% 56% / 0.3)",
  },
];

const FILTERS = ["All", "Budget", "Newest", "RTO"];

export default function BookNowQuickActions({ bookingType, onTypeChange, activeFilter, onFilterChange, companySlug }) {
  const navigate = useNavigate();

  const handleType = (type) => {
    onTypeChange(type);
    const companyParam = companySlug ? `?company=${companySlug}&type=${type}` : `?type=${type}`;
    navigate(`/checkout${companyParam}`);
  };

  return (
    <div className="px-4 mb-5">
      {/* Booking type pills */}
      <div className="flex gap-3 mb-5">
        {BOOKING_TYPES.map((a) => {
          const isActive = bookingType === a.type;
          return (
            <button
              key={a.label}
              onClick={() => handleType(a.type)}
              className="flex-1 flex items-center gap-3 p-4 rounded-2xl border transition-all active:scale-95"
              style={{
                background: isActive ? a.gradient : "hsl(222 24% 11%)",
                borderColor: isActive ? "transparent" : "hsl(222 18% 18%)",
                boxShadow: isActive ? `0 0 20px ${a.glow}` : "none",
              }}
            >
              <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: isActive ? "rgba(255,255,255,0.2)" : "hsl(222 20% 16%)" }}>
                <a.icon className="h-4.5 w-4.5 text-white" strokeWidth={1.8} style={{ height: "18px", width: "18px" }} />
              </div>
              <div className="text-left">
                <p className="text-white text-sm font-bold leading-tight">{a.label}</p>
                <p className="text-white/50 text-[10px]">{a.type === "Weekly" ? "Flexible, week by week" : "Drive to own it"}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all border"
            style={{
              background: activeFilter === f ? "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" : "transparent",
              borderColor: activeFilter === f ? "transparent" : "hsl(222 18% 22%)",
              color: activeFilter === f ? "white" : "hsl(210 12% 52%)",
            }}
          >
            {f}
          </button>
        ))}
      </div>
    </div>
  );
}