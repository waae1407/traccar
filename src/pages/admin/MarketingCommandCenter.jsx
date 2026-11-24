import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { RefreshCw, CalendarDays } from "lucide-react";
import ModeControlCard from "@/components/marketing/command/ModeControlCard";
import SocialAccountsPanel from "@/components/marketing/command/SocialAccountsPanel";
import CampaignSlotCard from "@/components/marketing/command/CampaignSlotCard";
import PublicationQueue from "@/components/marketing/command/PublicationQueue";
import PublicationDrawer from "@/components/marketing/command/PublicationDrawer";
import PerformanceStrip from "@/components/marketing/command/PerformanceStrip";

export default function MarketingCommandCenter() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("marketingControl", { action: "get_state" });
      setState(res.data);
      setError("");
    } catch (caught) {
      setError(caught?.response?.data?.error || caught.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-8 w-64 rounded bg-muted animate-pulse" />
        <div className="grid md:grid-cols-2 gap-4 mt-6">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="h-48 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !state) {
    return <div className="p-6 text-sm text-red-400">Marketing state could not be loaded: {error}</div>;
  }

  const nextLabel = state.next_scheduled
    ? `${state.next_scheduled.platform.replace("_pages", "")} · ${new Date(state.next_scheduled.scheduled_for).toLocaleString()}`
    : "Nothing scheduled";

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-syne text-2xl font-bold">Marketing Command Center</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {state.today} · {state.feature_counts.total} features in the catalog, {state.feature_counts.unused} never used
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[11px] border-primary/40 text-primary">
            {state.mode} mode
          </Badge>
          {state.paused && <Badge variant="outline" className="text-[11px] border-yellow-500/40 text-yellow-400">paused</Badge>}
          {state.emergency_stopped && <Badge variant="outline" className="text-[11px] border-red-500/40 text-red-400">emergency stop</Badge>}
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Link to="/admin/marketing-calendar">
            <Button size="sm" variant="outline">
              <CalendarDays className="w-4 h-4 mr-1" /> Calendar
            </Button>
          </Link>
        </div>
      </div>

      <div className="glass rounded-xl px-4 py-3 text-xs text-muted-foreground">
        Next scheduled publication: <span className="text-foreground">{nextLabel}</span>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <CampaignSlotCard title="Today's campaign" campaign={state.today_campaign} subtitle={state.today} onChanged={load} />
          <CampaignSlotCard title="Tomorrow's proposal" campaign={state.tomorrow_campaign} subtitle="Next generation" onChanged={load} />
          <PublicationQueue state={state} onOpen={setSelected} />
        </div>
        <div className="space-y-4">
          <ModeControlCard state={state} onChanged={load} />
          <SocialAccountsPanel accounts={state.accounts} onChanged={load} />
          <PerformanceStrip metrics={state.recent_metrics || []} />
          {state.opportunities?.length > 0 && (
            <div className="glass rounded-2xl p-5">
              <h2 className="font-syne text-lg font-bold mb-3">Discovered opportunities</h2>
              <div className="flex flex-wrap gap-2">
                {state.opportunities.map((feature) => (
                  <Badge key={feature.id} variant="outline" className="text-[11px]">
                    {feature.label}
                  </Badge>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                Verified features that have never been marketed. The engine rotates toward these first.
              </p>
            </div>
          )}
        </div>
      </div>

      <PublicationDrawer
        publication={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        onChanged={load}
      />
    </div>
  );
}