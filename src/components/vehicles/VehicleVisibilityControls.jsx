import React from "react";

/**
 * Plan-aware vehicle visibility toggles.
 * planMode: 'marketplace_partner' | 'hybrid_growth' | 'fleetos_professional'
 */
export default function VehicleVisibilityControls({ form, onChange, planMode }) {
  const isMarketplacePartner = planMode === "marketplace_partner" || !planMode;
  const isFleetOS = planMode === "fleetos_professional";

  const toggle = (field) => (
    <button
      type="button"
      onClick={() => onChange(field, !form[field])}
      className={`relative h-5 w-9 rounded-full transition-all flex-shrink-0 ${form[field] ? "bg-primary" : "bg-white/10"}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${form[field] ? "left-4" : "left-0.5"}`} />
    </button>
  );

  return (
    <div className="space-y-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
      <p className="text-xs font-bold text-white/50 uppercase tracking-wider">👁 Vehicle Visibility</p>

      {/* Storefront toggle — always visible */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-white/60">Visible on My Storefront</p>
          <p className="text-[10px] text-white/30">Show this vehicle on your branded storefront</p>
        </div>
        {toggle("storefront_visible")}
      </div>

      {/* Marketplace toggle — hidden for Marketplace Partner */}
      {isMarketplacePartner ? (
        <div className="flex items-center justify-between opacity-60">
          <div>
            <p className="text-sm text-white/60">Visible on uRide Marketplace</p>
            <p className="text-[10px] text-emerald-400/70">Automatic — Marketplace Partners are always listed</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">Auto</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/60">Visible on uRide Marketplace</p>
            {isFleetOS && (
              <p className="text-[10px] text-white/30">FleetOS vehicles are private by default. Enable to list publicly.</p>
            )}
          </div>
          {toggle("marketplace_visible")}
        </div>
      )}
    </div>
  );
}