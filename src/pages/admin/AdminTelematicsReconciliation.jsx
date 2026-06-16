import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, Wifi, WifiOff, Clock, Search, Database, Server } from "lucide-react";

function statusColor(status) {
  if (status === "online") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (status === "stale") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  if (status === "offline") return "bg-red-500/20 text-red-400 border-red-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function StatusBadge({ status }) {
  const icon = status === "online" ? <Wifi className="h-3 w-3" /> : status === "offline" ? <WifiOff className="h-3 w-3" /> : <Clock className="h-3 w-3" />;
  return (
    <Badge variant="outline" className={`gap-1 text-xs ${statusColor(status)}`}>
      {icon}{status || "unknown"}
    </Badge>
  );
}

function KpiCard({ label, value, icon: Icon, color = "text-foreground", sub }) {
  return (
    <Card className="glass">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={`text-3xl font-black ${color}`}>{value ?? "—"}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          {Icon && <Icon className="h-5 w-5 text-muted-foreground mt-1" />}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminTelematicsReconciliation() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all"); // all | missing_base44 | missing_traccar

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["telematics-reconciliation"],
    queryFn: async () => (await base44.functions.invoke("getTelematicsReconciliation", {})).data,
    refetchInterval: 60000,
  });

  const summary = data?.summary || {};
  const traccarDevices = data?.traccar_devices || [];
  const missingInBase44 = data?.missing_in_base44 || [];
  const missingInTraccar = data?.missing_in_traccar || [];

  const filtered = (() => {
    let rows;
    if (tab === "missing_base44") rows = missingInBase44.map(r => ({ ...r, source: "traccar_only" }));
    else if (tab === "missing_traccar") rows = missingInTraccar.map(r => ({ ...r, online_status: null, source: "base44_only" }));
    else rows = traccarDevices;

    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      String(r.unique_id || "").toLowerCase().includes(q) ||
      String(r.traccar_name || "").toLowerCase().includes(q) ||
      String(r.base44_vehicle_id || r.vehicle_id || "").toLowerCase().includes(q) ||
      String(r.traccar_id || "").toLowerCase().includes(q)
    );
  })();

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-primary uppercase tracking-widest">Telematics</p>
          <h1 className="text-2xl font-black">Device Reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Traccar is source of truth. Status computed from Traccar lastUpdate timestamps.
            {data?.generated_at && <> · Refreshed {new Date(data.generated_at).toLocaleTimeString()}</>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2 shrink-0">
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error && (
        <Card className="glass border-red-500/30">
          <CardContent className="p-4 text-red-400 text-sm">{error.message || "Failed to load reconciliation data."}</CardContent>
        </Card>
      )}

      {/* KPI bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard label="Traccar Devices" value={summary.traccar_device_count} icon={Server} />
        <KpiCard label="Base44 Devices" value={summary.base44_device_count} icon={Database} />
        <KpiCard label="Matched" value={summary.matched_count} icon={CheckCircle2} color="text-green-400" />
        <KpiCard label="Missing in Base44" value={summary.missing_in_base44} icon={XCircle} color={summary.missing_in_base44 > 0 ? "text-yellow-400" : "text-muted-foreground"} />
        <KpiCard label="Missing in Traccar" value={summary.missing_in_traccar} icon={AlertTriangle} color={summary.missing_in_traccar > 0 ? "text-red-400" : "text-muted-foreground"} />
        <KpiCard label="Online" value={summary.online_count} color="text-green-400" sub="< 30 min" />
        <KpiCard label="Stale / Offline" value={(summary.stale_count || 0) + (summary.offline_count || 0)} color={(summary.stale_count + summary.offline_count) > 0 ? "text-yellow-400" : "text-muted-foreground"} sub="30 min – offline" />
      </div>

      {/* Source note */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
        Status source: <span className="font-semibold text-green-400">traccar_live</span> — heartbeat age from Traccar /api/positions, not Base44 fields.
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1">
          {[
            { key: "all", label: `All Traccar (${summary.traccar_device_count ?? 0})` },
            { key: "missing_base44", label: `Missing in Base44 (${summary.missing_in_base44 ?? 0})` },
            { key: "missing_traccar", label: `Missing in Traccar (${summary.missing_in_traccar ?? 0})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === t.key ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-secondary"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Filter by IMEI, name, vehicle…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
        </div>
      </div>

      {/* Device Table */}
      <Card className="glass">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            {tab === "all" && "All Traccar Devices"}
            {tab === "missing_base44" && "Devices in Traccar — Not in Base44"}
            {tab === "missing_traccar" && "Base44 Devices — Not Found in Traccar"}
            <span className="ml-2 text-muted-foreground font-normal">({filtered.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No devices match.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">IMEI / Unique ID</th>
                    {tab !== "missing_traccar" && <th className="px-4 py-2 text-left font-medium">Traccar ID</th>}
                    {tab !== "missing_traccar" && <th className="px-4 py-2 text-left font-medium">Name</th>}
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Last Heartbeat</th>
                    <th className="px-4 py-2 text-left font-medium">Vehicle</th>
                    {tab === "all" && <th className="px-4 py-2 text-left font-medium">In Base44</th>}
                    {tab === "missing_traccar" && <th className="px-4 py-2 text-left font-medium">Provider</th>}
                    {tab === "missing_traccar" && <th className="px-4 py-2 text-left font-medium">Lifecycle</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((row, i) => (
                    <tr key={row.traccar_id || row.base44_id || i} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-mono font-semibold text-foreground">{row.unique_id || "—"}</td>
                      {tab !== "missing_traccar" && <td className="px-4 py-2.5 text-muted-foreground">{row.traccar_id || "—"}</td>}
                      {tab !== "missing_traccar" && <td className="px-4 py-2.5 text-muted-foreground">{row.traccar_name || "—"}</td>}
                      <td className="px-4 py-2.5">
                        {row.online_status ? <StatusBadge status={row.online_status} /> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {row.heartbeat_age || (row.last_update ? new Date(row.last_update).toLocaleString() : row.last_seen_at ? new Date(row.last_seen_at).toLocaleString() : "Never")}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{row.base44_vehicle_id || row.vehicle_id || "—"}</td>
                      {tab === "all" && (
                        <td className="px-4 py-2.5">
                          {row.in_base44
                            ? <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30 text-xs">✓ Synced</Badge>
                            : <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs">Missing</Badge>}
                        </td>
                      )}
                      {tab === "missing_traccar" && <td className="px-4 py-2.5 text-muted-foreground">{row.provider_key || "—"}</td>}
                      {tab === "missing_traccar" && <td className="px-4 py-2.5 text-muted-foreground">{row.lifecycle_status || "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}