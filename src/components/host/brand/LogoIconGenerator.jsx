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
  const [loading, setLoading] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [generating, setGenerating] = useState(false); // true when payment done, awaiting generation
  const [error, setError] = useState(null);

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
        payment_method_id: paymentMethodId || undefined,
      });
      if (res.data?.error === "payment_required") {
        setShowPayment(true);
        setLoading(false);
        return;
      }
      setGeneratedUrl(res.data.image_url);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
    setGenerating(false);
  };

  const handleGenerateClick = () => {
    if (!isFree) {
      // Show payment modal first before generating
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

  const handleApply = () => {
    if (!generatedUrl) return;
    if (activeTab === "logo") onApplyLogo(generatedUrl);
    else onApplyIcon(generatedUrl);
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
            <p className="text-xs text-gray-400">Auto-applies to your storefront and marketing</p>
          </div>
          <div className="ml-auto">
            {remainingFree > 0 ? (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                <Zap className="h-3 w-3" /> {remainingFree} free left
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 text-xs font-bold">
                <Lock className="h-3 w-3" /> $5 per generation
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 px-5">
        {["logo", "icon"].map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setGeneratedUrl(null); }}
            className={`pb-2.5 mr-5 text-sm font-semibold capitalize border-b-2 transition-all ${activeTab === tab ? "border-pink-500 text-pink-600" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
            {tab === "logo" ? "🎨 Logo (with name)" : "⚡ Icon (symbol only)"}
          </button>
        ))}
      </div>

      <div className="p-5 space-y-4">
        {/* Style picker */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">Style</label>
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

        {/* Generate button */}
        <button onClick={handleGenerateClick} disabled={loading || generating}
          className="w-full py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
          style={{ background: "linear-gradient(135deg, hsl(265 80% 62%), hsl(338 90% 56%))" }}>
          {(loading || generating)
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
            : <><Sparkles className="h-4 w-4" /> Generate {activeTab === "logo" ? "Logo" : "Icon"}{!isFree ? " — $5.00" : " (Free)"}</>}
        </button>

        {error && <p className="text-xs text-red-500 font-medium text-center">{error}</p>}

        {/* Result */}
        {generatedUrl && (
          <div className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center p-6">
              <img src={generatedUrl} alt="Generated" className="max-h-48 object-contain rounded-xl shadow-sm" />
              <div className="absolute top-2 right-2">
                <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500 text-white text-[10px] font-bold">
                  <CheckCircle2 className="h-3 w-3" /> Generated
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleApply}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 shadow-sm"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                <CheckCircle2 className="h-4 w-4" /> Apply to My Store
              </button>
              <button onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all">
                <Download className="h-4 w-4" /> Download
              </button>
            </div>
            <p className="text-[10px] text-gray-400 text-center">PNG file — use for social media, print, business cards, signage & more</p>
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

      {/* Payment Modal — shown before paid generation */}
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