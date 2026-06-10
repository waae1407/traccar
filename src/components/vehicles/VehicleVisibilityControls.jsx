import React from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ExternalLink } from "lucide-react";

/**
 * Plan-aware vehicle visibility section for the host vehicle form.
 *
 * Marketplace Partner: both channels auto/locked — no toggles
 * Hybrid Growth:       both channels host-controlled
 * FleetOS Professional: storefront host-controlled; marketplace blocked by plan — no toggle, shows plan-switch note
 */
export default function VehicleVisibilityControls({ form, onChange, planMode, hybridSubscriptionActive = true }) {
  const navigate = useNavigate();
  const isMarketplacePartner = planMode === "marketplace_partner" || !planMode;
  const isFleetOS = planMode === "fleetos_professional";
  const isHybrid = planMode === "hybrid_growth";

  const Toggle = ({ field, disabled }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(field, !form[field])}
      className={`relative h-5 w-9 rounded-full transition-all flex-shrink-0 ${
        disabled ? "opacity-40 cursor-not-allowed" : ""
      } ${form[field] ? "bg-primary" : "bg-white/10"}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${form[field] ? "left-4" : "left-0.5"}`} />
    </button>
  );

  return (
    <div className="space-y-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
      <p className="text-xs font-bold text-white/50 uppercase tracking-wider">👁 Vehicle Visibility</p>

      {/* ── MARKETPLACE PARTNER ── */}
      {isMarketplacePartner && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/70">uRide Marketplace</p>
              <p className="text-[10px] text-emerald-400/80">Automatically listed — Marketplace Partner benefit</p>
            </div>
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-full">
              <Lock className="h-2.5 w-2.5" /> Auto
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/70">Host Storefront</p>
              <p className="text-[10px] text-emerald-400/80">Automatically visible</p>
            </div>
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-full">
              <Lock className="h-2.5 w-2.5" /> Auto
            </span>
          </div>
        </>
      )}

      {/* ── HYBRID GROWTH ── */}
      {isHybrid && (
        <>
          {/* Storefront */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Show on My Storefront</p>
              <p className="text-[10px] text-white/30">Visible on your branded storefront page</p>
            </div>
            <Toggle field="storefront_visible" />
          </div>

          {/* Marketplace */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Show on uRide Marketplace</p>
              {!hybridSubscriptionActive && (
                <p className="text-[10px] text-amber-400/80">Activate Hybrid Growth to enable marketplace listing</p>
              )}
            </div>
            {hybridSubscriptionActive ? (
              <Toggle field="marketplace_visible" />
            ) : (
              <button
                type="button"
                onClick={() => navigate("/host/business-operations")}
                className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-full hover:bg-amber-400/20 transition-all"
              >
                Activate Hybrid
              </button>
            )}
          </div>
        </>
      )}

      {/* ── FLEETOS PROFESSIONAL ── */}
      {isFleetOS && (
        <>
          {/* Storefront — editable */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Show on My Storefront</p>
              <p className="text-[10px] text-white/30">Visible on your branded storefront page</p>
            </div>
            <Toggle field="storefront_visible" />
          </div>

          {/* Marketplace — locked with plan-switch note */}
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-white/30 flex-shrink-0" />
              <p className="text-sm text-white/50">uRide Marketplace</p>
              <span className="text-[10px] font-bold text-white/30 bg-white/5 px-2 py-0.5 rounded-full">Not Available</span>
            </div>
            <p className="text-[10px] text-white/35 leading-relaxed">
              FleetOS Professional is for private and storefront operations. To list vehicles on the uRide Marketplace, switch to Marketplace Partner or Hybrid Growth.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => navigate("/host/business-operations")}
                className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-2.5 py-1.5 rounded-lg hover:bg-primary/20 transition-all"
              >
                <ExternalLink className="h-2.5 w-2.5" /> Change Plan
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}