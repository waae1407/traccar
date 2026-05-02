import React from "react";

export default function BookingTabs({ activeTab, setActiveTab, activeCount, pastCount }) {
  return (
    <div className="relative overflow-hidden" style={{ background: "linear-gradient(160deg, #0f0c29 0%, #302b63 60%, #24243e 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 100%, hsl(338 90% 56% / 0.2) 0%, transparent 70%)" }} />
      <div className="relative z-10 px-5 pt-6 pb-5">
        <h1 className="text-2xl font-black text-white mb-4" style={{ fontFamily: "var(--font-syne)" }}>My Rentals</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("active")}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all ${
              activeTab === "active" ? "text-white shadow-md" : "text-white/40 bg-white/10"
            }`}
            style={activeTab === "active" ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : {}}
          >
            Active
            {activeCount > 0 && (
              <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === "active" ? "bg-white/25 text-white" : "bg-white/10 text-white/40"}`}>
                {activeCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("past")}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all ${
              activeTab === "past" ? "text-white shadow-md" : "text-white/40 bg-white/10"
            }`}
            style={activeTab === "past" ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : {}}
          >
            Past Rentals
            {pastCount > 0 && (
              <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === "past" ? "bg-white/25 text-white" : "bg-white/10 text-white/40"}`}>
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