import React, { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { Check, Copy, Download, RefreshCw, X } from "lucide-react";
import Flyer from "@/components/marketing/flyer/Flyer";
import { campaignToPreset } from "@/lib/marketing/marketingEngine";

const COPY_FIELDS = [
  ["caption_instagram", "Instagram caption"],
  ["caption_facebook", "Facebook caption"],
  ["caption_x", "X caption"],
];

const EDIT_FIELDS = [
  ["headline", "Headline (use \\n for a line break)", "textarea"],
  ["kicker", "Kicker", "input"],
  ["description", "Supporting description", "textarea"],
];

export default function CampaignReviewDrawer({ campaign, onClose, onSave, onStatus, onRegenerate }) {
  const [draft, setDraft] = useState(campaign);
  const [saving, setSaving] = useState(false);
  const flyerRef = useRef(null);

  useEffect(() => setDraft(campaign), [campaign]);

  const set = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    await onSave(campaign.id, {
      headline: draft.headline,
      kicker: draft.kicker,
      description: draft.description,
      caption_instagram: draft.caption_instagram,
      caption_facebook: draft.caption_facebook,
      caption_x: draft.caption_x,
      source: "edited",
    });
    setSaving(false);
  };

  const download = async () => {
    if (!flyerRef.current) return;
    const canvas = await html2canvas(flyerRef.current, {
      backgroundColor: "#10141b",
      scale: 2,
      useCORS: true,
    });
    const link = document.createElement("a");
    link.download = `uride-${campaign.feature_key}-${campaign.campaign_date}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-4xl flex-col border-l border-border bg-background">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              {campaign.feature_label} · {campaign.angle_label}
            </p>
            <p className="text-sm font-semibold">{campaign.campaign_date}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <div className="space-y-3">
            <div ref={flyerRef} className="overflow-hidden rounded-xl border border-border">
              <Flyer preset={campaignToPreset(draft)} />
            </div>
            <button
              type="button"
              onClick={download}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-white/5"
            >
              <Download className="h-3.5 w-3.5" /> Download flyer (PNG)
            </button>
          </div>

          <div className="space-y-4">
            <section className="grid gap-2 rounded-xl border border-border bg-card p-3 text-xs sm:grid-cols-2">
              <Fact label="Audience" value={campaign.audience} />
              <Fact label="Objective" value={campaign.objective} />
              <Fact label="Pain point" value={campaign.pain_point} />
              <Fact label="CTA keyword" value={campaign.cta_keyword} />
            </section>

            <section className="space-y-2">
              {EDIT_FIELDS.map(([key, label, kind]) => (
                <label key={key} className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {label}
                  </span>
                  {kind === "textarea" ? (
                    <textarea
                      value={draft[key] || ""}
                      onChange={(event) => set(key, event.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs"
                    />
                  ) : (
                    <input
                      value={draft[key] || ""}
                      onChange={(event) => set(key, event.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs"
                    />
                  )}
                </label>
              ))}
            </section>

            <section className="space-y-2">
              {COPY_FIELDS.map(([key, label]) => (
                <div key={key} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      {label}
                    </p>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(draft[key] || "")}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </button>
                  </div>
                  <textarea
                    value={draft[key] || ""}
                    onChange={(event) => set(key, event.target.value)}
                    rows={key === "caption_x" ? 4 : 6}
                    className="mt-1.5 w-full resize-y rounded-lg border border-border bg-background px-2.5 py-2 text-xs leading-relaxed"
                  />
                  {key === "caption_x" && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {(draft[key] || "").length} / 280 characters
                    </p>
                  )}
                </div>
              ))}
            </section>
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-white/5 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save edits"}
          </button>
          <button
            type="button"
            onClick={() => onRegenerate(campaign)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-white/5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Regenerate
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => onStatus(campaign.id, "rejected")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20"
            >
              <X className="h-3.5 w-3.5" /> Reject
            </button>
            <button
              type="button"
              onClick={() => onStatus(campaign.id, "approved")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25"
            >
              <Check className="h-3.5 w-3.5" /> Approve
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs text-foreground/85">{value || "—"}</p>
    </div>
  );
}