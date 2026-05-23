import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Activity, AlertTriangle, Award, BarChart3, RefreshCw, ShieldCheck } from "lucide-react";

function scoreTone(score = 0) {
  if (score >= 80) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (score >= 60) return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
  return "text-red-400 bg-red-500/10 border-red-500/20";
}

function ScoreTile({ label, value }) {
  return (
    <div className={`rounded-xl border p-3 ${scoreTone(value)}`}>
      <p className="text-[10px] uppercase tracking-wider font-bold opacity-70">{label}</p>
      <p className="text-xl font-black mt-1" style={{ fontFamily: "var(--font-syne)" }}>{Math.round(value || 0)}</p>
    </div>
  );
}

function SummaryCard({ item, type }) {
  const score = type === "host" ? item.host_trust_score : item.vehicle_quality_score;
  const title = type === "host" ? `Host ${item.host_id?.slice(-6)}` : `Vehicle ${item.vehicle_id?.slice(-6)}`;
  const breakdown = item.score_breakdown || {};

  return (
    <div className="glass rounded-2xl p-4 space-y-3 border border-white/[0.08]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-white">{title}</p>
          <p className="text-[10px] text-white/35 capitalize">{item.confidence_level || "low"} confidence · {item.data_points_count || 0} data points</p>
        </div>
        <span className={`text-xs font-black px-2.5 py-1 rounded-full border ${scoreTone(score)}`}>{Math.round(score || 0)}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <ScoreTile label="Booking" value={item.booking_reliability_score} />
        <ScoreTile label="Clean" value={item.cleanliness_score} />
        <ScoreTile label="Compliance" value={item.compliance_consistency_score} />
        <ScoreTile label="Dispute" value={item.dispute_adjusted_risk_score} />
      </div>

      {item.active_badges?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.active_badges.map((badge) => (
            <span key={badge} className="text-[10px] px-2 py-1 rounded-lg bg-primary/15 text-primary border border-primary/20 font-bold">{badge.replace(/_/g, " ")}</span>
          ))}
        </div>
      )}

      {item.badge_explanations?.length > 0 && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-1">
          <p className="text-[10px] text-white/40 font-bold uppercase">Badge eligibility</p>
          {item.badge_explanations.slice(0, 3).map((text, i) => <p key={i} className="text-[10px] text-white/45">• {text}</p>)}
        </div>
      )}

      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
        <p className="text-[10px] text-white/40 font-bold uppercase mb-1">Subscore breakdown</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {Object.entries(breakdown).slice(0, 8).map(([key, value]) => (
            <p key={key} className="text-[10px] text-white/45 flex justify-between gap-2"><span>{key}</span><span>{Math.round(value || 0)}</span></p>
          ))}
        </div>
      </div>

      {(item.suppression_recommended || item.score_volatility_flag) && (
        <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 p-3 space-y-1">
          {item.suppression_recommended && <p className="text-[10px] text-orange-300">Preview only: {item.suppression_reason || "suppression review recommended"}</p>}
          {item.score_volatility_flag && <p className="text-[10px] text-orange-300">Volatility: {item.score_volatility_reason}</p>}
        </div>
      )}
    </div>
  );
}

