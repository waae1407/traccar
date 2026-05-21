import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Globe, CheckCircle2, Clock, EyeOff, ExternalLink, RefreshCw, Search } from "lucide-react";

const STATUS_CONFIG = {
  live:    { label: "Live",    color: "text-emerald-400", bg: "bg-emerald-500/20 border-emerald-500/30", dot: "bg-emerald-400" },
  preview: { label: "Preview", color: "text-blue-400",    bg: "bg-blue-500/20 border-blue-500/30",       dot: "bg-blue-400" },
  draft:   { label: "Draft",   color: "text-muted-foreground", bg: "bg-muted/30 border-border",          dot: "bg-muted-foreground/40" },
};

export default function StorefrontsTab() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const { data: brands = [], isLoading, refetch } = useQuery({
    queryKey: ["ops-storefronts"],
    queryFn: () => base44.entities.HostBrandSettings.list("-updated_date", 200),
    staleTime: 60_000,
  });

  const { data: hosts = [] } = useQuery({
    queryKey: ["ops-hosts-simple"],
    queryFn: () => base44.entities.Host.list("-created_date", 200),
    staleTime: 300_000,
  });

  const hostMap = Object.fromEntries(hosts.map(h => [h.id, h]));

  const filtered = brands.filter(b => {
    if (filter === "live" && b.published_status !== "live") return false;
    if (filter === "draft" && b.published_status !== "draft") return false;
    if (search) {
      const q = search.toLowerCase();
      if (!b.business_display_name?.toLowerCase().includes(q) && !b.business_slug?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const liveCount = brands.filter(b => b.published_status === "live").length;
  const previewCount = brands.filter(b => b.published_status === "preview").length;
  const draftCount = brands.filter(b => b.published_status === "draft").length;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">Host Storefronts</h2>
          <p className="text-xs text-muted-foreground mt-0.5">White-label storefront status across all fleet partners.</p>
        </div>
        <button onClick={refetch} className="h-8 w-8 rounded-xl bg-muted/40 border border-border flex items-center justify-center hover:bg-muted/60">
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass rounded-xl p-3 text-center border border-emerald-500/20">
          <p className="text-2xl font-black text-emerald-400">{liveCount}</p>
          <p className="text-[10px] text-muted-foreground font-semibold">Live</p>
        </div>
        <div className="glass rounded-xl p-3 text-center border border-blue-500/20">
          <p className="text-2xl font-black text-blue-400">{previewCount}</p>
          <p className="text-[10px] text-muted-foreground font-semibold">Preview</p>
        </div>
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-muted-foreground">{draftCount}</p>
          <p className="text-[10px] text-muted-foreground font-semibold">Draft</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search store name or slug..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-muted/40 border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary" />
        </div>
        {["all", "live", "draft"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all flex-shrink-0 ${
              filter === f ? "text-white" : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
            }`}
            style={filter === f ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : {}}>
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 glass rounded-2xl">
          <Globe className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No storefronts found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(brand => {
            const st = STATUS_CONFIG[brand.published_status] || STATUS_CONFIG.draft;
            const host = hostMap[brand.host_id];
            const storeUrl = `/host/${brand.business_slug}`;
            return (
              <div key={brand.id} className="glass rounded-xl p-4 border border-border flex items-center gap-4">
                <div className={`h-2 w-2 rounded-full flex-shrink-0 ${st.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-bold text-foreground truncate">
                      {brand.business_display_name || brand.business_slug}
                    </p>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${st.bg} ${st.color}`}>
                      {st.label}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono">/{brand.business_slug}</p>
                  {host && <p className="text-[10px] text-muted-foreground mt-0.5">{host.full_name || host.email}</p>}
                  {brand.store_score > 0 && (
                    <p className="text-[10px] text-primary/70 mt-0.5">Store score: {brand.store_score}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {brand.published_status === "live" && (
                    <a href={storeUrl} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> View
                    </a>
                  )}
                  {brand.last_published_at && (
                    <p className="text-[9px] text-muted-foreground">
                      Published {new Date(brand.last_published_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}