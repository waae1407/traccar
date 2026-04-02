import React from "react";
import { Plus } from "lucide-react";

export default function PageHeader({ count, countLabel, onAdd, addLabel, children }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        {count !== undefined && (
          <span className="text-xs font-medium text-white/35 uppercase tracking-wider">
            {count} {countLabel}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {children}
        {onAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all shadow-glow active:scale-95"
          >
            <Plus className="h-4 w-4" />
            {addLabel}
          </button>
        )}
      </div>
    </div>
  );
}