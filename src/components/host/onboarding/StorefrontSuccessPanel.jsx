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
      <p className="text-xs font-black uppercase tracking-[0.2em] text-white/50">Your store is live</p>
      <h1 className="text-3xl font-black mt-2" style={{ fontFamily: "var(--font-syne)" }}>{result?.store_name}</h1>
      <div className="mt-5 rounded-2xl bg-white/10 border border-white/10 p-4">
        <p className="text-xs text-white/45 mb-1">Live URL</p>
        <p className="font-mono text-sm break-all">{url}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
        <button onClick={copy} className="rounded-2xl bg-white text-gray-950 font-black text-sm py-3 flex items-center justify-center gap-2">
          <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy Link"}
        </button>
        <a href={result?.storefront_path} target="_blank" rel="noreferrer" className="rounded-2xl bg-white/10 border border-white/15 font-black text-sm py-3 flex items-center justify-center gap-2">
          <ExternalLink className="h-4 w-4" /> Open Store
        </a>
        <button onClick={share} className="rounded-2xl bg-white/10 border border-white/15 font-black text-sm py-3 flex items-center justify-center gap-2">
          <Share2 className="h-4 w-4" /> Share Store
        </button>
      </div>
      <Link to="/host/vehicles" className="mt-4 w-full rounded-2xl bg-pink-600 hover:bg-pink-700 font-black text-sm py-3 flex items-center justify-center">
        Add your first vehicle
      </Link>
    </div>
  );
}