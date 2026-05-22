import React from "react";

export default function OperationalMobileToolbar({ children }) {
  if (!children) return null;
  return (
    <div className="lg:hidden sticky bottom-3 z-20 rounded-2xl border border-white/[0.1] bg-background/90 backdrop-blur-xl p-2 shadow-card flex gap-2 overflow-x-auto no-scrollbar">
      {children}
    </div>
  );
}