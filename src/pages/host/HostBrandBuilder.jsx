import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Globe, Eye, CheckCircle2, Upload, Loader2, ExternalLink } from "lucide-react";
import HostPageHeader from "@/components/host/HostPageHeader";
import StoreScoreWidget from "@/components/host/brand/StoreScoreWidget";
import AIBrandBuilder from "@/components/host/brand/AIBrandBuilder";
import QRShareCard from "@/components/host/brand/QRShareCard";
import LogoIconGenerator from "@/components/host/brand/LogoIconGenerator";

const TEMPLATES = [
  { id: "prestige", label: "Prestige", desc: "Dark luxury, gold accents", bg: "#0f0c29", accent: "#c9a84c" },
  { id: "modern", label: "Modern", desc: "Clean white, vibrant gradient", bg: "#e91e8c", accent: "#7c3aed" },
  { id: "street", label: "Street", desc: "Bold, high-energy, urban", bg: "#ff3000", accent: "#1a1a1a" },
  { id: "family", label: "Family", desc: "Warm, approachable, RTO-focused", bg: "#2563eb", accent: "#16a34a" },
];

const inputClass = "w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-pink-400 text-sm transition-all";

export default function HostBrandBuilder() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Check for one-time email token in URL
  const urlParams = new URLSearchParams(window.location.search);
  const emailToken = urlParams.get("token");

  const { data: hosts = [] } = useQuery({ queryKey: ["my-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user?.email }), enabled: !!user?.email });
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
    cta_button_text: "Book Now", show_reviews: true, show_rto_options: true, show_weekly_pricing: true,
    show_rent_for_free: true, show_marketplace_vehicles: false, show_activity_tab: true, show_support_tab: true,
  });

  useEffect(() => {
    if (existingBrand) {
      setForm(f => ({ ...f, ...existingBrand }));
    } else if (host) {
      setForm(f => ({ ...f, business_slug: defaultSlug, business_display_name: host.business_name || host.full_name || "" }));
    }
  }, [existingBrand, host]);

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
    if (score < 60) { alert("You need a store score of at least 60 to publish."); setPublishing(false); return; }
    await saveMutation.mutateAsync({ ...form, published_status: "live", last_published_at: new Date().toISOString() });
    await base44.entities.Host.update(host.id, { store_published: true, brand_builder_token: null });
    qc.invalidateQueries({ queryKey: ["host-brand"] });
    setPublishing(false);
    // 🎉 Open their new live store in a new tab
    if (form.business_slug) {
      window.open(`/host/${form.business_slug}`, "_blank");
    }
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
    const res = await base44.integrations.Core.UploadFile({ file });
    set(field, res.file_url);
    field === "logo_url" ? setUploadingLogo(false) : setUploadingCover(false);
  };

  const applyAI = (aiResult) => setForm(f => ({ ...f, ...aiResult }));
  const applyGeneratedLogo = (url) => set("logo_url", url);
  const applyGeneratedIcon = (url) => set("logo_url", url); // icon also sets logo_url as the brand mark

  const computeScore = () => {
    let s = 0;
    if (form.logo_url) s += 15;
    if (form.cover_image_url) s += 10;
    if (form.hero_title) s += 10;
    if (form.about_text) s += 10;
    if (vehicles.length >= 3) s += 20;
    if (host?.stripe_onboarding_complete) s += 20;
    if (bookings.length > 0) s += 15;
    return s;
  };

  const isLive = existingBrand?.published_status === "live";

  // If arrived via email token, validate it — if store is already live or token doesn't match, show dead link
  const tokenIsValid = !emailToken || (host?.brand_builder_token === emailToken);
  const linkExpired = emailToken && (!tokenIsValid || isLive);

  if (isLoading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-gray-200 border-t-pink-500 rounded-full animate-spin" /></div>;

  if (linkExpired) return (
    <div className="flex flex-col items-center justify-center py-24 text-center max-w-sm mx-auto">
      <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-5">
        <Globe className="h-8 w-8 text-gray-400" />
      </div>
      <h2 className="text-xl font-black text-gray-900 mb-2" style={{ fontFamily: "var(--font-syne)" }}>This link has expired</h2>
      <p className="text-gray-400 text-sm mb-6">Your store is already live! This one-time setup link is no longer valid.</p>
      {existingBrand?.business_slug && (
        <a href={`/host/${existingBrand.business_slug}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold text-white shadow-sm"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          <ExternalLink className="h-4 w-4" /> View My Live Store
        </a>
      )}
      <a href="/host/brand" className="mt-3 text-xs text-gray-400 underline hover:text-gray-600">Go to Brand Builder</a>
    </div>
  );

  return (
    <div className="space-y-5">
      <HostPageHeader
        title="Brand Builder"
        subtitle="Design your public storefront"
        action={<div className="flex gap-2">
          {form.business_slug && (
            <a href={`/host/${form.business_slug}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-all">
              <Eye className="h-4 w-4" /> Preview
            </a>
          )}
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save Draft
          </button>
          {isLive
            ? <button onClick={handleUnpublish} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100">Unpublish</button>
            : <button onClick={handlePublish} disabled={publishing} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 shadow-sm"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />} Publish
              </button>}
        </div>} />

      {isLive && (
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <p className="text-sm font-bold text-emerald-800">Your store is LIVE</p>
          <a href={`/host/${form.business_slug}`} target="_blank" rel="noreferrer"
            className="ml-auto flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-900">
            Visit Store <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Left: Form */}
        <div className="lg:col-span-2 space-y-4">
          {/* AI Builder */}
          <AIBrandBuilder host={host} vehicles={vehicles} onApply={applyAI} />

          {/* Basic Info */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h3 className="font-bold text-gray-900">Basic Info</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Display Name</label>
                <input className={inputClass} value={form.business_display_name} onChange={e => set("business_display_name", e.target.value)} placeholder="Luxury Rentals LA" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">URL Slug</label>
                <div className="flex items-center rounded-xl bg-gray-50 border border-gray-200 focus-within:border-pink-400 overflow-hidden">
                  <span className="px-3 text-xs text-gray-400 font-mono whitespace-nowrap">/host/</span>
                  <input className="flex-1 py-2.5 pr-3 bg-transparent text-sm text-gray-900 focus:outline-none" value={form.business_slug}
                    onChange={e => set("business_slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="my-rental-store" />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">CTA Button Text</label>
              <input className={inputClass} value={form.cta_button_text} onChange={e => set("cta_button_text", e.target.value)} placeholder="Book Now" />
            </div>
          </div>

          {/* Logo & Icon Generator */}
          <LogoIconGenerator host={host} brand={form} onApplyLogo={applyGeneratedLogo} onApplyIcon={applyGeneratedIcon} />

          {/* Images */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h3 className="font-bold text-gray-900">Images</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Logo</label>
                {form.logo_url && <img src={form.logo_url} alt="logo" className="h-16 w-16 rounded-xl object-cover mb-2 border border-gray-200" />}
                <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-all w-fit">
                  {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {form.logo_url ? "Change Logo" : "Upload Logo"}
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload(e, "logo_url")} />
                </label>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Cover Image</label>
                {form.cover_image_url && <img src={form.cover_image_url} alt="cover" className="h-16 w-full rounded-xl object-cover mb-2 border border-gray-200" />}
                <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-all w-fit">
                  {uploadingCover ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {form.cover_image_url ? "Change Cover" : "Upload Cover"}
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload(e, "cover_image_url")} />
                </label>
              </div>
            </div>
          </div>

          {/* Colors & Template */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h3 className="font-bold text-gray-900">Brand Style</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Primary Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.brand_color} onChange={e => set("brand_color", e.target.value)} className="h-10 w-14 rounded-lg border border-gray-200 cursor-pointer p-1" />
                  <input className={inputClass} value={form.brand_color} onChange={e => set("brand_color", e.target.value)} placeholder="#e91e8c" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Secondary Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.secondary_color} onChange={e => set("secondary_color", e.target.value)} className="h-10 w-14 rounded-lg border border-gray-200 cursor-pointer p-1" />
                  <input className={inputClass} value={form.secondary_color} onChange={e => set("secondary_color", e.target.value)} placeholder="#7c3aed" />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2">Layout Template</label>
              <div className="grid grid-cols-2 gap-2">
                {TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => { set("layout_template", t.id); set("brand_color", t.bg); set("secondary_color", t.accent); }}
                    className={`p-3 rounded-2xl border-2 text-left transition-all ${form.layout_template === t.id ? "border-pink-400 bg-pink-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <div className="h-4 w-full rounded-md mb-2" style={{ background: `linear-gradient(135deg, ${t.bg}, ${t.accent})` }} />
                    <p className="text-xs font-bold text-gray-900">{t.label}</p>
                    <p className="text-[10px] text-gray-400">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h3 className="font-bold text-gray-900">Content</h3>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Hero Title</label>
              <input className={inputClass} value={form.hero_title} onChange={e => set("hero_title", e.target.value)} placeholder="Premium Vehicles for Every Journey" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Hero Subtitle</label>
              <input className={inputClass} value={form.hero_subtitle} onChange={e => set("hero_subtitle", e.target.value)} placeholder="Flexible rentals. No credit check. On the road in 24 hours." />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">About Section</label>
              <textarea className={inputClass} rows={4} value={form.about_text} onChange={e => set("about_text", e.target.value)} placeholder="Tell customers about your rental business..." />
            </div>
          </div>

          {/* Toggles */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <h3 className="font-bold text-gray-900">Display Options</h3>
            {[
              { key: "show_reviews", label: "Show customer reviews" },
              { key: "show_rto_options", label: "Highlight rent-to-own vehicles" },
              { key: "show_weekly_pricing", label: "Show weekly pricing" },
              { key: "show_rent_for_free", label: "Show Rent for Free referral banner" },
              { key: "show_activity_tab", label: "Show Activity tab in bottom nav" },
              { key: "show_support_tab", label: "Show Support (AI chat) tab" },
              { key: "show_marketplace_vehicles", label: "Show uRideHub marketplace vehicles (all hosts)" },
            ].map(t => (
              <div key={t.key} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{t.label}</span>
                <button onClick={() => set(t.key, !form[t.key])}
                  className={`relative h-5 w-9 rounded-full transition-all ${form[t.key] ? "bg-pink-500" : "bg-gray-300"}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${form[t.key] ? "left-4" : "left-0.5"}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Widgets */}
        <div className="space-y-4">
          <StoreScoreWidget brand={form} host={host} vehicleCount={vehicles.length} bookingCount={bookings.length} />
          <QRShareCard slug={form.business_slug} />
        </div>
      </div>
    </div>
  );
}