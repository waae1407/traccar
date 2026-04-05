import React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * A single initialed clause.
 * Props:
 *   id        — unique clause key
 *   label     — short heading
 *   text      — the clause statement the user is acknowledging
 *   value     — current initials string
 *   onChange  — (id, value) => void
 *   severity  — "high" | "medium"  (affects border color)
 */
export default function InitialClause({ id, label, text, value, onChange, severity = "high" }) {
  const signed = value.trim().length >= 1;
  const borderCls = signed
    ? "border-green-300 bg-green-50"
    : severity === "high"
    ? "border-red-200 bg-red-50"
    : "border-amber-200 bg-amber-50";

  return (
    <div className={`rounded-2xl border-2 p-4 transition-all ${borderCls}`}>
      <div className="flex items-start gap-2 mb-3">
        {signed
          ? <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
          : <AlertTriangle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${severity === "high" ? "text-red-500" : "text-amber-500"}`} />}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">{label}</p>
          <p className="text-sm text-gray-800 leading-relaxed">{text}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          maxLength={6}
          placeholder="Initials"
          value={value}
          onChange={(e) => onChange(id, e.target.value)}
          className={`w-28 h-10 px-3 rounded-xl border text-center font-bold text-lg italic tracking-widest focus:outline-none transition-all
            ${signed
              ? "border-green-400 bg-white text-green-700 focus:ring-2 focus:ring-green-200"
              : "border-gray-300 bg-white text-gray-900 focus:border-pink-400 focus:ring-2 focus:ring-pink-100"}`}
        />
        {signed && (
          <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Initialed
          </span>
        )}
        {!signed && (
          <span className="text-xs text-gray-400">Type your initials to acknowledge</span>
        )}
      </div>
    </div>
  );
}