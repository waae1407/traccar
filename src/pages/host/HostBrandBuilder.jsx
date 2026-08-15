import React, { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  Globe, Eye, CheckCircle2, Upload, Loader2, ExternalLink,
  ChevronRight, ChevronLeft, Store, Palette, Type, Settings, Rocket, Image, Zap
} from "lucide-react";
import { uploadFile } from "@/utils/uploadFile";
import HostPageHeader from "@/components/host/HostPageHeader";
import StoreScoreWidget from "@/components/host/brand/StoreScoreWidget";
import AIBrandBuilder from "@/components/host/brand/AIBrandBuilder";
import QRShareCard from "@/components/host/brand/QRShareCard";
import LogoIconGenerator from "@/components/host/brand/LogoIconGenerator";
import HostCustomDomainManager from "@/components/host/brand/HostCustomDomainManager";

const TEMPLATES = [
  { id: "prestige", label: "Prestige", desc: "Dark luxury, gold accents", bg: "#0f0c29", accent: "#c9a84c" },
  { id: "modern", label: "Modern", desc: "Clean white, vibrant gradient", bg: "#e91e8c", accent: "#7c3aed" },
  { id: "street", label: "Street", desc: "Bold, high-energy, urban", bg: "#ff3000", accent: "#1a1a1a" },
  { id: "family", label: "Family", desc: "Warm, approachable, RTO-focused", bg: "#2563eb", accent: "#16a34a" },
];

const STEPS = [
  { id: 1, icon: Store, label: "Store Name", desc: "Name & URL" },
  { id: 2, icon: Image, label: "Logo", desc: "Brand image" },
  { id: 3, icon: Palette, label: "Style", desc: "Colors & theme" },
  { id: 4, icon: Type, label: "Content", desc: "Headlines & copy" },
  { id: 5, icon: Settings, label: "Settings", desc: "Display options" },
  { id: 6, icon: Rocket, label: "Publish", desc: "Go live!" },
];

const inputClass = "w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 text-sm transition-all";

