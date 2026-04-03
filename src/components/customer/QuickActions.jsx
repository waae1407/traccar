import React from "react";
import { CalendarCheck, Key } from "lucide-react";

const actions = [
  {
    label: "Weekly Rental",
    icon: CalendarCheck,
    type: "Weekly",
    bg: "bg-violet-50",
    iconColor: "text-violet-600",
  },
  {
    label: "Rent-to-Own",
    icon: Key,
    type: "Rent-to-Own",
    bg: "bg-amber-50",
    iconColor: "text-amber-600",
  },
];

export default function QuickActions({ onSelect }) {
  return (
    <div className="px-4 pb-4">
      <div className="flex gap-3">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={() => onSelect(a.type)}
            className="flex-1 flex items-center gap-3 p-3 rounded-2xl bg-white border border-gray-100 shadow-sm active:scale-95 transition-transform hover:border-pink-200"
          >
            <div className={`h-10 w-10 rounded-xl ${a.bg} flex items-center justify-center flex-shrink-0`}>
              <a.icon className={`h-5 w-5 ${a.iconColor}`} strokeWidth={1.8} />
            </div>
            <span className="text-sm font-semibold text-gray-700 text-left leading-tight">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}