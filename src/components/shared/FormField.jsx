import React from "react";

export function FormField({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-white/40">
        {label}{required && <span className="text-primary ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

export const inputClass = "w-full h-9 px-3 rounded-xl text-sm bg-white/[0.06] border border-white/[0.1] text-white placeholder:text-white/25 focus:outline-none focus:border-primary/60 focus:bg-white/[0.08] transition-all";

export const selectTriggerClass = "w-full h-9 px-3 rounded-xl text-sm bg-white/[0.06] border border-white/[0.1] text-white focus:outline-none focus:border-primary/60 transition-all";

export const textareaClass = "w-full px-3 py-2 rounded-xl text-sm bg-white/[0.06] border border-white/[0.1] text-white placeholder:text-white/25 focus:outline-none focus:border-primary/60 focus:bg-white/[0.08] transition-all resize-none";