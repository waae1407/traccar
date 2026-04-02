import React from "react";
import { Car, Calendar, Clock, FileKey, MapPin, Star, Bookmark, Plane } from "lucide-react";

const services = [
  { label: "Daily", icon: Clock, color: "bg-orange-50 text-orange-500", desc: "From $45/day" },
  { label: "Weekly", icon: Calendar, color: "bg-blue-50 text-blue-500", desc: "From $199/wk" },
  { label: "Monthly", icon: Car, color: "bg-green-50 text-green-500", desc: "From $699/mo" },
  { label: "Rent-to-Own", icon: FileKey, color: "bg-pink-50 text-pink-600", desc: "Own it" },
  { label: "Airport", icon: Plane, color: "bg-purple-50 text-purple-500", desc: "Delivery" },
  { label: "Reserve", icon: Bookmark, color: "bg-yellow-50 text-yellow-500", desc: "Save spot" },
  { label: "Near Me", icon: MapPin, color: "bg-teal-50 text-teal-500", desc: "Browse" },
  { label: "Top Rated", icon: Star, color: "bg-rose-50 text-rose-500", desc: "Premium" },
];

export default function ServiceCards({ onSelect }) {
  return (
    <div className="px-4 mt-6">
      <h2 className="font-bold text-gray-900 text-base mb-3">What do you need?</h2>
      <div className="grid grid-cols-4 gap-3">
        {services.map((svc) => (
          <button
            key={svc.label}
            onClick={() => onSelect?.(svc.label)}
            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white border border-gray-100 hover:border-pink-200 hover:shadow-sm transition-all active:scale-95"
          >
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${svc.color}`}>
              <svc.icon className="h-5 w-5" />
            </div>
            <div className="text-center">
              <p className="text-[11px] font-bold text-gray-800 leading-tight">{svc.label}</p>
              <p className="text-[9px] text-gray-400 mt-0.5">{svc.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}