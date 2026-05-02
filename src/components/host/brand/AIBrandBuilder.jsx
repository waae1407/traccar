import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, Loader2 } from "lucide-react";

const SUGGESTIONS = [
  "Luxury exotic rentals in LA",
  "Affordable weekly rentals for gig workers",
  "Family-friendly rent-to-own vehicles",
  "Budget fleet for Uber & Lyft drivers",
  "Premium black car service fleet",
];

const TEMPLATES = {
  prestige: { brand_color: "#0f0c29", secondary_color: "#c9a84c" },
  modern: { brand_color: "#e91e8c", secondary_color: "#7c3aed" },
  street: { brand_color: "#ff3000", secondary_color: "#1a1a1a" },
  family: { brand_color: "#2563eb", secondary_color: "#16a34a" },
};

export default function AIBrandBuilder({ host, vehicles, onApply }) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGenerate = async (text) => {
    const p = text || prompt;
    if (!p.trim()) return;
    setLoading(true);

    const vehicleSummary = vehicles.slice(0, 5).map(v => `${v.year} ${v.make} ${v.model} at $${v.weekly_rate}/wk`).join(", ");
    const fullPrompt = `You are a brand copywriter for a vehicle rental business called "${host?.business_name || "this rental business"}" in ${host?.city || "USA"}.
Fleet: ${vehicleSummary || "various vehicles"}.
Business vibe: "${p}".

Generate a JSON brand profile with these exact keys:
- hero_title (punchy, max 8 words)
- hero_subtitle (benefit-focused, max 20 words)
- about_text (2-3 sentences, professional yet warm)
- cta_button_text (max 4 words, action-oriented)
- layout_template (one of: prestige, modern, street, family — pick best fit)

Return ONLY valid JSON, no explanation.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: fullPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          hero_title: { type: "string" },
          hero_subtitle: { type: "string" },
          about_text: { type: "string" },
          cta_button_text: { type: "string" },
          layout_template: { type: "string" },
        }
      }
    });

    const colors = TEMPLATES[result.layout_template] || TEMPLATES.modern;
    onApply({ ...result, ...colors });
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="font-bold text-gray-900 text-sm">AI Brand Builder</p>
          <p className="text-xs text-gray-400">Describe your business — AI writes your brand</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {SUGGESTIONS.map(s => (
          <button key={s} onClick={() => handleGenerate(s)}
            className="px-3 py-1.5 rounded-full bg-pink-50 border border-pink-100 text-xs font-medium text-pink-700 hover:bg-pink-100 transition-all">
            {s}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-pink-400"
          placeholder="Describe your rental business..."
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleGenerate()}
        />
        <button onClick={() => handleGenerate()} disabled={loading || !prompt.trim()}
          className="px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all shadow-sm flex items-center gap-2"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Generate
        </button>
      </div>
    </div>
  );
}