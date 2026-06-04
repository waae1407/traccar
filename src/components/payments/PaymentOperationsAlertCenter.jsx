import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CreditCard, DollarSign, ShieldAlert, Undo2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import PaymentOperationalAlertPanel from "./PaymentOperationalAlertPanel";
import PaymentAlertInsight from "./PaymentAlertInsight";

const OPEN = ["new", "notified", "acknowledged", "under_review", "retry_scheduled", "escalated"];
const FILTERS = {
  severity: ["", "critical", "warning", "info"],
  status: ["", "new", "notified", "acknowledged", "under_review", "retry_scheduled", "resolved", "escalated", "closed"],
  billing_context: ["", "rental_payment", "weekly_billing", "payout", "subscription", "dealer_network", "contactless_gps", "chargeback", "reversal", "refund", "unknown"],
};

function Kpi({ label, value, icon: Icon, tone, active, onClick }) {
  const tones = { red: "border-red-500/25 bg-red-500/10 text-red-400", yellow: "border-yellow-500/25 bg-yellow-500/10 text-yellow-400", blue: "border-blue-500/25 bg-blue-500/10 text-blue-400", green: "border-green-500/25 bg-green-500/10 text-green-400" };
  return <button type="button" onClick={onClick} className={`rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 ${tones[tone] || tones.blue} ${active ? "ring-2 ring-primary/40" : ""}`}><Icon className="h-4 w-4 mb-3" /><p className="text-2xl font-black text-white">{value}</p><p className="text-xs opacity-70">{label}</p></button>;
}

