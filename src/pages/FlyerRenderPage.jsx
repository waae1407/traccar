import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import FlyerPlate from "@/components/marketing/flyer/FlyerPlate";
import { FLYER_W, FLYER_H, INK, LANDSCAPE_BG } from "@/lib/marketing/flyerAssets";
import { PLATFORM_CANVAS } from "@/lib/marketing/platformAssets";

/**
 * Deterministic render surface for the backend renderer. Draws exactly one
 * platform canvas (the master flyer centred on the brand background, never
 * stretched) at its true pixel size, then flags the document ready once every
 * font and image has decoded. No layout depends on a measurement pass, so the
 * screenshot is identical on every run.
 */
export default function FlyerRenderPage() {
  const params = new URLSearchParams(window.location.search);
  const campaignId = params.get("campaign");
  const platform = params.get("platform") || "instagram";
  const spec = PLATFORM_CANVAS[platform] || PLATFORM_CANVAS.instagram;
  const [preset, setPreset] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.invoke("getFlyerRenderSpec", { campaign_id: campaignId });
        if (!cancelled) setPreset(res.data?.preset || null);
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.error || e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  useEffect(() => {
    if (!preset) return undefined;
    document.documentElement.style.margin = "0";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    document.body.style.background = INK;
    let alive = true;
    (async () => {
      await document.fonts?.ready?.catch(() => {});
      const hero = new Image();
      hero.src = LANDSCAPE_BG;
      await hero.decode().catch(() => {});
      const images = Array.from(document.images);
      await Promise.all(
        images.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
              })
        )
      );
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (alive) document.body.dataset.flyerReady = "true";
    })();
    return () => {
      alive = false;
      delete document.body.dataset.flyerReady;
    };
  }, [preset]);

  const scale = Math.min(spec.width / FLYER_W, spec.height / FLYER_H);
  const left = (spec.width - FLYER_W * scale) / 2;
  const top = (spec.height - FLYER_H * scale) / 2;

  return (
    <div
      style={{
        width: spec.width,
        height: spec.height,
        background: INK,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {preset && (
        <div
          style={{
            position: "absolute",
            left,
            top,
            width: FLYER_W,
            height: FLYER_H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <FlyerPlate preset={preset} />
        </div>
      )}
      {error && <p style={{ color: "#fff", fontFamily: "Inter, sans-serif", padding: 40 }}>{error}</p>}
    </div>
  );
}