import React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function EmptyState({ icon: Icon, title, description, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl" />
        <div className="relative p-5 rounded-2xl border border-primary/20 bg-primary/10">
          <Icon className="h-8 w-8 text-primary" />
        </div>
      </div>
      <h3 className="text-xl font-syne font-bold text-white mb-2">{title}</h3>
      <p className="text-sm text-white/40 max-w-xs mb-8 leading-relaxed">{description}</p>
      {actionLabel && (
        <button
          onClick={onAction}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-opacity shadow-glow"
        >
          <Plus className="h-4 w-4" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}