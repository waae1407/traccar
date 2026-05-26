import React, { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, Plus, X } from "lucide-react";
import { OPERATOR_ADDONS, normalizeAddonKey } from "@/lib/operatorRecommendation";

export default function AddonSelectionCards({ recommendedAddons = [], selectedAddons = [], onChange, compact = false }) {
  const [expanded, setExpanded] = useState({});
  const recommended = new Set(recommendedAddons.map(normalizeAddonKey));
  const selected = new Set(selectedAddons.map(normalizeAddonKey));
  const keys = Object.keys(OPERATOR_ADDONS);

  const toggleSelected = (key) => {
    const next = selected.has(key)
      ? [...selected].filter((item) => item !== key)
      : [...selected, key];
    onChange?.(next);
  };

  return (
    <div className="space-y-3">
      {keys.map((key) => {
        const addon = OPERATOR_ADDONS[key];
        const isSelected = selected.has(key);
        const isRecommended = recommended.has(key);
        const isOpen = expanded[key] || (!compact && isRecommended);

        return (
          <div key={key} className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${isSelected ? "border-pink-300" : isRecommended ? "border-violet-200" : "border-gray-100"}`}>
            <button type="button" onClick={() => setExpanded((prev) => ({ ...prev, [key]: !isOpen }))} className="w-full text-left p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-gray-900 text-sm">{addon.name}</p>
                    {isRecommended && <span className="text-[10px] font-black text-violet-700 bg-violet-50 px-2 py-1 rounded-full">Recommended</span>}
                    {isSelected && <span className="text-[10px] font-black text-white bg-pink-600 px-2 py-1 rounded-full">Selected</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{addon.summary}</p>
                </div>
                {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
              </div>
            </button>

            {isOpen && (
              <div className="px-4 pb-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoBlock title="Included" items={addon.includes} />
                  <div className="rounded-2xl bg-gray-50 p-3">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Pricing</p>
                    {addon.pricing.map((line) => <p key={line} className="text-xs font-bold text-gray-700 mb-1">{line}</p>)}
                  </div>
                </div>
                <Impact title="Billing impact" text={addon.billingImpact} />
                <Impact title="Operational impact" text={addon.operationalImpact} />
                <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3">
                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider">Activation status</p>
                  <p className="text-xs text-amber-700 mt-1">{isSelected ? "Selected for setup planning only." : "Not selected."} Billing/setup happens later after approval — no charges are activated here.</p>
                </div>
                <button type="button" onClick={() => toggleSelected(key)} className={`w-full py-3 rounded-2xl text-sm font-black flex items-center justify-center gap-2 ${isSelected ? "bg-gray-100 text-gray-700" : "text-white"}`} style={!isSelected ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : undefined}>
                  {isSelected ? <><X className="h-4 w-4" /> Remove add-on</> : <><Plus className="h-4 w-4" /> Mark interest / Add to setup</>}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function InfoBlock({ title, items }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-3">
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      <div className="space-y-1.5">{items.map((item) => <p key={item} className="flex gap-2 text-xs text-gray-600"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />{item}</p>)}</div>
    </div>
  );
}

function Impact({ title, text }) {
  return <div className="rounded-2xl bg-violet-50 border border-violet-100 p-3"><p className="text-[10px] font-black text-violet-700 uppercase tracking-wider">{title}</p><p className="text-xs text-violet-700 mt-1 leading-relaxed">{text}</p></div>;
}