export default function PaymentOperationsAlertCenter({ scope = "admin", hostId = null }) {
  const [filters, setFilters] = useState({ severity: "", status: "", billing_context: "", alert_type: "", search: "", amountMin: "", amountMax: "" });
  const [scoreFilter, setScoreFilter] = useState("");
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["payment-alert-center", scope, hostId],
    queryFn: () => scope === "host" && hostId ? base44.entities.PaymentOperationalAlert.filter({ host_id: hostId }, "-created_date", 500) : base44.entities.PaymentOperationalAlert.list("-created_date", 500),
    enabled: scope !== "host" || !!hostId,
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => alerts.filter(a => {
    if (filters.severity && a.severity !== filters.severity) return false;
    if (filters.status && a.status !== filters.status) return false;
    if (filters.billing_context && a.billing_context !== filters.billing_context) return false;
    if (filters.alert_type && !a.alert_type?.includes(filters.alert_type)) return false;
    if (filters.amountMin && Number(a.financial_impact_amount || 0) < Number(filters.amountMin)) return false;
    if (filters.amountMax && Number(a.financial_impact_amount || 0) > Number(filters.amountMax)) return false;
    if (filters.search && !`${a.title} ${a.message} ${a.booking_id} ${a.host_id} ${a.renter_email} ${a.host_email}`.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (scoreFilter === "critical" && !(a.severity === "critical" && OPEN.includes(a.status))) return false;
    if (scoreFilter === "failed" && !(a.alert_type?.includes("failed") && OPEN.includes(a.status))) return false;
    if (scoreFilter === "chargebacks" && !(a.billing_context === "chargeback" && OPEN.includes(a.status))) return false;
    if (scoreFilter === "payout" && !(a.billing_context === "payout" && OPEN.includes(a.status))) return false;
    if (scoreFilter === "subscription" && !(["subscription", "dealer_network", "contactless_gps"].includes(a.billing_context) && OPEN.includes(a.status))) return false;
    if (scoreFilter === "resolved" && !(["resolved", "closed"].includes(a.status) && new Date(a.resolved_at || a.updated_date || a.created_date) >= weekAgo)) return false;
    return true;
  }), [alerts, filters, scoreFilter]);

  const kpis = {
    critical: alerts.filter(a => a.severity === "critical" && OPEN.includes(a.status)).length,
    failed: alerts.filter(a => a.alert_type?.includes("failed") && OPEN.includes(a.status)).length,
    chargebacks: alerts.filter(a => a.billing_context === "chargeback" && OPEN.includes(a.status)).length,
    payout: alerts.filter(a => a.billing_context === "payout" && OPEN.includes(a.status)).length,
    subscription: alerts.filter(a => ["subscription", "dealer_network", "contactless_gps"].includes(a.billing_context) && OPEN.includes(a.status)).length,
    resolved: alerts.filter(a => ["resolved", "closed"].includes(a.status) && new Date(a.resolved_at || a.updated_date || a.created_date) >= weekAgo).length,
  };

  return (
    <div className={scope === "admin" ? "space-y-6" : "space-y-5"}>
      <PaymentOperationalAlertPanel scope={scope} hostId={hostId} limit={5} title="Open Payment Ops Post-Its" />
      <div>
        <p className={scope === "admin" ? "text-[10px] font-bold text-white/35 uppercase tracking-widest" : "text-[10px] font-bold text-gray-400 uppercase tracking-widest"}>Payment Operations</p>
        <h1 className={scope === "admin" ? "text-2xl font-black text-white" : "text-2xl font-black text-gray-900"}>Alert Center</h1>
        <p className={scope === "admin" ? "text-sm text-white/45" : "text-sm text-gray-500"}>Manual visibility and audit workflow only. No automatic subscription, Dealer Network, GPS, vehicle, or payout actions are activated.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          ["critical", "Open Critical", kpis.critical, ShieldAlert, "red"],
          ["failed", "Failed Payments", kpis.failed, CreditCard, "yellow"],
          ["chargebacks", "Chargebacks", kpis.chargebacks, AlertTriangle, "red"],
          ["payout", "Payout Issues", kpis.payout, DollarSign, "blue"],
          ["subscription", "Subscription Issues", kpis.subscription, Undo2, "yellow"],
          ["resolved", "Resolved This Week", kpis.resolved, CheckCircle2, "green"],
        ].map(([key, label, value, Icon, tone]) => <Kpi key={key} label={label} value={value} icon={Icon} tone={tone} active={scoreFilter === key} onClick={() => setScoreFilter(scoreFilter === key ? "" : key)} />)}
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <input value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} placeholder="Search alerts…" className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none" />
        {Object.entries(FILTERS).map(([key, values]) => <select key={key} value={filters[key]} onChange={e => setFilters(p => ({ ...p, [key]: e.target.value }))} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none">{values.map(v => <option key={v} value={v}>{v || key.replace("_", " ")}</option>)}</select>)}
        <input value={filters.alert_type} onChange={e => setFilters(p => ({ ...p, alert_type: e.target.value }))} placeholder="Alert type" className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none" />
        <input value={filters.amountMin} onChange={e => setFilters(p => ({ ...p, amountMin: e.target.value }))} placeholder="Min $" type="number" className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none" />
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3"><p className="font-bold text-white">Alerts</p><div className="flex items-center gap-3"><p className="text-xs text-white/40">{filtered.length} records</p>{scoreFilter && <button onClick={() => setScoreFilter("")} className="text-xs text-primary underline">Clear scorecard</button>}</div></div>
        {isLoading ? <div className="p-6 text-white/40">Loading alerts…</div> : filtered.length === 0 ? <div className="p-10 text-center text-white/35">No alerts found.</div> : <div className="divide-y divide-white/10">{filtered.map(a => <div key={a.id} className="p-4 hover:bg-white/[0.03]"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2 mb-1"><span className="text-[10px] font-black uppercase text-red-300">{a.severity}</span><span className="text-[10px] text-white/35">{a.status}</span><span className="text-[10px] text-white/35">{a.billing_context}</span></div><p className="font-bold text-white">{a.title}</p><p className="text-sm text-white/50 mt-1">{a.message}</p><p className="text-xs text-white/35 mt-2">{a.recommended_action}</p></div><div className="text-right text-xs text-white/40"><p>{a.financial_impact_amount ? `$${Number(a.financial_impact_amount).toFixed(2)}` : "—"}</p><p>{a.created_date ? new Date(a.created_date).toLocaleDateString() : ""}</p></div></div><div className="[&_div]:border-white/10 [&_div]:bg-white/[0.06] [&_p]:text-white [&_a]:border-white/10 [&_a]:bg-white/[0.06] [&_a]:text-white/75 [&_a:hover]:bg-white/[0.1]"><PaymentAlertInsight alert={a} scope={scope} /></div><div className="mt-3 text-[10px] text-white/30 flex flex-wrap gap-3"><span>{a.alert_type}</span></div></div>)}</div>}
      </div>
    </div>
  );
}