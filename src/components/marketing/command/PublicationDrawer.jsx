import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import Flyer from "@/components/marketing/flyer/Flyer";
import { campaignToPreset } from "@/lib/marketing/marketingEngine";

export default function PublicationDrawer({ publication, open, onClose, onChanged }) {
  const [campaign, setCampaign] = useState(null);
  const [caption, setCaption] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!publication) return;
    setCaption(publication.caption || "");
    setMessage("");
    setWhen("");
    base44.entities.MarketingCampaign.get(publication.campaign_id)
      .then(setCampaign)
      .catch(() => setCampaign(null));
  }, [publication]);

  if (!publication) return null;

  const control = async (payload, label) => {
    setBusy(label);
    setMessage("");
    try {
      const res = await base44.functions.invoke("marketingControl", { action: payload.action, publication_ids: [publication.id], ...payload });
      setMessage(`${label} done`);
      await onChanged();
      return res.data;
    } catch (error) {
      setMessage(error?.response?.data?.error || error.message);
      return null;
    } finally {
      setBusy("");
    }
  };

  const publishNow = async () => {
    setBusy("publish");
    setMessage("Publishing…");
    try {
      const res = await base44.functions.invoke("marketingPublish", { publication_id: publication.id });
      setMessage(res.data?.post_url ? `Published: ${res.data.post_url}` : "Published");
      await onChanged();
    } catch (error) {
      setMessage(error?.response?.data?.error || error.message);
      await onChanged();
    } finally {
      setBusy("");
    }
  };

  const saveCaption = async () => {
    setBusy("save");
    await base44.entities.CampaignPublication.update(publication.id, { caption });
    setMessage("Caption saved");
    await onChanged();
    setBusy("");
  };

  const regenerate = async () => {
    setBusy("regenerate");
    setMessage("Regenerating campaign…");
    try {
      await base44.functions.invoke("marketingGenerateCampaign", { date: publication.campaign_date, force: true });
      setMessage("Campaign regenerated");
      await onChanged();
      onClose();
    } catch (error) {
      setMessage(error?.response?.data?.error || error.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-3xl bg-card">
        <DialogHeader>
          <DialogTitle className="font-syne">
            {publication.platform.replace("_pages", "")} · {publication.campaign_date}
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-[220px_1fr] gap-4 max-h-[70vh] overflow-y-auto">
          <div>
            {campaign ? (
              <div className="rounded-lg overflow-hidden">
                <Flyer preset={campaignToPreset(campaign)} />
              </div>
            ) : (
              <div className="aspect-[1199/1312] rounded-lg bg-muted" />
            )}
            {publication.image_url && (
              <a href={publication.image_url} target="_blank" rel="noreferrer" className="text-xs text-primary mt-2 inline-block">
                Download platform image
              </a>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>Status: {String(publication.status).replace(/_/g, " ")}</span>
              <span>Attempts: {publication.attempt_count || 0}</span>
              {publication.scheduled_for && <span>Scheduled: {new Date(publication.scheduled_for).toLocaleString()}</span>}
              {publication.external_post_id && <span>Post ID: {publication.external_post_id}</span>}
            </div>

            <Textarea value={caption} onChange={(event) => setCaption(event.target.value)} rows={8} className="text-sm" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy === "save"} onClick={saveCaption}>Save caption</Button>
              <Button size="sm" variant="outline" disabled={busy === "regenerate"} onClick={regenerate}>Regenerate campaign</Button>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-border/60">
              <Button size="sm" disabled={busy === "approve"} onClick={() => control({ action: "approve" }, "Approve")}>Approve</Button>
              <Button size="sm" variant="outline" disabled={busy === "reject"} onClick={() => control({ action: "reject", reason: "Rejected in command centre" }, "Reject")}>Reject</Button>
              <Button size="sm" variant="outline" disabled={busy === "cancel"} onClick={() => control({ action: "cancel" }, "Cancel")}>Cancel</Button>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-muted-foreground">
                Schedule for
                <Input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} className="mt-1 h-8" />
              </label>
              <Button size="sm" variant="outline" disabled={!when || busy === "schedule"} onClick={() => control({ action: "schedule", scheduled_for: new Date(when).toISOString() }, "Schedule")}>
                Schedule
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-border/60">
              <Button size="sm" disabled={busy === "publish"} onClick={publishNow}>Publish now</Button>
              <Button size="sm" variant="outline" disabled={busy === "retry"} onClick={() => control({ action: "retry" }, "Retry")}>Retry</Button>
            </div>

            {publication.post_url && (
              <a href={publication.post_url} target="_blank" rel="noreferrer" className="text-xs text-primary block">
                View published post
              </a>
            )}
            {message && <p className="text-xs text-muted-foreground">{message}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}