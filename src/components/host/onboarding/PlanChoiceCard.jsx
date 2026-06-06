import React from "react";
import { CheckCircle2 } from "lucide-react";

export default function PlanChoiceCard({ option, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option.id)}
      className={`w-full text-left rounded-3xl border-2 p-4 transition-all ${selected ? "border-pink-400 bg-pink-50 shadow-sm" : "border-gray-100 bg-white"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-gray-900">{option.goal}</p>
          <h3 className="text-lg font-black text-gray-950 mt-1" style={{ fontFamily: "var(--font-syne)" }}>{option.label}</h3>
          <p className="text-sm font-bold text-pink-600 mt-1">{option.price}</p>
        </div>
        <span className={`h-6 w-6 rounded-full border flex items-center justify-center ${selected ? "bg-pink-600 border-pink-600" : "border-gray-200"}`}>
          {selected && <CheckCircle2 className="h-4 w-4 text-white" />}
        </span>
      </div>
      <div className="mt-3 space-y-1.5">
        {option.bullets.map((bullet) => (
          <p key={bullet} className="flex items-center gap-2 text-xs text-gray-600">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" /> {bullet}
          </p>
        ))}
      </div>
    </button>
  );
}