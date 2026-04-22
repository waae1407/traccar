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
    const companyParam = companySlug ? `&company=${companySlug}` : "";
    navigate(`/checkout?type=${type}${companyParam}`);
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
                background: isActive ? a.gradient : "#fff",
                borderColor: isActive ? "transparent" : "#e5e7eb",
                boxShadow: isActive ? `0 4px 16px ${a.glow}` : "0 1px 4px rgba(0,0,0,0.06)",
              }}
            >
              <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: isActive ? "rgba(255,255,255,0.25)" : "#f3f4f6" }}>
                <a.icon className={`h-4.5 w-4.5 ${isActive ? "text-white" : "text-gray-600"}`} strokeWidth={1.8} style={{ height: "18px", width: "18px" }} />
              </div>
              <div className="text-left">
                <p className={`text-sm font-bold leading-tight ${isActive ? "text-white" : "text-gray-800"}`}>{a.label}</p>
                <p className={`text-[10px] ${isActive ? "text-white/70" : "text-gray-400"}`}>{a.type === "Weekly" ? "Flexible, week by week" : "Drive to own it"}</p>
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
              background: activeFilter === f ? "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" : "#fff",
              borderColor: activeFilter === f ? "transparent" : "#e5e7eb",
              color: activeFilter === f ? "white" : "#6b7280",
            }}
          >
            {f}
          </button>
        ))}
      </div>
    </div>
  );
}