import React from "react";

export default function BookingTabs({ activeTab, setActiveTab, activeCount, pastCount, brandColor, secondaryColor }) {
  const primary = brandColor || "#e91e8c";
  const secondary = secondaryColor || "#7c3aed";
  const gradient = `linear-gradient(135deg, ${primary}, ${secondary})`;

  return (
    <div className="relative overflow-hidden" style={{ background: gradient }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(255,255,255,0.1) 0%, transparent 70%)" }} />
      <div className="relative z-10 px-5 pt-6 pb-5">
        <h1 className="text-2xl font-black text-white mb-4" style={{ fontFamily: "var(--font-syne)" }}>My Rentals</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("active")}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all ${
              activeTab === "active" ? "text-white shadow-md bg-white/25" : "text-white/60 bg-white/15"
            }`}
          >
            Active
            {activeCount > 0 && (
              <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === "active" ? "bg-white/30 text-white" : "bg-white/10 text-white/50"}`}>
                {activeCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("past")}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all ${
              activeTab === "past" ? "text-white shadow-md bg-white/25" : "text-white/60 bg-white/15"
            }`}
          >
            Past Rentals
            {pastCount > 0 && (
              <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === "past" ? "bg-white/30 text-white" : "bg-white/10 text-white/50"}`}>
                {pastCount}
              </span>
            )}
          </button>
        </div>
      </div>
      <div className="h-5"><svg viewBox="0 0 375 20" fill="#f8f8fa" className="w-full" preserveAspectRatio="none"><path d="M0 20L375 20L375 5C300 18 180 1 0 12L0 20Z"/></svg></div>
    </div>
  );
}