import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, Loader2, Download, CheckCircle2, Image, Zap, Lock, CreditCard, X } from "lucide-react";

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
  const [cardNumber, setCardNumber] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [error, setError] = useState(null);

  const generationsUsed = host?.logo_generations_used || 0;
  const remainingFree = Math.max(0, FREE_LIMIT - generationsUsed);
  const isFree = generationsUsed < FREE_LIMIT;

  const generate = async (paymentMethodId = null) => {
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
  };

  const handleApply = () => {
    if (!generatedUrl) return;
    if (activeTab === "logo") onApplyLogo(generatedUrl);
    else onApplyIcon(generatedUrl);
  };

  const handleDownload = async () => {
    if (!generatedUrl) return;
    const a = document.createElement("a");
    a.href = generatedUrl;
    a.download = `${host?.business_name || "logo"}-${activeTab}.png`;
    a.target = "_blank";
    a.click();
  };

  const handlePaidGenerate = async () => {
    // Use Stripe.js to tokenize card — for simplicity, show message to use saved card
    // In production this would use Stripe Elements; here we call with a placeholder
    // and the backend handles it. We collect via Stripe's payment element if available.
    setPaymentLoading(true);
    setError(null);
    try {
      // Load Stripe and create payment method from card details
      const { loadStripe } = await import("@stripe/stripe-js");
      const pubKeyRes = await base44.functions.invoke("stripePublishableKey", {});
      const stripeObj = await loadStripe(pubKeyRes.data.publishable_key);
      const { paymentMethod, error: pmError } = await stripeObj.createPaymentMethod({
        type: "card",
        card: {
          number: cardNumber.replace(/\s/g, ""),
          exp_month: parseInt(cardExp.split("/")[0]),
          exp_year: parseInt("20" + cardExp.split("/")[1]),
          cvc: cardCvc,
        },
      });
      if (pmError) { setError(pmError.message); setPaymentLoading(false); return; }
      setShowPayment(false);
      setPaymentLoading(false);
      await generate(paymentMethod.id);
    } catch (err) {
      setError(err.message);
      setPaymentLoading(false);
    }
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
        <button onClick={() => generate()} disabled={loading}
          className="w-full py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
          style={{ background: "linear-gradient(135deg, hsl(265 80% 62%), hsl(338 90% 56%))" }}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Sparkles className="h-4 w-4" /> Generate {activeTab === "logo" ? "Logo" : "Icon"}{!isFree ? " — $5.00" : " (Free)"}</>}
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
                <div key={i} className="group relative">
                  <img src={url} alt="" className="h-14 w-14 rounded-xl object-cover border border-gray-200 cursor-pointer hover:border-pink-400 transition-all"
                    onClick={() => setGeneratedUrl(url)} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>Unlock Generation</h3>
                <p className="text-xs text-gray-400 mt-0.5">You've used your 2 free generations</p>
              </div>
              <button onClick={() => setShowPayment(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-br from-pink-50 to-purple-50 border border-pink-100 text-center">
              <p className="text-3xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>$5.00</p>
              <p className="text-xs text-gray-500 mt-1">per additional generation</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Card Number</label>
                <input className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-pink-400"
                  placeholder="1234 5678 9012 3456" value={cardNumber}
                  onChange={e => setCardNumber(e.target.value.replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim().slice(0, 19))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Expiry</label>
                  <input className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-pink-400"
                    placeholder="MM/YY" value={cardExp}
                    onChange={e => {
                      let v = e.target.value.replace(/\D/g, "");
                      if (v.length >= 2) v = v.slice(0, 2) + "/" + v.slice(2, 4);
                      setCardExp(v);
                    }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">CVC</label>
                  <input className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-pink-400"
                    placeholder="123" value={cardCvc} onChange={e => setCardCvc(e.target.value.slice(0, 4))} />
                </div>
              </div>
            </div>

            {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

            <button onClick={handlePaidGenerate} disabled={paymentLoading || !cardNumber || !cardExp || !cardCvc}
              className="w-full py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              {paymentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              {paymentLoading ? "Processing…" : "Pay $5.00 & Generate"}
            </button>
            <p className="text-[10px] text-gray-400 text-center">Secured by Stripe · Your card is charged once per generation</p>
          </div>
        </div>
      )}
    </div>
  );
}