import React from "react";
import { Car, CalendarCheck, Key, PlaneTakeoff } from "lucide-react";

const actions = [
  {
    label: "Rent Now",
    icon: Car,
    type: "Daily",
    gradient: "from-pink-500 to-rose-500",
    bg: "bg-pink-50",
    iconColor: "text-pink-600",
  },
  {
    label: "Reserve",
    icon: CalendarCheck,
    type: "Weekly",
    gradient: "from-violet-500 to-purple-600",
    bg: "bg-violet-50",
    iconColor: "text-violet-600",
  },
  {
    label: "Rent-to-Own",
    icon: Key,
    type: "Rent-to-Own",
    gradient: "from-amber-500 to-orange-500",
    bg: "bg-amber-50",
    iconColor: "text-amber-600",
  },
  {
    label: "Airport Drop",
    icon: PlaneTakeoff,
    type: "Daily",
    gradient: "from-sky-500 to-cyan-500",
    bg: "bg-sky-50",
    iconColor: "text-sky-600",
  },
];

export default function QuickActions({ onSelect }) {
  return (
    <div className="px-4 pb-4">
      <div className="grid grid-cols-4 gap-3">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={() => onSelect(a.type)}
            className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
          >
            <div className={`h-14 w-14 rounded-2xl ${a.bg} flex items-center justify-center shadow-sm`}>
              <a.icon className={`h-6 w-6 ${a.iconColor}`} strokeWidth={1.8} />
            </div>
            <span className="text-[11px] font-semibold text-gray-600 text-center leading-tight">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}