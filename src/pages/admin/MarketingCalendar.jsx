import React, { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CampaignCard from "@/components/marketing/campaign/CampaignCard";
import CampaignReviewDrawer from "@/components/marketing/campaign/CampaignReviewDrawer";
import { planCampaigns } from "@/lib/marketing/marketingEngine";

function nextStartDate(campaigns) {
  if (!campaigns.length) return undefined;
  const last = campaigns[campaigns.length - 1].campaign_date;
  const date = new Date(`${last}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function weekLabel(startDate, index) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Week ${index + 1} · ${fmt(start)} – ${fmt(end)}`;
}

export default function MarketingCalendar() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = async () => {
    const page = await base44.entities.MarketingCampaign.filter(
      {},
      { sort: "campaign_date", limit: 120 }
    );
    setCampaigns(page.items);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(
    () => ({
      proposed: campaigns.filter((item) => item.status === "proposed").length,
      approved: campaigns.filter((item) => item.status === "approved").length,
      rejected: campaigns.filter((item) => item.status === "rejected").length,
    }),
    [campaigns]
  );

  const generate = async () => {
    setBusy(true);
    try {
      const planned = planCampaigns({ days: 30, startDate: nextStartDate(campaigns), history: campaigns });
      await base44.entities.MarketingCampaign.bulkCreate(planned);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const save = async (id, patch) => {
    await base44.entities.MarketingCampaign.update(id, patch);
    await load();
  };

  const setStatus = async (id, status) => {
    await base44.entities.MarketingCampaign.update(id, {
      status,
      reviewed_at: new Date().toISOString(),
    });
    await load();
  };

  const regenerate = async (campaign) => {
    const history = campaigns.filter((item) => item.id !== campaign.id);
    const [next] = planCampaigns({
      days: 1,
      startDate: campaign.campaign_date,
      history,
    });
    await base44.entities.MarketingCampaign.update(campaign.id, {
      ...next,
      day_index: campaign.day_index,
      status: "proposed",
      reviewed_at: null,
    });
    await load();
  };

  const openCampaign = campaigns.find((item) => item.id === openId) || null;
  const weeks = [];
  for (let i = 0; i < campaigns.length; i += 7) weeks.push(campaigns.slice(i, i + 7));

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-syne text-2xl font-bold">Marketing Calendar</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            One campaign per day, drawn from verified platform features. Nothing publishes on its
            own: every campaign waits for approval here.
          </p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" />
          {busy ? "Building 30 days…" : "Generate next 30 days"}
        </button>
      </header>

      <div className="grid grid-cols-3 gap-2">
        {[
          ["Proposed", counts.proposed, "text-blue-300"],
          ["Approved", counts.approved, "text-emerald-300"],
          ["Rejected", counts.rejected, "text-red-300"],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-xl border border-border bg-card px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {label}
            </p>
            <p className={`text-xl font-bold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading campaigns…</p>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="font-syne text-lg font-bold">No campaigns yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Generate the first 30 days to see the full plan: features, angles, headlines, captions
            and a finished flyer for every day.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {weeks.map((week, index) => (
            <section key={week[0].id} className="space-y-2">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {weekLabel(week[0].campaign_date, index)}
              </h2>
              {week.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  onOpen={() => setOpenId(campaign.id)}
                />
              ))}
            </section>
          ))}
        </div>
      )}

      {openCampaign && (
        <CampaignReviewDrawer
          campaign={openCampaign}
          onClose={() => setOpenId(null)}
          onSave={save}
          onStatus={setStatus}
          onRegenerate={regenerate}
        />
      )}
    </div>
  );
}