export default function AdminReputationValidation() {
  const qc = useQueryClient();
  const [lastRun, setLastRun] = useState(null);

  const { data: hostSummaries = [] } = useQuery({ queryKey: ["host-reputation-validation"], queryFn: () => base44.entities.HostReputationSummary.list("-updated_date", 200) });
  const { data: vehicleSummaries = [] } = useQuery({ queryKey: ["vehicle-reputation-validation"], queryFn: () => base44.entities.VehicleReputationSummary.list("-updated_date", 300) });
  const { data: events = [] } = useQuery({ queryKey: ["reputation-event-log"], queryFn: () => base44.entities.ReputationEventLog.list("-created_date", 50) });
  const { data: snapshots = [] } = useQuery({ queryKey: ["reputation-history-snapshots"], queryFn: () => base44.entities.ReputationHistorySnapshot.list("-created_date", 80) });
  const { data: signalSnapshots = [] } = useQuery({ queryKey: ["reputation-signal-snapshots"], queryFn: () => base44.entities.ReputationSignalSnapshot.list("-created_date", 100) });

  const runMutation = useMutation({
    mutationFn: async () => {
      const signals = await base44.functions.invoke("collectReputationSignals", {});
      const scores = await base44.functions.invoke("calculateReputationSummaries", {});
      return { data: { ...scores.data, signal_collection: signals.data } };
    },
    onSuccess: (res) => {
      setLastRun(res.data);
      qc.invalidateQueries({ queryKey: ["host-reputation-validation"] });
      qc.invalidateQueries({ queryKey: ["vehicle-reputation-validation"] });
      qc.invalidateQueries({ queryKey: ["reputation-event-log"] });
      qc.invalidateQueries({ queryKey: ["reputation-history-snapshots"] });
      qc.invalidateQueries({ queryKey: ["reputation-signal-snapshots"] });
    },
  });

  const stats = useMemo(() => ({
    hosts: hostSummaries.length,
    vehicles: vehicleSummaries.length,
    previewSuppressions: [...hostSummaries, ...vehicleSummaries].filter((s) => s.suppression_recommended).length,
    volatility: [...hostSummaries, ...vehicleSummaries].filter((s) => s.score_volatility_flag).length,
    lowSignal: signalSnapshots.filter((s) => s.confidence_level === "low").length,
  }), [hostSummaries, vehicleSummaries, signalSnapshots]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Internal only</p>
          <h1 className="text-2xl font-black text-white font-syne">Reputation Validation</h1>
          <p className="text-white/40 text-sm mt-1">Phase 2 simulation: scores, badges, confidence, events, and volatility without public rollout or ranking changes.</p>
        </div>
        <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
        >
          <RefreshCw className={`h-4 w-4 ${runMutation.isPending ? "animate-spin" : ""}`} />
          {runMutation.isPending ? "Running Simulation…" : "Run Internal Simulation"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[{ label: "Host summaries", value: stats.hosts, icon: ShieldCheck }, { label: "Vehicle summaries", value: stats.vehicles, icon: BarChart3 }, { label: "Preview flags", value: stats.previewSuppressions, icon: AlertTriangle }, { label: "Volatility flags", value: stats.volatility, icon: Activity }, { label: "Low signal coverage", value: stats.lowSignal, icon: AlertTriangle }].map(({ label, value, icon: Icon }) => (
          <div key={label} className="glass rounded-2xl p-4 border border-white/[0.08]">
            <Icon className="h-4 w-4 text-primary mb-2" />
            <p className="text-2xl font-black text-white font-syne">{value}</p>
            <p className="text-xs text-white/40">{label}</p>
          </div>
        ))}
      </div>

      {lastRun && (
        <div className="glass rounded-2xl p-4 border border-white/[0.08] space-y-3">
          <div className="flex items-center gap-2"><Award className="h-4 w-4 text-primary" /><p className="text-sm font-bold text-white">Latest simulation report</p></div>
          <div className="grid md:grid-cols-3 gap-3 text-xs text-white/50">
            <div>Coverage: {lastRun.coverage?.hosts_processed || 0} hosts · {lastRun.coverage?.vehicles_processed || 0} vehicles</div>
            <div>Events: {lastRun.coverage?.event_logs_created || 0}</div>
            <div>Snapshots: {lastRun.coverage?.snapshots_created || 0}</div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/[0.03] p-3 border border-white/[0.06]"><p className="text-[10px] font-bold text-white/40 uppercase mb-1">Edge cases</p>{(lastRun.edge_case_findings || []).slice(0, 6).map((x, i) => <p key={i} className="text-[10px] text-white/45">• {x}</p>)}</div>
            <div className="rounded-xl bg-white/[0.03] p-3 border border-white/[0.06]"><p className="text-[10px] font-bold text-white/40 uppercase mb-1">Volatility</p>{(lastRun.volatility_observations || ["No unusual swings detected."]).slice(0, 6).map((x, i) => <p key={i} className="text-[10px] text-white/45">• {x}</p>)}</div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-3"><h2 className="text-lg font-black text-white font-syne">Host validation</h2>{hostSummaries.slice(0, 8).map((item) => <SummaryCard key={item.id} item={item} type="host" />)}</div>
        <div className="space-y-3"><h2 className="text-lg font-black text-white font-syne">Vehicle validation</h2>{vehicleSummaries.slice(0, 8).map((item) => <SummaryCard key={item.id} item={item} type="vehicle" />)}</div>
      </div>

      <div className="glass rounded-2xl p-4 border border-white/[0.08]">
        <h3 className="text-sm font-bold text-white mb-3">Signal completeness indicators</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {signalSnapshots.slice(0, 9).map((s) => (
            <div key={s.id} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-bold text-white capitalize">{s.entity_type} signal</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.confidence_level === "high" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : s.confidence_level === "moderate" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>{s.confidence_level}</span>
              </div>
              <p className="text-2xl font-black text-white font-syne">{s.signal_completeness_score || 0}%</p>
              <p className="text-[10px] text-white/35 mt-1">Completed: {s.completed_bookings_count || 0} · Reviews: {s.verified_review_count || 0} · Inspections: {s.pickup_inspection_completion_rate || 0}%/{s.dropoff_inspection_completion_rate || 0}%</p>
              {s.missing_signals?.length > 0 && <p className="text-[10px] text-orange-300 mt-2">Missing: {s.missing_signals.slice(0, 4).join(", ")}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-4 border border-white/[0.08]"><h3 className="text-sm font-bold text-white mb-3">Recent event impact history</h3><div className="space-y-2">{events.slice(0, 12).map((e) => <p key={e.id} className="text-xs text-white/45">{e.event_type} · {e.entity_type} · impact {e.score_impact || 0}</p>)}</div></div>
        <div className="glass rounded-2xl p-4 border border-white/[0.08]"><h3 className="text-sm font-bold text-white mb-3">Score trend snapshots</h3><div className="space-y-2">{snapshots.slice(0, 12).map((s) => <p key={s.id} className="text-xs text-white/45">{s.entity_type} · {s.snapshot_date} · score {Math.round(s.overall_score || 0)} · {s.risk_level}</p>)}</div></div>
      </div>
    </div>
  );
}