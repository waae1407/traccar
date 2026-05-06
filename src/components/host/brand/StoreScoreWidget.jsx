import React from "react";
import { CheckCircle2, Circle } from "lucide-react";

const SCORE_ITEMS = [
  { key: "logo", label: "Logo uploaded", points: 15 },
  { key: "cover", label: "Cover image", points: 10 },
  { key: "hero", label: "Hero text set", points: 10 },
  { key: "about", label: "About section", points: 10 },
  { key: "vehicles", label: "3+ vehicles approved", points: 20 },
  { key: "stripe", label: "Stripe connected", points: 20 },
  { key: "booking", label: "First booking received", points: 15 },
];

export default function StoreScoreWidget({ brand, host, vehicleCount, bookingCount }) {
  const checks = {
    logo: !!brand?.logo_url,
    cover: !!brand?.cover_image_url,
    hero: !!brand?.hero_title,
    about: !!brand?.about_text,
    vehicles: vehicleCount >= 3,
    stripe: !!host?.stripe_onboarding_complete,
    booking: bookingCount > 0,
  };

  const score = SCORE_ITEMS.reduce((sum, item) => sum + (checks[item.key] ? item.points : 0), 0);
  const canPublish = score >= 60;

  // Progress toward the 60-point publish threshold (capped at 100% bar)
  const progressPct = Math.min(100, Math.round((score / 60) * 100));

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h3 className="font-bold text-gray-900 text-sm">Store Score</h3>
          <p className="text-xs text-gray-400">
            {canPublish ? "✅ Ready to publish!" : `Need ${60 - score} more points to unlock publishing`}
          </p>
        </div>
        <div className="text-right">
          <span className="text-3xl font-black" style={{ fontFamily: "var(--font-syne)", background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {score}
          </span>
          <span className="text-gray-400 text-sm font-semibold"> pts</span>
        </div>
      </div>

      {/* Threshold marker */}
      <div className="relative mb-1">
        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%`, background: canPublish ? "linear-gradient(90deg, hsl(152 60% 46%), hsl(199 90% 54%))" : "linear-gradient(90deg, hsl(38 95% 54%), hsl(338 90% 56%))" }} />
        </div>
      </div>
      <p className="text-[10px] text-gray-400 mb-4">
        {canPublish ? "Publishing unlocked 🎉" : `${score} / 60 points needed to publish`}
      </p>

      <div className="space-y-2">
        {SCORE_ITEMS.map(item => (
          <div key={item.key} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {checks[item.key]
                ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                : <Circle className="h-4 w-4 text-gray-300 flex-shrink-0" />}
              <span className={`text-xs font-medium ${checks[item.key] ? "text-gray-700" : "text-gray-400"}`}>{item.label}</span>
            </div>
            <span className={`text-xs font-bold ${checks[item.key] ? "text-emerald-600" : "text-gray-300"}`}>+{item.points}</span>
          </div>
        ))}
      </div>
    </div>
  );
}