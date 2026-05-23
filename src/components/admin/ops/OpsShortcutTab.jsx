import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function OpsShortcutTab({ title, description, href, cta = "Open workspace", items = [] }) {
  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-5">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Summary &amp; Shortcut</p>
        <h2 className="text-lg font-black text-foreground" style={{ fontFamily: "var(--font-syne)" }}>{title}</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>
        <Link to={href} className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          {cta} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      {items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.label} className="rounded-2xl border border-border/60 bg-card/40 p-4">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{item.label}</p>
              <p className="text-sm text-foreground mt-2">{item.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}