export default function HostBrandBuilder() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [stripeJustConnected, setStripeJustConnected] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const emailToken = urlParams.get("token");
  const stripeConnected = urlParams.get("stripe_connected");
  const stripeStep = urlParams.get("step");

  const { data: hosts = [] } = useQuery({
    queryKey: ["my-host", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user?.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const { data: brandList = [], isLoading } = useQuery({
    queryKey: ["host-brand", host?.id],
    queryFn: () => base44.entities.HostBrandSettings.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });
  const existingBrand = brandList[0];

  const { data: vehicles = [] } = useQuery({
    queryKey: ["host-vehicles", host?.id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id, approval_status: "approved" }),
    enabled: !!host?.id,
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["host-bookings-count", host?.id],
    queryFn: () => base44.entities.BookingRequest.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const defaultSlug = host?.business_name?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "";

  const [form, setForm] = useState({
    business_slug: "", business_display_name: "", logo_url: "", cover_image_url: "",
    brand_color: "#e91e8c", secondary_color: "#7c3aed", font_style: "inter",
    layout_template: "modern", hero_title: "", hero_subtitle: "", about_text: "",
    cta_button_text: "Book Now", show_reviews: true, show_rto_options: true,
    show_weekly_pricing: true, show_rent_for_free: true, show_marketplace_vehicles: false,
    show_activity_tab: true, show_support_tab: true,
  });

  useEffect(() => {
    if (existingBrand) {
      setForm(f => ({ ...f, ...existingBrand }));
    } else if (host) {
      setForm(f => ({ ...f, business_slug: defaultSlug, business_display_name: host.business_name || host.full_name || "" }));
    }
  }, [existingBrand, host]);

  // Handle return from Stripe Connect via HostPayouts redirect
  useEffect(() => {
    if (!stripeConnected) return;
    setStripeJustConnected(true);
    // Navigate to publish step (6) if score is enough, otherwise stay and show score
    const targetStep = stripeStep === "6" ? 6 : 6; // Always go to publish/score step
    setCurrentStep(targetStep);
    // Clean up URL
    window.history.replaceState({}, "", window.location.pathname);
  }, [stripeConnected]); // eslint-disable-line

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: (data) => existingBrand
      ? base44.entities.HostBrandSettings.update(existingBrand.id, data)
      : base44.entities.HostBrandSettings.create({ ...data, host_id: host.id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["host-brand"] }),
  });

  const handleSave = async () => {
    setSaving(true);
    await saveMutation.mutateAsync({ ...form });
    setSaving(false);
  };

  const handlePublish = async () => {
    setPublishing(true);
    const score = computeScore();
    if (score < 60) {
      setPublishing(false);
      return;
    }
    await saveMutation.mutateAsync({ ...form, published_status: "live", last_published_at: new Date().toISOString() });
    await base44.entities.Host.update(host.id, { store_published: true, brand_builder_token: null });
    qc.invalidateQueries({ queryKey: ["host-brand"] });
    setPublishing(false);
    // Fire confetti then redirect to live store
    confetti({ particleCount: 200, spread: 120, origin: { y: 0.5 }, colors: ["#e91e8c", "#7c3aed", "#f59e0b", "#10b981"] });
    setTimeout(() => {
      if (form.business_slug) window.location.href = `/host/${form.business_slug}`;
    }, 1800);
  };

  const handleUnpublish = async () => {
    await saveMutation.mutateAsync({ ...form, published_status: "draft" });
    await base44.entities.Host.update(host.id, { store_published: false });
    qc.invalidateQueries({ queryKey: ["host-brand"] });
  };

  const handleUpload = async (e, field) => {
    const file = e.target.files[0];
    if (!file) return;
    field === "logo_url" ? setUploadingLogo(true) : setUploadingCover(true);
    const res = await uploadFile(file);
    set(field, res.file_url);
    field === "logo_url" ? setUploadingLogo(false) : setUploadingCover(false);
  };

  const applyAI = (aiResult) => setForm(f => ({ ...f, ...aiResult }));
  const applyGeneratedLogo = (url) => set("logo_url", url);
  const applyGeneratedIcon = (url) => set("logo_url", url);

  const computeScore = () => {
    let s = 0;
    if (form.logo_url) s += 15;
    if (form.hero_title) s += 10;
    if (form.about_text) s += 15;
    if (vehicles.length >= 3) s += 25;
    if (host?.stripe_onboarding_complete) s += 20;
    if (bookings.length > 0) s += 15;
    return s;
  };

  const isLive = existingBrand?.published_status === "live";
  const tokenIsValid = !emailToken || (host?.brand_builder_token === emailToken);
  const linkExpired = emailToken && (!tokenIsValid || isLive);

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-gray-200 border-t-pink-500 rounded-full animate-spin" />
    </div>
  );

  if (linkExpired) return (
    <div className="flex flex-col items-center justify-center py-24 text-center max-w-sm mx-auto">
      <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-5">
        <Globe className="h-8 w-8 text-gray-400" />
      </div>
      <h2 className="text-xl font-black text-gray-900 mb-2">This link has expired</h2>
      <p className="text-gray-400 text-sm mb-6">Your store is already live! This one-time setup link is no longer valid.</p>
      {existingBrand?.business_slug && (
        <a href={`/host/${existingBrand.business_slug}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold text-white shadow-sm"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          <ExternalLink className="h-4 w-4" /> View My Live Store
        </a>
      )}
    </div>
  );

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <HostPageHeader
        title="Brand Builder"
        subtitle="Build your storefront in minutes — follow the steps below"
        action={
          <div className="flex gap-2">
            {form.business_slug && (
              <a href={`/host/${form.business_slug}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white/70 hover:text-white border border-white/20 transition-all">
                <Eye className="h-4 w-4" /> Preview
              </a>
            )}
          </div>
        }
      />

      {/* Live banner */}
      {isLive && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-emerald-800">🎉 Your store is LIVE!</p>
            <p className="text-xs text-emerald-600">Customers can find and book from your store right now.</p>
          </div>
          <a href={`/host/${form.business_slug}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-900 whitespace-nowrap">
            Visit <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {/* Progress Steps */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {STEPS.map((step, i) => {
            const isActive = currentStep === step.id;
            const isDone = currentStep > step.id;
            return (
              <React.Fragment key={step.id}>
                <button
                  onClick={() => setCurrentStep(step.id)}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-all flex-shrink-0 ${
                    isActive ? "bg-pink-50 border border-pink-200" : isDone ? "opacity-60 hover:opacity-100" : "opacity-40 hover:opacity-70"
                  }`}
                >
                  <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${
                    isDone ? "bg-emerald-500" : isActive ? "" : "bg-gray-100"
                  }`}
                    style={isActive ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : {}}>
                    {isDone
                      ? <CheckCircle2 className="h-4 w-4 text-white" />
                      : <step.icon className={`h-4 w-4 ${isActive ? "text-white" : "text-gray-400"}`} />
                    }
                  </div>
                  <span className={`text-[10px] font-bold whitespace-nowrap ${isActive ? "text-pink-600" : isDone ? "text-emerald-600" : "text-gray-400"}`}>
                    {step.label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="h-3 w-3 text-gray-300 flex-shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>
        {/* Step subtitle */}
        <p className="text-xs text-gray-400 mt-3 px-1">
          Step {currentStep} of {STEPS.length} — <span className="font-semibold text-gray-600">{STEPS[currentStep - 1].desc}</span>
        </p>
      </div>

      {/* ── STEP 1: Store Name & URL ── */}
      {currentStep === 1 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div className="text-center pb-2">
            <div className="h-14 w-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              <Store className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-xl font-black text-gray-900">What's your store called?</h2>
            <p className="text-gray-400 text-sm mt-1">This is what customers will see when they visit your page</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Store Display Name *</label>
            <input className={inputClass} value={form.business_display_name}
              onChange={e => set("business_display_name", e.target.value)}
              placeholder="e.g. Elixre Luxury Rentals" />
            <p className="text-xs text-gray-400 mt-1.5">This name appears on your storefront, social media links, and marketing</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Your Store URL *</label>
            <div className="flex items-center rounded-2xl bg-gray-50 border border-gray-200 focus-within:border-pink-400 focus-within:ring-2 focus-within:ring-pink-100 overflow-hidden transition-all">
              <span className="px-4 py-3 text-xs text-gray-400 font-mono bg-gray-100 border-r border-gray-200 whitespace-nowrap">uridehub.com/host/</span>
              <input className="flex-1 py-3 px-3 bg-transparent text-sm text-gray-900 focus:outline-none font-medium"
                value={form.business_slug}
                onChange={e => set("business_slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="my-rental-store" />
            </div>
            {form.business_slug && (
              <p className="text-xs text-emerald-600 font-semibold mt-1.5">✓ Your link: uridehub.com/host/{form.business_slug}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Book Now Button Text</label>
            <input className={inputClass} value={form.cta_button_text}
              onChange={e => set("cta_button_text", e.target.value)}
              placeholder="Book Now" />
          </div>

          {/* AI Brand Builder */}
          <div className="pt-2">
            <AIBrandBuilder host={host} vehicles={vehicles} onApply={applyAI} />
          </div>
        </div>
      )}

      {/* ── STEP 2: Logo ── */}
      {currentStep === 2 && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="text-center pb-4">
              <div className="h-14 w-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(265 80% 62%), hsl(338 90% 56%))" }}>
                <Image className="h-7 w-7 text-white" />
              </div>
              <h2 className="text-xl font-black text-gray-900">Add your logo</h2>
              <p className="text-gray-400 text-sm mt-1">Generate one with AI or upload your own — takes 30 seconds</p>
            </div>

            {/* Upload Your Own Logo — prominent section */}
            <div className="rounded-2xl border-2 border-dashed border-pink-200 bg-pink-50 p-4 mb-4">
              <p className="text-xs font-bold text-pink-700 uppercase tracking-wider mb-3">📁 Option 1 — Upload Your Own</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2">Logo</label>
                  {form.logo_url && (
                    <img src={form.logo_url} alt="logo" className="h-16 w-16 rounded-xl object-cover mb-2 border border-gray-200 shadow-sm" />
                  )}
                  <label className="cursor-pointer flex items-center gap-2 px-3 py-3 rounded-xl bg-white border-2 border-pink-200 text-sm font-bold text-pink-600 hover:border-pink-400 hover:bg-pink-50 transition-all w-full justify-center">
                    {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {form.logo_url ? "Change Logo" : "Upload Logo"}
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload(e, "logo_url")} />
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2">Cover Photo</label>
                  {form.cover_image_url && (
                    <img src={form.cover_image_url} alt="cover" className="h-16 w-full rounded-xl object-cover mb-2 border border-gray-200 shadow-sm" />
                  )}
                  <label className="cursor-pointer flex items-center gap-2 px-3 py-3 rounded-xl bg-white border-2 border-pink-200 text-sm font-bold text-pink-600 hover:border-pink-400 hover:bg-pink-50 transition-all w-full justify-center">
                    {uploadingCover ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {form.cover_image_url ? "Change Cover" : "Upload Cover"}
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload(e, "cover_image_url")} />
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs font-bold text-gray-400 uppercase">✨ Option 2 — Generate with AI</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
          </div>

          <LogoIconGenerator host={host} brand={form} onApplyLogo={applyGeneratedLogo} onApplyIcon={applyGeneratedIcon} />
        </div>
      )}

      {/* ── STEP 3: Colors & Style ── */}
      {currentStep === 3 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div className="text-center pb-2">
            <div className="h-14 w-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              <Palette className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-xl font-black text-gray-900">Pick your style</h2>
            <p className="text-gray-400 text-sm mt-1">Choose a theme that matches your brand's personality</p>
          </div>

          {/* Template selection */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Choose a Theme</label>
            <div className="grid grid-cols-2 gap-3">
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => { set("layout_template", t.id); set("brand_color", t.bg); set("secondary_color", t.accent); }}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${form.layout_template === t.id ? "border-pink-400 bg-pink-50 shadow-sm" : "border-gray-200 hover:border-gray-300"}`}>
                  <div className="h-8 w-full rounded-xl mb-3" style={{ background: `linear-gradient(135deg, ${t.bg}, ${t.accent})` }} />
                  <p className="text-sm font-bold text-gray-900">{t.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t.desc}</p>
                  {form.layout_template === t.id && (
                    <div className="flex items-center gap-1 mt-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-pink-500" />
                      <span className="text-xs font-bold text-pink-600">Selected</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Custom colors */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Custom Colors (optional)</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500 mb-1.5">Primary Color</p>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.brand_color} onChange={e => set("brand_color", e.target.value)}
                    className="h-10 w-14 rounded-xl border border-gray-200 cursor-pointer p-1" />
                  <input className="flex-1 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700 focus:outline-none"
                    value={form.brand_color} onChange={e => set("brand_color", e.target.value)} />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1.5">Secondary Color</p>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.secondary_color} onChange={e => set("secondary_color", e.target.value)}
                    className="h-10 w-14 rounded-xl border border-gray-200 cursor-pointer p-1" />
                  <input className="flex-1 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700 focus:outline-none"
                    value={form.secondary_color} onChange={e => set("secondary_color", e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* Preview swatch */}
          <div className="rounded-2xl overflow-hidden border border-gray-200">
            <div className="h-16 flex items-center justify-center text-white font-bold text-sm"
              style={{ background: `linear-gradient(135deg, ${form.brand_color}, ${form.secondary_color})` }}>
              {form.business_display_name || "Your Store Name"}
            </div>
            <div className="px-4 py-3 bg-gray-50">
              <p className="text-xs text-gray-400 text-center">Live preview of your brand colors</p>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 4: Content ── */}
      {currentStep === 4 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div className="text-center pb-2">
            <div className="h-14 w-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              <Type className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-xl font-black text-gray-900">What do you want to say?</h2>
            <p className="text-gray-400 text-sm mt-1">These headlines are what customers read first — make them count</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Main Headline</label>
            <input className={inputClass} value={form.hero_title}
              onChange={e => set("hero_title", e.target.value)}
              placeholder="e.g. Premium Vehicles, Zero Hassle" />
            <p className="text-xs text-gray-400 mt-1">The first thing customers see — make it bold and clear</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Subtitle</label>
            <input className={inputClass} value={form.hero_subtitle}
              onChange={e => set("hero_subtitle", e.target.value)}
              placeholder="e.g. Flexible weekly rentals. No credit check. On the road in 24 hours." />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">About Your Business</label>
            <textarea className={inputClass} rows={4} value={form.about_text}
              onChange={e => set("about_text", e.target.value)}
              placeholder="Tell customers who you are, how long you've been in business, and what makes you different..." />
            <p className="text-xs text-gray-400 mt-1">This builds trust — even 2-3 sentences makes a big difference</p>
          </div>
        </div>
      )}

      {/* ── STEP 5: Settings ── */}
      {currentStep === 5 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="text-center pb-2">
            <div className="h-14 w-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              <Settings className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-xl font-black text-gray-900">What should customers see?</h2>
            <p className="text-gray-400 text-sm mt-1">Toggle on or off what shows on your storefront</p>
          </div>

          <div className="space-y-3">
            {[
              { key: "show_reviews", label: "⭐ Customer Reviews", desc: "Show star ratings from past renters" },
              { key: "show_rto_options", label: "🔑 Rent-to-Own", desc: "Highlight vehicles available for RTO" },
              { key: "show_weekly_pricing", label: "💰 Weekly Pricing", desc: "Show weekly rates on vehicle cards" },
              { key: "show_rent_for_free", label: "🎁 Referral Banner", desc: "Show the 'Rent for Free' referral section" },
              { key: "show_activity_tab", label: "📋 Activity Tab", desc: "Show the Activity tab in navigation" },
              { key: "show_support_tab", label: "💬 Support Chat", desc: "Show the AI Support chat tab" },
              { key: "show_marketplace_vehicles", label: "🌐 Marketplace Vehicles", desc: "Also show vehicles from other hosts" },
            ].map(t => (
              <div key={t.key} className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${form[t.key] ? "border-pink-200 bg-pink-50" : "border-gray-100 bg-gray-50"}`}
                onClick={() => set(t.key, !form[t.key])}>
                <div>
                  <p className="text-sm font-bold text-gray-900">{t.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t.desc}</p>
                </div>
                <div className={`relative h-6 w-11 rounded-full flex-shrink-0 transition-all ${form[t.key] ? "bg-pink-500" : "bg-gray-300"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${form[t.key] ? "left-5" : "left-0.5"}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 6: Publish ── */}
      {currentStep === 6 && (
        <div className="space-y-4">
          {/* Stripe just connected banner */}
          {stripeJustConnected && (
            <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-emerald-800 text-sm">🎉 Stripe Connected! +20 points earned</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  {computeScore() >= 60
                    ? "You've reached 60+ points — your store is ready to publish!"
                    : `You now have ${computeScore()} points. Complete a few more items to unlock publishing.`}
                </p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="text-center pb-4">
              <div className="h-14 w-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                <Rocket className="h-7 w-7 text-white" />
              </div>
              <h2 className="text-xl font-black text-gray-900">{isLive ? "Your Store is Live! 🎉" : "Ready to go live?"}</h2>
              <p className="text-gray-400 text-sm mt-1">{isLive ? "Customers can find and book from your store right now." : "Save a draft anytime, or publish when you're ready"}</p>
            </div>

            {/* Summary */}
            <div className="space-y-2 mb-6">
              {[
                { label: "Store Name", value: form.business_display_name || "Not set", done: !!form.business_display_name },
                { label: "URL", value: form.business_slug ? `uridehub.com/host/${form.business_slug}` : "Not set", done: !!form.business_slug },
                { label: "Logo", value: form.logo_url ? "Uploaded ✓" : "Not added", done: !!form.logo_url },
                { label: "Headline", value: form.hero_title || "Not set", done: !!form.hero_title },
                { label: "Theme", value: form.layout_template || "Not set", done: !!form.layout_template },
              ].map((item, i) => (
                <div key={i} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${item.done ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"}`}>
                  <span className="text-xs font-bold text-gray-600">{item.label}</span>
                  <span className={`text-xs font-semibold truncate max-w-[160px] ${item.done ? "text-emerald-700" : "text-red-500"}`}>{item.value}</span>
                </div>
              ))}
            </div>

            <StoreScoreWidget brand={form} host={host} vehicleCount={vehicles.length} bookingCount={bookings.length} onGoToStep={setCurrentStep} />

            <div className="space-y-3 mt-6">
              <button onClick={handleSave} disabled={saving}
                className="w-full py-3.5 rounded-2xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-2 transition-all">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? "Saving…" : "💾 Save Draft"}
              </button>

              {isLive ? (
                <div className="space-y-2">
                  <a href={`/host/${form.business_slug}`} target="_blank" rel="noreferrer"
                    className="w-full py-3.5 rounded-2xl font-bold text-white flex items-center justify-center gap-2 shadow-lg"
                    style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                    <ExternalLink className="h-4 w-4" /> Visit My Live Store
                  </a>
                  <button onClick={handleUnpublish}
                    className="w-full py-3 rounded-2xl font-semibold text-red-600 bg-red-50 hover:bg-red-100 text-sm transition-all">
                    Unpublish Store
                  </button>
                </div>
              ) : computeScore() >= 60 ? (
                <button onClick={handlePublish} disabled={publishing}
                  className="w-full py-3.5 rounded-2xl font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                  style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                  {publishing ? "Publishing…" : "🚀 Publish My Store Now"}
                </button>
              ) : (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-center">
                  <p className="text-sm font-bold text-amber-800 mb-1">Almost there!</p>
                  <p className="text-xs text-amber-700">Complete more steps above to reach 60 points and unlock publishing.</p>
                </div>
              )}
            </div>
          </div>

          {isLive && <QRShareCard slug={form.business_slug} hostId={host?.id} />}

          <HostCustomDomainManager host={host} brand={form} />
        </div>
      )}

      {/* ── GO LIVE BANNER — visible on all steps when score ≥ 60 and not yet live ── */}
      {!isLive && computeScore() >= 60 && currentStep !== 6 && (
        <div className="rounded-2xl p-4 flex items-center gap-3 shadow-lg animate-pulse-glow"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          <Rocket className="h-6 w-6 text-white flex-shrink-0" />
          <div className="flex-1">
            <p className="text-white font-black text-sm">🎉 You're ready to launch!</p>
            <p className="text-white/70 text-xs">Your store score is 60+ — go live now!</p>
          </div>
          <button
            onClick={() => setCurrentStep(6)}
            className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-white font-black text-sm"
            style={{ color: "hsl(338 90% 56%)" }}>
            Go Live 🚀
          </button>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center gap-3 pb-4">
        {currentStep > 1 && (
          <button onClick={() => setCurrentStep(s => s - 1)}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl font-semibold text-sm text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-all">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
        )}
        <button onClick={async () => {
          await handleSave();
          if (currentStep < STEPS.length) setCurrentStep(s => s + 1);
        }} disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm text-white disabled:opacity-50 shadow-sm transition-all"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? "Saving…" : currentStep < STEPS.length ? <>Save & Continue <ChevronRight className="h-4 w-4" /></> : "Done ✓"}
        </button>
      </div>
    </div>
  );
}