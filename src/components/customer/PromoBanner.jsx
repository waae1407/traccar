import React from "react";
import { Zap } from "lucide-react";

const banners = [
  { tag: "LIMITED OFFER", title: "First Week Free", sub: "On any Rent-to-Own contract", gradient: "from-pink-600 to-purple-600" },
  { tag: "NEW CITY", title: "Now in Houston", sub: "50+ vehicles available today", gradient: "from-blue-600 to-cyan-500" },
  { tag: "REFER & EARN", title: "Get $50 Credit", sub: "For every friend you refer", gradient: "from-green-600 to-teal-500" },
];

export default function PromoBanner() {
  const banner = banners[0];
  return (
    <div className="mx-4 mt-6">
      <div className={`rounded-2xl p-4 bg-gradient-to-r ${banner.gradient} text-white overflow-hidden relative`}>
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
        <div className="absolute -right-8 bottom-0 h-16 w-16 rounded-full bg-white/10" />
        <div className="relative">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap className="h-3 w-3 fill-yellow-300 text-yellow-300" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">{banner.tag}</span>
          </div>
          <p className="font-bold text-xl leading-tight">{banner.title}</p>
          <p className="text-sm text-white/70 mt-0.5">{banner.sub}</p>
          <button className="mt-3 px-4 py-1.5 bg-white rounded-full text-xs font-bold text-gray-900 hover:bg-gray-100 transition-colors">
            Learn More
          </button>
        </div>
      </div>
    </div>
  );
}