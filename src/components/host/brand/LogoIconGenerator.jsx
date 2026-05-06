import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, Loader2, Download, CheckCircle2, Image, Zap, Lock } from "lucide-react";
import LogoPaymentModal from "./LogoPaymentModal";

const FREE_LIMIT = 2;

const STYLE_OPTIONS = [
  "Modern & Minimal",
  "Luxury & Prestige",
  "Bold & Urban",
  "Friendly & Approachable",
  "Tech Forward",
  "Classic & Elegant",
];

export default function LogoIconGenerator({ host, brand, onApplyLogo, onApplyIcon }) {
  const [activeTab, setActiveTab] = useState("logo");
  const [styleHint, setStyleHint] = useState("Modern & Minimal");
  const [logoPrompt, setLogoPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [applied, setApplied] = useState(false);
  const [applying, setApplying] = useState(false);

  const generationsUsed = host?.logo_generations_used || 0;
  const remainingFree = Math.max(0, FREE_LIMIT - generationsUsed);
  const isFree = generationsUsed < FREE_LIMIT;

  const runGeneration = async (paymentMethodId = null) => {
    setLoading(true);
    setError(null);
    setGeneratedUrl(null);
    try {
      const res = await base44.functions.invoke("generateHostLogo", {
        host_id: host.id,
        type: activeTab,
        business_name: brand?.business_display_name || host?.business_name,
        brand_color: brand?.brand_color || "#e91e8c",
        style_hint: styleHint,
        logo_prompt: logoPrompt || undefined,
        payment_method_id: paymentMethodId || undefined,
      });
      if (res.data?.error === "payment_required") {
        setShowPayment(true);
        setLoading(false);
        return;
      }
      setGeneratedUrl(res.data.image_url);
    } catch (err) {
      // Handle 402 gracefully
      if (err.message?.includes("402") || err.message?.includes("payment")) {
        setShowPayment(true);
      } else {
        setError(err.message);
      }
    }
    setLoading(false);
    setGenerating(false);
  };

  const handleGenerateClick = () => {
    if (!isFree) {
      setShowPayment(true);
    } else {
      runGeneration();
    }
  };

  const handlePaymentSuccess = async (paymentMethodId) => {
    setShowPayment(false);
    setGenerating(true);
    await runGeneration(paymentMethodId);
  };

  const handleApply = async () => {
    if (!generatedUrl || !host?.id) return;
    setApplying(true);
    try {
      // Notify parent
      if (activeTab === "logo") onApplyLogo(generatedUrl);
      else onApplyIcon(generatedUrl);

      // Save directly to DB
      const brandList = await base44.entities.HostBrandSettings.filter({ host_id: host.id });
      if (brandList[0]) {
        await base44.entities.HostBrandSettings.update(brandList[0].id, { logo_url: generatedUrl });
      } else {
        // Brand settings don't exist yet — create them
        await base44.entities.HostBrandSettings.create({ host_id: host.id, business_slug: host.business_name?.toLowerCase().replace(/[^a-z0-9]+/g, "-") || host.id, logo_url: generatedUrl });
      }
      setApplied(true);
      setTimeout(() => setApplied(false), 4000);
    } catch (e) {
      setError("Failed to apply logo: " + e.message);
    }
    setApplying(false);
  };

  const handleDownload = () => {
    if (!generatedUrl) return;
    const a = document.createElement("a");
    a.href = generatedUrl;
    a.download = `${host?.business_name || "logo"}-${activeTab}.png`;
    a.target = "_blank";
    a.click();
  };

  const previousItems = activeTab === "logo"
    ? (host?.generated_logos || [])
    : (host?.generated_icons || []);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(265 80% 62%), hsl(338 90% 56%))" }}>
            <Image className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm">AI Logo & Icon Generator</p>
            <p className="text-xs text-gray-400">Generated image auto-applies to your storefront</p>
          </div>
          <div className="ml-auto">
            {remainingFree > 0 ? (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                <Zap className="h-3 w-3" /> {remainingFree} free left
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200">
                <Lock className="h-3 w-3" /> $5 per gen
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 px-5">
        {["logo", "icon"].map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setGeneratedUrl(null); setError(null); }}
            className={`pb-2.5 mr-5 text-sm font-semibold capitalize border-b-2 transition-all ${activeTab === tab ? "border-pink-500 text-pink-600" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
            {tab === "logo" ? "🎨 Logo (with name)" : "⚡ Icon (symbol only)"}
          </button>
        ))}
      </div>

      <div className="p-5 space-y-4">

        {/* Custom prompt field */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            What do you want on your {activeTab}? *
          </label>
          <textarea
            className="w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 resize-none transition-all"
            rows={2}
            value={logoPrompt}
            onChange={e => setLogoPrompt(e.target.value)}
            placeholder={activeTab === "logo"
              ? "e.g. 'Elixre LLC — luxury car rental, gold and black, modern serif font'"
              : "e.g. 'A sleek car silhouette in gold on black — bold and minimal'"}
          />
          <p className="text-xs text-gray-400 mt-1">Be specific! Include your business name, colors, and style. More detail = better result.</p>
        </div>

        {/* Style picker */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Style Vibe</label>
          <div className="flex flex-wrap gap-2">
            {STYLE_OPTIONS.map(s => (
              <button key={s} onClick={() => setStyleHint(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${styleHint === s ? "text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                style={styleHint === s ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : {}}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Upgrade notice if out of free gens */}
        {!isFree && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
            <p className="text-sm font-bold text-amber-800 mb-1">🔒 Free generations used up</p>
            <p className="text-xs text-amber-700">You've used your 2 free generations. Additional logos are $5.00 each — click Generate below to unlock.</p>
          </div>
        )}

        {/* Generate button */}
        <button onClick={handleGenerateClick} disabled={loading || generating}
          className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm transition-all active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, hsl(265 80% 62%), hsl(338 90% 56%))" }}>
          {(loading || generating)
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating… (30–60 seconds)</>
            : <><Sparkles className="h-4 w-4" /> Generate {activeTab === "logo" ? "Logo" : "Icon"}{!isFree ? " — $5.00" : " (Free)"}</>}
        </button>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200">
            <p className="text-xs text-red-600 font-semibold">{error}</p>
          </div>
        )}

        {/* Result */}
        {generatedUrl && (
          <div className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center p-6">
              <img src={generatedUrl} alt="Generated" className="max-h-48 object-contain rounded-xl shadow-sm" />
              <div className="absolute top-2 right-2">
                <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500 text-white text-[10px] font-bold">
                  <CheckCircle2 className="h-3 w-3" /> Done!
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleApply} disabled={applying || applied}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-80"
                style={{ background: applied ? "linear-gradient(135deg, hsl(152 60% 46%), hsl(199 90% 54%))" : "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                {applying
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                  : applied
                  ? <><CheckCircle2 className="h-4 w-4" /> Logo Applied! ✓</>
                  : <><CheckCircle2 className="h-4 w-4" /> Apply to My Store</>}
              </button>
              <button onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all">
                <Download className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[10px] text-gray-400 text-center">PNG — use for social media, print, business cards & more</p>
          </div>
        )}

        {/* Previous generations */}
        {previousItems.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Previous Generations</p>
            <div className="flex flex-wrap gap-2">
              {previousItems.slice().reverse().map((url, i) => (
                <img key={i} src={url} alt="" className="h-14 w-14 rounded-xl object-cover border border-gray-200 cursor-pointer hover:border-pink-400 transition-all"
                  onClick={() => setGeneratedUrl(url)} />
              ))}
            </div>
          </div>
        )}
      </div>

      {showPayment && (
        <LogoPaymentModal
          onSuccess={handlePaymentSuccess}
          onCancel={() => setShowPayment(false)}
          generating={generating}
        />
      )}
    </div>
  );
}