import React, { useState } from "react";
import { CheckCircle2, Copy, ExternalLink, Share2 } from "lucide-react";
import { Link } from "react-router-dom";

export default function StorefrontSuccessPanel({ result }) {
  const [copied, setCopied] = useState(false);
  const url = result?.storefront_url || "";

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const share = async () => {
    if (navigator.share) await navigator.share({ title: "My uRide Store", url });
    else await copy();
  };

  return (
    <div className="rounded-3xl text-white p-6 shadow-xl" style={{ background: "linear-gradient(160deg, #0f0c29 0%, #302b63 55%, #e91e8c 130%)" }}>
      <div className="h-14 w-14 rounded-2xl bg-white/15 flex items-center justify-center mb-5">
        <CheckCircle2 className="h-8 w-8 text-emerald-300" />
      </div>
      <p className="text-sm font-black uppercase tracking-[0.22em] text-white/50 mb-2">🚀</p>
      <h1 className="text-4xl font-black" style={{ fontFamily: "var(--font-syne)" }}>Your Storefront Is Live</h1>
      <p className="text-white/70 text-lg mt-2 font-semibold">{result?.store_name}</p>
      
      <div className="mt-6 rounded-2xl bg-white/10 border border-white/10 p-4">
        <p className="text-xs text-white/45 uppercase font-black tracking-wider mb-2">Store URL</p>
        <p className="font-mono text-base break-all text-white">{url}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
        <a href={result?.storefront_path} target="_blank" rel="noreferrer" className="rounded-2xl bg-white text-gray-950 font-black text-sm py-3 flex items-center justify-center gap-2 hover:bg-gray-50">
          <ExternalLink className="h-4 w-4" /> Open Store
        </a>
        <button onClick={copy} className="rounded-2xl bg-white/10 border border-white/15 font-black text-sm py-3 flex items-center justify-center gap-2 hover:bg-white/20">
          <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy Link"}
        </button>
        <button onClick={share} className="rounded-2xl bg-white/10 border border-white/15 font-black text-sm py-3 flex items-center justify-center gap-2 hover:bg-white/20">
          <Share2 className="h-4 w-4" /> Share
        </button>
      </div>

      <div className="mt-6 rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
        <div>
          <p className="text-[11px] text-white/40 uppercase font-black tracking-wider">🚀 YOUR BUSINESS IS OPEN</p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="text-white/70 flex items-center gap-2"><span>✓</span> Live immediately</p>
          <p className="text-white/70 flex items-center gap-2"><span>✓</span> Customers can find you now</p>
          <p className="text-white/70 flex items-center gap-2"><span>✓</span> Add vehicles anytime</p>
          <p className="text-white/70 flex items-center gap-2"><span>✓</span> Connect Stripe & GPS later</p>
        </div>
        <p className="text-xs text-white/40 border-t border-white/10 pt-3">Start simple. Grow at your own pace.</p>
      </div>

      <Link to="/host/vehicles" className="mt-5 w-full rounded-2xl bg-pink-600 hover:bg-pink-700 font-black text-sm py-3 flex items-center justify-center">
        Add Your First Vehicle
      </Link>
    </div>
  );
}