import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { recommendOperatorMode, planDefaults } from "@/lib/operatorRecommendation";
import RecommendedSetup from "@/components/operator/RecommendedSetup";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

const questions = [
  ["business_type", "What best describes your operation?", ["I’m starting a rental business", "I already rent vehicles", "I’m a dealership", "I manage a commercial fleet", "I’m exploring options"]],
  ["fleet_size_range", "How many vehicles do you currently manage?", ["0, I need help sourcing vehicles", "1–2", "3–10", "11–25", "26–100", "100+"]],
  ["has_existing_customers", "Do you already have customers or traffic?", ["No, I need customers", "Some repeat customers", "Yes, we already operate independently"]],
  ["website_branding_status", "Do you already have a website or business brand?", ["No", "Yes, basic presence", "Yes, established brand"]],
  ["operational_needs", "What do you need help with?", ["Booking system", "Contracts", "Contactless rentals", "GPS/vehicle control", "Maintenance tracking", "Compliance management", "Customer management", "Marketplace exposure", "Payment processing", "Mobile operations", "AI inspections"], true],
  ["wants_contactless", "Do you want contactless rental operations?", ["Yes", "No", "Maybe later"]],
  ["wants_marketplace_demand", "Do you want uRideHub to help bring you renters?", ["Yes", "Maybe occasionally", "No, I already have customers"]],
  ["payment_preference", "How would you like to process payments?", ["Use uRideHub payments", "Use my own payment processor"]],
  ["vehicle_acquisition_interest", "Are you looking to acquire more vehicles?", ["Yes", "Maybe later", "No"]],
  ["inventory_liquidation_interest", "Do you need help selling or liquidating vehicles?", ["Yes", "Maybe later", "No"]],
];

export default function SmartOperatorQuestionnaire() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ operational_needs: [] });
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const q = questions[step];

  const choose = (key, value, multi) => {
    if (multi) {
      setAnswers(p => ({ ...p, [key]: (p[key] || []).includes(value) ? p[key].filter(v => v !== value) : [...(p[key] || []), value] }));
      return;
    }
    setAnswers(p => ({ ...p, [key]: value }));
  };

  const next = async () => {
    if (step < questions.length - 1) { setStep(step + 1); return; }
    if (!user) { base44.auth.redirectToLogin("/operator-questionnaire"); return; }
    setSaving(true);
    const recommendation = recommendOperatorMode(answers);
    const profilePayload = { user_id: user.id, ...answers, ...recommendation, onboarding_status: "recommended", editable_by_host: true, last_updated_at: new Date().toISOString() };
    const profile = await base44.entities.OperatorProfile.create(profilePayload);
    await base44.entities.OperatorRecommendationHistory.create({ new_mode: recommendation.recommended_mode, reason: recommendation.recommendation_reasoning.join(" "), changed_by: user.email, changed_at: new Date().toISOString(), source: "questionnaire" });
    localStorage.setItem("operator_profile_id", profile.id);
    setResult(recommendation);
    setSaving(false);
  };

  if (result) return <div className="min-h-screen bg-gray-50"><Header /><main className="max-w-lg mx-auto px-5 py-6"><RecommendedSetup result={result} onContinue={() => navigate("/become-a-host?from=operator-questionnaire")} /></main></div>;

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "var(--font-inter)" }}>
      <Header />
      <main className="max-w-lg mx-auto px-5 py-6">
        <div className="mb-6"><p className="text-xs font-black text-pink-600">Step {step + 1} of {questions.length}</p><h1 className="text-2xl font-black text-gray-900 mt-2" style={{ fontFamily: "var(--font-syne)" }}>{q[1]}</h1></div>
        <div className="space-y-2">
          {q[2].map(option => {
            const active = q[3] ? (answers[q[0]] || []).includes(option) : answers[q[0]] === option;
            return <button key={option} onClick={() => choose(q[0], option, q[3])} className={`w-full text-left p-4 rounded-2xl border text-sm font-bold transition-all ${active ? "bg-pink-50 border-pink-300 text-pink-700" : "bg-white border-gray-100 text-gray-700"}`}>{option}</button>;
          })}
        </div>
        <div className="flex gap-3 mt-6"><button onClick={() => setStep(Math.max(0, step - 1))} className="px-5 py-3 rounded-2xl bg-white border border-gray-100 text-gray-500 font-bold text-sm">Back</button><button onClick={next} disabled={saving || (!q[3] && !answers[q[0]])} className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-40" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>{saving ? "Saving…" : step === questions.length - 1 ? "See My Setup" : "Next"}</button></div>
      </main>
    </div>
  );
}

function Header() {
  return <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100"><div className="max-w-lg mx-auto px-5 h-14 flex items-center gap-2"><Link to="/" className="flex items-center gap-2"><img src={LOGO_ICON} alt="uRide" className="h-7 w-7 rounded-lg object-cover" /><span className="font-black text-gray-900 text-base" style={{ fontFamily: "var(--font-syne)" }}>uRide</span></Link><span className="text-gray-300">/</span><span className="text-sm text-gray-500 font-medium">Smart Setup</span></div></header>;
}