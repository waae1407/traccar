import React, { useState } from "react";
import { Building2, ChevronDown, Globe, Check } from "lucide-react";
import { useTenant } from "@/lib/useTenant";
import { cn } from "@/lib/utils";

export default function TenantSwitcher({ collapsed }) {
  const { isSuperadmin, allCompanies, overrideCompanyId, setOverrideCompanyId, company } = useTenant();
  const [open, setOpen] = useState(false);

  if (!isSuperadmin) return null;

  const current = overrideCompanyId
    ? allCompanies.find(c => c.id === overrideCompanyId)
    : null;

  const label = current ? (current.display_name || current.company_name) : "All Companies";

  return (
    <div className="relative px-3 mb-2">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-sm",
          "border-primary/30 bg-primary/10 hover:bg-primary/15",
          collapsed && "justify-center px-2"
        )}>
        {current ? (
          <div className="h-5 w-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${current.primary_color || "#e91e8c"}, ${current.secondary_color || "#7c3aed"})` }}>
            {label.charAt(0)}
          </div>
        ) : (
          <Globe className="h-4 w-4 text-primary flex-shrink-0" />
        )}
        {!collapsed && (
          <>
            <span className="flex-1 text-left text-white/80 font-medium truncate text-xs">{label}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 text-white/40 transition-transform flex-shrink-0", open && "rotate-180")} />
          </>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-3 right-3 top-full mt-1 z-50 rounded-xl border border-white/10 shadow-2xl overflow-hidden"
            style={{ background: "hsl(222 28% 11%)" }}>
            {/* All companies option */}
            <button
              onClick={() => { setOverrideCompanyId(null); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.05] transition-colors text-left">
              <Globe className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="text-sm text-white flex-1">All Companies</span>
              {!overrideCompanyId && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
            <div className="border-t border-white/[0.06] my-0.5" />
            {allCompanies.map(c => (
              <button
                key={c.id}
                onClick={() => { setOverrideCompanyId(c.id); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.05] transition-colors text-left">
                <div className="h-5 w-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${c.primary_color || "#e91e8c"}, ${c.secondary_color || "#7c3aed"})` }}>
                  {(c.display_name || c.company_name).charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{c.display_name || c.company_name}</p>
                  <p className="text-[10px] text-white/35 capitalize">{c.subscription_plan} · {c.subscription_status}</p>
                </div>
                {overrideCompanyId === c.id && <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}