import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Home, DollarSign, Shield, Zap, CheckCircle2, ArrowRight, Clock, AlertCircle, Star, TrendingUp } from "lucide-react";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

const inputClass = "w-full px-4 py-3.5 rounded-2xl bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all text-sm font-medium";
const labelClass = "block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2";

export default function BecomeAHost() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [existingHost, setExistingHost] = useState(null);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [form, setForm] = useState({
    full_name: user?.full_name || "",
    email: user?.email || "",
    phone: "",
    business_name: "",
    city: "",
    state: "",
    years_in_business: "",
    referral_source: "",
    bio: "",
  });

  // Check for existing host record on mount (when user is logged in)
  useEffect(() => {
    if (!user?.email) return;
    setCheckingExisting(true);
    base44.entities.Host.filter({ email: user.email }).then(hosts => {
      if (hosts?.length > 0) {
        const host = hosts[0];
        setExistingHost(host);
        if (host.status === "approved") {
          navigate("/host/dashboard", { replace: true });
        } else if (host.status === "pending") {
          setStep("pending");
        } else if (host.status === "rejected") {
          // Pre-fill form with existing data so they can update & resubmit
          setForm({
            full_name: host.full_name || user?.full_name || "",
            email: host.email || user?.email || "",
            phone: host.phone || "",
            business_name: host.business_name || "",
            city: host.city || "",
            state: host.state || "",
            years_in_business: host.years_in_business || "",
            referral_source: host.referral_source || "",
            bio: host.bio || "",
          });
        }
      }
      setCheckingExisting(false);
    });
  }, [user?.email]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = { ...form, user_id: user?.id || "", status: "pending", commission_rate: 0.20 };
    // If rejected previously, update the existing record instead of creating a new one
    if (existingHost && existingHost.status === "rejected") {
      await base44.entities.Host.update(existingHost.id, { ...payload, verification_status: "not_started" });
    } else {
      await base44.entities.Host.create(payload);
    }
    setStep(3);
    setSubmitting(false);
  };

  // Loading check
  if (checkingExisting) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="h-8 w-8 rounded-full border-4 border-pink-500 border-t-transparent animate-spin" />
    </div>
  );

  // Already submitted — under review
  if (step === "pending") return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-gray-50">
      <div className="max-w-sm w-full text-center">
        <div className="relative inline-flex mb-8">
          <div className="h-24 w-24 rounded-3xl flex items-center justify-center mx-auto bg-yellow-100 border-2 border-yellow-300">
            <Clock className="h-12 w-12 text-yellow-500" />
          </div>
        </div>
        <h2 className="text-3xl font-black text-gray-900 mb-3" style={{ fontFamily: "var(--font-syne)" }}>Application Under Review</h2>
        <p className="text-gray-400 text-sm leading-relaxed mb-2">You already have a pending application. Our team reviews every application and approves quickly — typically within minutes.</p>
        <p className="text-gray-300 text-xs mb-8">Applied as: <span className="font-semibold text-gray-500">{existingHost?.email}</span></p>
        <div className="space-y-3">
          <Link to="/" className="flex items-center justify-center gap-2 w-full px-8 py-4 rounded-2xl text-white font-bold text-sm shadow-lg"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            Back to Home
          </Link>
          <p className="text-xs text-gray-300">Questions? Email <a href="mailto:support@uridehub.com" className="text-pink-500 underline">support@uridehub.com</a></p>
        </div>
      </div>
    </div>
  );

  // Success screen
  if (step === 3) return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-gray-50">
      <div className="max-w-sm w-full text-center">
        <div className="relative inline-flex mb-8">
          <div className="h-24 w-24 rounded-3xl flex items-center justify-center mx-auto"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            <CheckCircle2 className="h-12 w-12 text-white" />
          </div>
          <div className="absolute inset-0 rounded-3xl blur-2xl opacity-30"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }} />
        </div>
        <h2 className="text-3xl font-black text-gray-900 mb-3" style={{ fontFamily: "var(--font-syne)" }}>You're in the queue!</h2>
        <p className="text-gray-400 text-sm leading-relaxed mb-8">Our team reviews every application personally and approves quickly. We'll send a Stripe Connect link to set up your automatic payouts.</p>
        <Link to="/" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-white font-bold text-sm shadow-lg"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          Back to Home <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );

  // Application form
  if (step === 2) return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "var(--font-inter)" }}>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-lg mx-auto px-5 h-14 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <img src={LOGO_ICON} alt="uRide" className="h-7 w-7 rounded-lg object-cover" />
            <span className="font-black text-gray-900 text-base" style={{ fontFamily: "var(--font-syne)" }}>uRide</span>
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-500 font-medium">Host Application</span>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-5 py-8 pb-16">
        {/* Title */}
        <div className="mb-8">
          {existingHost?.status === "rejected" && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200 mb-5">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-700">Previous Application Not Approved</p>
                <p className="text-xs text-red-500 mt-0.5">You can update your details and resubmit below.</p>
              </div>
            </div>
          )}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600 text-xs font-bold mb-4">
            <Zap className="h-3 w-3" /> Step 2 of 2 — Your Details
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2" style={{ fontFamily: "var(--font-syne)" }}>Tell us about your vehicle(s)</h1>
          <p className="text-gray-400 text-sm">We review every application personally and approve quickly.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelClass}>Full Name *</label>
              <input className={inputClass} required value={form.full_name} onChange={e => set("full_name", e.target.value)} placeholder="Your name" /></div>
            <div><label className={labelClass}>Email *</label>
              <input className={inputClass} required type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="you@email.com" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelClass}>Phone *</label>
              <input className={inputClass} required value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(555) 000-0000" /></div>
            <div><label className={labelClass}>Business Name</label>
              <input className={inputClass} value={form.business_name} onChange={e => set("business_name", e.target.value)} placeholder="Optional" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelClass}>City *</label>
              <input className={inputClass} required value={form.city} onChange={e => set("city", e.target.value)} placeholder="Houston" /></div>
            <div><label className={labelClass}>State *</label>
              <input className={inputClass} required value={form.state} onChange={e => set("state", e.target.value)} placeholder="TX" maxLength={2} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelClass}>Years in Business</label>
              <input className={inputClass} type="number" value={form.years_in_business} onChange={e => set("years_in_business", e.target.value)} placeholder="0" /></div>
            <div><label className={labelClass}>How'd you hear about us?</label>
              <input className={inputClass} value={form.referral_source} onChange={e => set("referral_source", e.target.value)} placeholder="Google, referral…" /></div>
          </div>
          <div>
            <label className={labelClass}>Tell us about your vehicle(s)</label>
            <textarea className={inputClass} rows={3} value={form.bio} onChange={e => set("bio", e.target.value)} placeholder="How many vehicles? Types? Rental experience?" />
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-700 leading-relaxed">
            ✓ By submitting, you agree to uRide host terms. Once approved, Stripe Connect handles your 80% automatic payouts.
          </div>

          <button type="submit" disabled={submitting}
            className="w-full py-4 rounded-2xl font-bold text-white text-sm disabled:opacity-50 transition-all shadow-lg"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            {submitting ? "Submitting…" : "Submit Application →"}
          </button>
        </form>
      </div>
    </div>
  );

  // Landing page
  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "var(--font-inter)" }}>
      {/* Nav */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-lg mx-auto px-5 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={LOGO_ICON} alt="uRide" className="h-7 w-7 rounded-lg object-cover" />
            <span className="font-black text-gray-900 text-base" style={{ fontFamily: "var(--font-syne)" }}>uRide</span>
          </Link>
          <button onClick={() => base44.auth.redirectToLogin(window.location.href)}
            className="px-4 py-1.5 rounded-full text-sm font-bold text-white shadow-sm"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            Sign In
          </button>
        </div>
      </header>

      {/* Hero */}
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(160deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" }}>
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 30% 50%, hsl(338 90% 56% / 0.3) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, hsl(265 80% 62% / 0.3) 0%, transparent 50%)" }} />
        <div className="relative z-10 max-w-lg mx-auto px-5 pt-14 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm text-white/90 text-xs font-bold mb-6">
            <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" /> Trusted by 500+ rental hosts
          </div>
          <h1 className="text-4xl font-black text-white leading-[1.1] mb-5" style={{ fontFamily: "var(--font-syne)" }}>
            Your Vehicles.<br />
            <span style={{ background: "linear-gradient(135deg, hsl(338 90% 70%), hsl(265 80% 75%))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Effortless Income.
            </span>
          </h1>
          <p className="text-white/60 text-base leading-relaxed max-w-xs mx-auto mb-8">
            List your fleet on uRide. We handle renters, payments & compliance. You keep 80% — automatically.
          </p>
          <button onClick={() => {
            if (!user) { base44.auth.redirectToLogin(window.location.href + "?next=apply"); return; }
            if (existingHost?.status === "pending") { setStep("pending"); return; }
            setStep(2);
          }}
            className="px-8 py-4 rounded-2xl text-base font-bold text-white shadow-2xl transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            Apply as a Host →
          </button>
          <p className="text-white/30 text-xs mt-3">Free to apply · Get approved fast</p>
        </div>
        <div className="h-8">
          <svg viewBox="0 0 375 32" fill="white" xmlns="http://www.w3.org/2000/svg" className="w-full" preserveAspectRatio="none">
            <path d="M0 32L375 32L375 8C300 28 180 2 0 20L0 32Z"/>
          </svg>
        </div>
      </div>

      {/* Benefits */}
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="space-y-3 mb-8">
          {[
            { icon: DollarSign, title: "80% of every rental", desc: "Stripe Connect deposits directly to your bank within 2 business days. No manual invoicing.", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
            { icon: Shield, title: "We handle everything", desc: "Renters, verification, support, and insurance disputes — fully managed by uRide.", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100" },
            { icon: Zap, title: "AV-ready infrastructure", desc: "Your fleet is pre-configured for Waymo, Tesla Robotaxi, and future AV deployments.", color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-100" },
            { icon: TrendingUp, title: "Real-time analytics", desc: "Fleet score, ROI tracking, utilization rates — your entire business in one dashboard.", color: "text-pink-600", bg: "bg-pink-50", border: "border-pink-100" },
          ].map((item, i) => (
            <div key={i} className={`flex items-start gap-4 p-4 rounded-2xl border bg-white shadow-sm ${item.border}`}>
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${item.bg}`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm">{item.title}</p>
                <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Math breakdown */}
        <div className="rounded-3xl overflow-hidden mb-8" style={{ background: "linear-gradient(135deg, #0f0c29, #302b63)" }}>
          <div className="p-5">
            <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-5">The Math — Per Vehicle / Week</p>
            <div className="space-y-3">
              {[
                { label: "Renter pays", value: "$300", note: "weekly rate" },
                { label: "Stripe processing fee", value: "−$9.15", note: "~3.05%", muted: true },
                { label: "uRide platform fee", value: "−$24.00", note: "8%", muted: true },
                { label: "Your payout", value: "$266.85", note: "~89% → your bank", highlight: true },
              ].map((row, i) => (
                <div key={i} className={`flex items-center justify-between py-3 px-4 rounded-2xl ${row.highlight ? "bg-white/10" : "bg-white/5"}`}>
                  <div>
                    <p className={`text-sm font-semibold ${row.muted ? "text-white/40" : "text-white"}`}>{row.label}</p>
                    <p className="text-[10px] text-white/30">{row.note}</p>
                  </div>
                  <p className={`text-lg font-black ${row.highlight ? "text-emerald-400" : row.muted ? "text-white/40" : "text-white"}`} style={{ fontFamily: "var(--font-syne)" }}>{row.value}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-white/20 text-center mt-4">Paid within 2 business days via Stripe Connect · 1099-K auto-filed</p>
          </div>
        </div>

        {/* CTA */}
        <button onClick={() => {
          if (!user) { base44.auth.redirectToLogin(window.location.href + "?next=apply"); return; }
          if (existingHost?.status === "pending") { setStep("pending"); return; }
          setStep(2);
        }}
          className="w-full py-4 rounded-2xl font-bold text-white text-sm shadow-lg transition-all active:scale-95 mb-4"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          Apply to Become a Host →
        </button>
        <p className="text-center text-xs text-gray-300">No fees to apply · Get approved fast · Cancel anytime</p>
      </div>
    </div>
  );
}