import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Home, DollarSign, Shield, Zap, CheckCircle2, ArrowRight, ChevronRight } from "lucide-react";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

const inputClass = "w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] transition-all text-sm";

export default function BecomeAHost() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1=landing, 2=form, 3=submitted
  const [submitting, setSubmitting] = useState(false);
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

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    await base44.entities.Host.create({
      ...form,
      user_id: user?.id || "",
      status: "pending",
      commission_rate: 0.20,
    });
    setStep(3);
    setSubmitting(false);
  };

  if (step === 3) return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "hsl(222 28% 7%)" }}>
      <div className="max-w-md w-full text-center">
        <div className="h-20 w-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="h-10 w-10 text-green-400" />
        </div>
        <h2 className="text-3xl font-black text-white font-syne mb-3">Application Submitted!</h2>
        <p className="text-white/50 mb-8">Our team will review your application and reach out within 24–48 hours. Once approved, you'll receive a Stripe Connect onboarding link to set up your payouts.</p>
        <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-bold text-sm"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          Back to Home <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );

  if (step === 2) return (
    <div className="min-h-screen px-6 py-12" style={{ background: "hsl(222 28% 7%)" }}>
      <div className="max-w-lg mx-auto">
        <Link to="/" className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-8 transition-colors">
          <img src={LOGO_ICON} alt="uRide" className="h-6 w-6 rounded-full" />
          uRide
        </Link>
        <h1 className="text-3xl font-black text-white font-syne mb-2">Host Application</h1>
        <p className="text-white/40 text-sm mb-8">Tell us about yourself and your fleet. We review every application personally.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Full Name *</label>
              <input className={inputClass} required value={form.full_name} onChange={e => set("full_name", e.target.value)} placeholder="Your full name" /></div>
            <div><label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Email *</label>
              <input className={inputClass} required type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="you@email.com" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Phone *</label>
              <input className={inputClass} required value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(555) 000-0000" /></div>
            <div><label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Business Name</label>
              <input className={inputClass} value={form.business_name} onChange={e => set("business_name", e.target.value)} placeholder="Optional" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">City *</label>
              <input className={inputClass} required value={form.city} onChange={e => set("city", e.target.value)} placeholder="Houston" /></div>
            <div><label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">State *</label>
              <input className={inputClass} required value={form.state} onChange={e => set("state", e.target.value)} placeholder="TX" maxLength={2} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Years in Business</label>
              <input className={inputClass} type="number" value={form.years_in_business} onChange={e => set("years_in_business", e.target.value)} placeholder="0" /></div>
            <div><label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">How did you hear about us?</label>
              <input className={inputClass} value={form.referral_source} onChange={e => set("referral_source", e.target.value)} placeholder="Google, referral, etc." /></div>
          </div>
          <div><label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Tell us about your fleet</label>
            <textarea className={inputClass} rows={3} value={form.bio} onChange={e => set("bio", e.target.value)} placeholder="How many vehicles do you have? What types? Any experience with rentals?" /></div>

          <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03] text-sm text-white/50">
            By submitting, you agree to uRide's host terms. Once approved, you'll set up Stripe Connect to receive automated 80% payouts for every rental.
          </div>

          <button type="submit" disabled={submitting}
            className="w-full py-4 rounded-xl font-bold text-white text-sm disabled:opacity-50 transition-all"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            {submitting ? "Submitting..." : "Submit Application →"}
          </button>
        </form>
      </div>
    </div>
  );

  // Step 1: Landing
  return (
    <div className="min-h-screen text-white" style={{ background: "hsl(222 28% 7%)" }}>
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <Link to="/" className="flex items-center gap-2">
          <img src={LOGO_ICON} alt="uRide" className="h-8 w-8 rounded-full" />
          <span className="font-bold text-lg font-syne">uRide</span>
        </Link>
        <button onClick={() => base44.auth.redirectToLogin(window.location.href)}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white/60 hover:text-white transition-colors">
          Sign In
        </button>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-green-500/30 bg-green-500/10 text-green-400 text-xs font-semibold mb-6">
          <Zap className="h-3 w-3" /> Automated Payouts via Stripe Connect
        </div>
        <h1 className="text-5xl md:text-6xl font-black mb-6 font-syne leading-tight">
          Your Fleet.<br /><span className="gradient-text">Passive Income.</span>
        </h1>
        <p className="text-white/50 text-xl max-w-2xl mx-auto mb-12">
          List your vehicles on uRide. We handle renters, payments, and compliance. You collect 80% of every rental — automatically deposited to your bank.
        </p>

        <div className="grid md:grid-cols-3 gap-6 mb-12 text-left">
          {[
            { icon: DollarSign, title: "80% of Every Rental", desc: "Stripe Connect deposits directly to your bank. No manual payouts, no waiting.", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
            { icon: Shield, title: "We Handle Everything", desc: "uRide manages renters, verification, insurance disputes, and support.", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
            { icon: Zap, title: "AV-Ready Platform", desc: "Infrastructure built for the future — autonomous vehicle integration included.", color: "text-primary", bg: "bg-primary/10 border-primary/20" },
          ].map((item, i) => (
            <div key={i} className={`p-6 rounded-2xl border ${item.bg}`}>
              <item.icon className={`h-8 w-8 ${item.color} mb-4`} />
              <h3 className="font-bold text-white mb-2">{item.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="mb-12 p-6 rounded-2xl border border-white/10 bg-white/[0.03]">
          <p className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-4">How the Math Works</p>
          <div className="flex items-center justify-center gap-4 flex-wrap text-sm">
            {[
              { label: "Renter pays", value: "$300/week" },
              { label: "→ uRide keeps", value: "$60 (20%)" },
              { label: "→ You receive", value: "$240 (80%)" },
              { label: "→ In 2 days", value: "Bank deposit" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                {i > 0 && <ChevronRight className="h-4 w-4 text-white/20" />}
                <div className="text-center">
                  <p className="font-black text-white text-lg">{item.value}</p>
                  <p className="text-white/40 text-xs">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => user ? setStep(2) : base44.auth.redirectToLogin(window.location.href + "?next=apply")}
          className="px-10 py-4 rounded-2xl text-base font-bold text-white shadow-lg hover:opacity-90 transition-all"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          Apply to Become a Host →
        </button>
        <p className="text-white/30 text-xs mt-4">Application review within 24–48 hours · No fees to apply</p>
      </div>
    </div>
  );
}