import React, { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { exportFlyerPng } from "@/lib/marketing/flyerExport";
import { useToast } from "@/components/ui/use-toast";

export default function FlyerDownloadButton({ stageId, fileName }) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const download = async () => {
    setBusy(true);
    try {
      await exportFlyerPng(document.getElementById(stageId), fileName);
    } catch (error) {
      toast({
        title: "Could not export the flyer",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Download className="h-3 w-3" />
      )}
      {busy ? "Building" : "PNG"}
    </button>
  );
}