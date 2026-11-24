import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import Flyer from "@/components/marketing/flyer/Flyer";
import { campaignToPreset } from "@/lib/marketing/marketingEngine";
import { FLYER_W } from "@/lib/marketing/flyerAssets";
import { PLATFORM_CANVAS, captureFlyer, composePlatformCanvas, canvasToBlob } from "@/lib/marketing/platformAssets";
import { Button } from "@/components/ui/button";
import { ImageDown } from "lucide-react";

export default function PrepareAssetsButton({ campaign, onDone }) {
  const stageRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const preset = campaignToPreset(campaign);
  const ready = Object.keys(PLATFORM_CANVAS).every((key) => campaign.assets?.[key]?.url);

  const prepare = async () => {
    setBusy(true);
    setMessage("Rendering flyer…");
    try {
      const node = stageRef.current?.firstChild;
      const source = await captureFlyer(node);
      const assets = { ...(campaign.assets || {}) };

      for (const spec of Object.values(PLATFORM_CANVAS)) {
        setMessage(`Building ${spec.label} image…`);
        const canvas = composePlatformCanvas(source, spec);
        const blob = await canvasToBlob(canvas);
        const file = new File([blob], `${campaign.feature_key}-${spec.platform}-${campaign.campaign_date}.png`, { type: "image/png" });
        const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
        assets[spec.platform] = { url: file_url, width: spec.width, height: spec.height };
      }

      await base44.entities.MarketingCampaign.update(campaign.id, { assets });
      const list = await base44.entities.CampaignPublication.filter({ campaign_id: campaign.id });
      const publications = list.items || list;
      for (const publication of publications) {
        const asset = assets[publication.platform];
        if (asset) {
          await base44.entities.CampaignPublication.update(publication.id, {
            image_url: asset.url,
            image_width: asset.width,
            image_height: asset.height,
          });
        }
      }
      setMessage("Platform images ready");
      await onDone?.();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div
        ref={stageRef}
        aria-hidden
        style={{ position: "fixed", left: -20000, top: 0, width: FLYER_W, pointerEvents: "none", opacity: 0 }}
      >
        <Flyer preset={preset} />
      </div>
      <Button size="sm" variant={ready ? "outline" : "default"} disabled={busy} onClick={prepare} className="w-full">
        <ImageDown className="w-4 h-4 mr-1" />
        {busy ? message : ready ? "Rebuild platform images" : "Generate 3 platform images"}
      </Button>
      {!busy && message && <p className="text-[11px] text-muted-foreground mt-2">{message}</p>}
      <p className="text-[11px] text-muted-foreground mt-2">
        Instagram 1080×1350, Facebook 1080×1080, X 1200×628. Images are uploaded to public storage (stored publicly — anyone with the link can open them) because the platforms fetch them by URL.
      </p>
    </div>
  );
}