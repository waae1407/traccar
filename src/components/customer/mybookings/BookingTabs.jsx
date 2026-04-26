import React from "react";

export default function BookingTabs({ activeTab, setActiveTab, activeCount, pastCount }) {
  return (
    <div className="flex gap-2 px-4 pt-4 pb-2">
      <button
        onClick={() => setActiveTab("active")}
        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
          activeTab === "active"
            ? "text-white shadow-sm"
            : "text-gray-400 bg-gray-100"
        }`}
        style={activeTab === "active" ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : {}}
      >
        Active
        {activeCount > 0 && (
          <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === "active" ? "bg-white/20 text-white" : "bg-gray-300 text-gray-600"}`}>
            {activeCount}
          </span>
        )}
      </button>
      <button
        onClick={() => setActiveTab("past")}
        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
          activeTab === "past"
            ? "text-white shadow-sm"
            : "text-gray-400 bg-gray-100"
        }`}
        style={activeTab === "past" ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : {}}
      >
        Past Rentals
        {pastCount > 0 && (
          <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === "past" ? "bg-white/20 text-white" : "bg-gray-300 text-gray-600"}`}>
            {pastCount}
          </span>
        )}
      </button>
    </div>
  );
}