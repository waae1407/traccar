import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ImageDown } from "lucide-react";

export default function PrepareAssetsButton({ campaign, onDone }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const ready = Boolean(campaign.assets?.instagram?.url && campaign.assets?.facebook_pages?.url);

  const prepare = async () => {
    setBusy(true);
    setMessage("Rendering flyer in the backend…");
    try {
      const res = await base44.functions.invoke("marketingRenderFlyer", { campaign_id: campaign.id, force: true });
      const results = res.data?.results || [];
      setMessage(
        results.map((item) => `${item.platform}: ${item.ok ? `${item.width}×${item.height}` : item.error}`).join(" · ") || "Done"
      );
      await onDone?.();
    } catch (error) {
      setMessage(error?.response?.data?.error || error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Button size="sm" variant={ready ? "outline" : "default"} disabled={busy} onClick={prepare} className="w-full">
        <ImageDown className="w-4 h-4 mr-1" />
        {busy ? message : ready ? "Re-render platform images" : "Render Instagram + Facebook flyers"}
      </Button>
      {!busy && message && <p className="text-[11px] text-muted-foreground mt-2">{message}</p>}
      <p className="text-[11px] text-muted-foreground mt-2">
        Rendered server-side from the approved master: Instagram 1080×1350, Facebook 1080×1080. Images are uploaded to public
        storage (stored publicly — anyone with the link can open them) because the platforms fetch them by URL.
      </p>
    </div>
  );
}