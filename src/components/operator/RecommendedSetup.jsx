import React from "react";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { OPERATIONAL_MODES } from "@/lib/operatorRecommendation";
import AddonSelectionCards from "@/components/operator/AddonSelectionCards";

export default function RecommendedSetup({ result, onContinue, compact = false, selectedMode, onSelectMode, selectedAddons = [], onAddonsChange }) {
  const recommendedMode = result?.recommended_mode || "marketplace_partner";
  const mode = OPERATIONAL_MODES[recommendedMode];
  const currentSelection = selectedMode || recommendedMode;
  const addons = result?.recommended_addons || [];

  return (
    <div className="space-y-5">
      <div className="rounded-3xl p-5 text-white" style={{ background: "linear-gradient(135deg, #0f0c29, #302b63)" }}>
        <p className="text-xs font-bold text-white/50 uppercase tracking-wider mb-2">Your Recommended Setup</p>
        <h2 className="text-2xl font-black mb-2" style={{ fontFamily: "var(--font-syne)" }}>{mode.label}</h2>
        <p className="text-white/65 text-sm leading-relaxed">{mode.summary}</p>
        <div className="mt-4 rounded-2xl bg-white/10 p-4">
          <p className="text-xs text-white/40">Pricing summary</p>
          <p className="font-black text-lg">{mode.price}</p>
          <p className="text-[11px] text-white/35 mt-1">Payment-driven activation for paid plans — no real billing is activated from this screen.</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
        <p className="font-black text-gray-900 text-sm mb-3">Why this fits</p>
        <div className="space-y-2">
          {(result?.recommendation_reasoning || []).map((r, i) => (
            <p key={i} className="flex gap-2 text-sm text-gray-600"><CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />{r}</p>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-4">You can change this later from Business Operations settings.</p>
      </div>

      <div className="grid gap-3">
        {Object.entries(OPERATIONAL_MODES).map(([key, item]) => (
          <button type="button" key={key} onClick={() => onSelectMode?.(key)} className={`text-left rounded-2xl border p-4 bg-white ${key === currentSelection ? "border-pink-400 shadow-sm bg-pink-50" : key === recommendedMode ? "border-pink-200" : "border-gray-100"}`}>
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-black text-gray-900 text-sm">{item.label}</p><p className="text-xs text-gray-500 mt-1">{item.price}</p></div>
              <div className="flex gap-1.5">{key === recommendedMode && <span className="text-[10px] font-black text-pink-600 bg-pink-50 px-2 py-1 rounded-full">Recommended</span>}{key === currentSelection && <span className="text-[10px] font-black text-white bg-pink-600 px-2 py-1 rounded-full">Selected</span>}</div>
            </div>
            <p className="text-xs text-gray-500 mt-2">{item.summary}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">{item.tools.map(t => <span key={t} className="text-[10px] font-bold bg-gray-50 text-gray-500 px-2 py-1 rounded-full">{t}</span>)}</div>
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
        <p className="font-black text-gray-900 text-sm mb-1">Recommended add-ons</p>
        <p className="text-xs text-gray-500 mb-3">Select add-ons for setup planning. Billing/setup happens later and is not activated here.</p>
        <AddonSelectionCards recommendedAddons={addons} selectedAddons={selectedAddons} onChange={onAddonsChange} compact={compact} />
      </div>

      {!compact && <button onClick={onContinue} className="w-full py-4 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>Confirm Selected Setup <ArrowRight className="h-4 w-4" /></button>}
    </div>
  );
}