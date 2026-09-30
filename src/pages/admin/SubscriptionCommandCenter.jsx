import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, XCircle, AlertTriangle, DollarSign, Users, Zap, RefreshCw, Play, Clock, Package, Loader2 } from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS = {
  active: "bg-green-500/20 text-green-400",
  trialing: "bg-blue-500/20 text-blue-400",
  past_due: "bg-red-500/20 text-red-400",
  cancelled: "bg-muted text-muted-foreground",
  suspended: "bg-red-500/20 text-red-400",
  no_payment_method: "bg-yellow-500/20 text-yellow-400",
  healthy: "bg-green-500/20 text-green-400",
  warning: "bg-yellow-500/20 text-yellow-400",
  critical: "bg-red-500/20 text-red-400",
  paid: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
  open: "bg-red-500/20 text-red-400",
  resolved: "bg-green-500/20 text-green-400",
  acknowledged: "bg-yellow-500/20 text-yellow-400",
};

function SBadge({ status }) {
  return <Badge className={`text-xs ${STATUS_COLORS[status] || "bg-muted text-muted-foreground"}`}>{status?.replace(/_/g, " ")}</Badge>;
}

function MetricCard({ label, value, sub, color, warn }) {
  return (
    <div className={`rounded-xl p-4 border ${warn ? "border-yellow-500/30 bg-yellow-500/10" : "border-border bg-secondary/40"}`}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color || "text-foreground"}`}>{value}</p>
      {sub && <p className="text-muted-foreground text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

export default function SubscriptionCommandCenter() {
  const [migrationLog, setMigrationLog] = useState(null);
  const [confirmingReturn, setConfirmingReturn] = useState(null);

  const { data: accounts = [], isLoading: loadingAccounts, refetch: refetchAccounts } = useQuery({
    queryKey: ["sub-accounts"],
    queryFn: () => base44.entities.SubscriptionAccount.list("-updated_date", 200),
  });
  const { data: items = [], isLoading: loadingItems, refetch: refetchItems } = useQuery({
    queryKey: ["sub-items"],
    queryFn: () => base44.entities.SubscriptionItem.list("-updated_date", 500),
  });
  const { data: alerts = [], refetch: refetchAlerts } = useQuery({
    queryKey: ["sub-alerts"],
    queryFn: () => base44.entities.SubscriptionAlert.list("-created_at", 200),
  });
  const { data: gpsSubs = [], refetch: refetchGpsSubs } = useQuery({
    queryKey: ["gps-subs-admin"],
    queryFn: () => base44.entities.GPSSubscription.list("-created_date", 500),
  });

  const dryRunMigration = useMutation({
    mutationFn: () => base44.functions.invoke("migrateSubscriptionsToUnified", { dry_run: true }).then(r => r.data),
    onSuccess: (d) => setMigrationLog({ ...d, mode: "DRY RUN" }),
  });
  const liveMigration = useMutation({
    mutationFn: () => base44.functions.invoke("migrateSubscriptionsToUnified", { dry_run: false }).then(r => r.data),
    onSuccess: (d) => { setMigrationLog({ ...d, mode: "LIVE" }); refetchAccounts(); refetchItems(); },
  });

  const confirmReturn = useMutation({
    mutationFn: (subId) => base44.functions.invoke("confirmGPSDeviceReturn", { subscription_id: subId }).then(r => r.data),
    onSuccess: () => { setConfirmingReturn(null); refetchGpsSubs(); },
  });

  const trialingSubs = gpsSubs.filter(s => s.subscription_status === "trialing");
  const cancelledSubs = gpsSubs.filter(s => s.subscription_status === "cancelled" && !s.device_returned_at && !s.device_fee_charged_at);
  const returnedSubs = gpsSubs.filter(s => s.device_returned_at);
  const feeChargedSubs = gpsSubs.filter(s => s.device_fee_charged_at);

  const activeAccounts = accounts.filter(a => a.status === "active");
  const pastDueAccounts = accounts.filter(a => a.status === "past_due");
  const activeItems = items.filter(i => i.status === "active");
  const trialingItems = items.filter(i => i.status === "trialing");
  const pastDueItems = items.filter(i => i.status === "past_due");
  const hostPlatformItems = items.filter(i => i.item_type === "host_platform");
  const gpsItems = items.filter(i => i.item_type === "contactless360_gps");
  const openAlerts = alerts.filter(a => a.status === "open");

  const totalMRR = activeItems.reduce((s, i) => s + (i.monthly_amount || 0), 0);
  const hostMRR = hostPlatformItems.filter(i => i.status === "active").reduce((s, i) => s + (i.monthly_amount || 0), 0);
  const gpsMRR = gpsItems.filter(i => i.status === "active").reduce((s, i) => s + (i.monthly_amount || 0), 0);
  const atRiskMRR = pastDueItems.reduce((s, i) => s + (i.monthly_amount || 0), 0);

  if (loadingAccounts || loadingItems) return <div className="p-8 text-muted-foreground">Loading Subscription Command Center…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Subscription Command Center</h1>
          <p className="text-muted-foreground text-sm mt-1">Unified MRR · Accounts · Items · Alerts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetchAccounts(); refetchItems(); refetchAlerts(); }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Migration Panel */}
      <Card className="bg-card border-yellow-500/20">
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-yellow-400" /> Migration Controls</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Run dry migration first to preview results, then run live migration to write records.</p>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={() => dryRunMigration.mutate()} disabled={dryRunMigration.isPending || liveMigration.isPending}>
              <Play className="h-3.5 w-3.5 mr-1.5" /> Dry Run
            </Button>
            <Button size="sm" className="bg-yellow-500 text-black hover:bg-yellow-400" onClick={() => liveMigration.mutate()} disabled={dryRunMigration.isPending || liveMigration.isPending}>
              <Zap className="h-3.5 w-3.5 mr-1.5" /> Run Live Migration
            </Button>
          </div>
          {migrationLog && (
            <div className={`rounded-xl p-3 text-xs space-y-1 ${migrationLog.mode === "DRY RUN" ? "bg-blue-500/10 border border-blue-500/20" : "bg-green-500/10 border border-green-500/20"}`}>
              <p className="font-bold">{migrationLog.mode} Results</p>
              <p>Accounts created: <span className="text-green-400">{migrationLog.created_accounts}</span> · updated: {migrationLog.updated_accounts}</p>
              <p>Items created: <span className="text-green-400">{migrationLog.created_items}</span> · updated: {migrationLog.updated_items}</p>
              <p>Skipped: {migrationLog.skipped} · HostPlatformSubs: {migrationLog.host_platform_subs_processed} · GPS: {migrationLog.gps_subs_processed}</p>
              {migrationLog.warnings?.map((w, i) => <p key={i} className="text-yellow-400">⚠ {w}</p>)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* MRR Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total MRR" value={`$${totalMRR.toFixed(2)}`} color="text-green-400" sub="Active subscriptions" />
        <MetricCard label="Host Platform MRR" value={`$${hostMRR.toFixed(2)}`} color="text-primary" sub={`${hostPlatformItems.filter(i=>i.status==="active").length} active plans`} />
        <MetricCard label="Contactless360 GPS MRR" value={`$${gpsMRR.toFixed(2)}`} color="text-yellow-400" sub={`${gpsItems.filter(i=>i.status==="active").length} active devices`} />
        <MetricCard label="At-Risk MRR" value={`$${atRiskMRR.toFixed(2)}`} color={atRiskMRR > 0 ? "text-red-400" : ""} warn={atRiskMRR > 0} sub={`${pastDueItems.length} past due`} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Active Accounts" value={activeAccounts.length} color="text-green-400" />
        <MetricCard label="Past Due Accounts" value={pastDueAccounts.length} color={pastDueAccounts.length > 0 ? "text-red-400" : ""} warn={pastDueAccounts.length > 0} />
        <MetricCard label="Open Alerts" value={openAlerts.length} color={openAlerts.length > 0 ? "text-yellow-400" : ""} warn={openAlerts.length > 0} />
        <MetricCard label="Trialing" value={trialingItems.length} color="text-blue-400" sub="No cash yet" />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto gap-1">
          {[["overview","Overview"],["trials","Trials"],["returns","Returns"],["accounts","Accounts"],["items","Items"],["failed","Failed Payments"],["gps","GPS Subscriptions"],["host","Host Plans"],["alerts","Alerts"]].map(([v,l]) => (
            <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-sm">MRR Breakdown</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Host Platform (active)</span><span className="text-primary">${hostMRR.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Contactless360 GPS (active)</span><span className="text-yellow-400">${gpsMRR.toFixed(2)}</span></div>
                <div className="flex justify-between border-t border-border pt-2"><span className="font-semibold">Total MRR</span><span className="text-green-400 font-bold">${totalMRR.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">At-risk (past due)</span><span className="text-red-400">${atRiskMRR.toFixed(2)}</span></div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-sm">Account Health</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                {["healthy","warning","critical","suspended"].map(s => {
                  const count = accounts.filter(a => a.health_status === s).length;
                  return (
                    <div key={s} className="flex justify-between items-center">
                      <span className="text-muted-foreground capitalize">{s}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{count}</span>
                        <SBadge status={s} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trials" className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <MetricCard label="Active Trials" value={trialingSubs.length} color="text-blue-400" sub="90-day free" />
            <MetricCard label="Pending Returns" value={cancelledSubs.length} color="text-yellow-400" sub="14-day window" warn={cancelledSubs.length > 0} />
            <MetricCard label="Devices Returned" value={returnedSubs.length} color="text-green-400" />
          </div>
          {trialingSubs.length === 0 && <p className="text-muted-foreground text-sm">No active trials.</p>}
          {trialingSubs.map(s => {
            const daysLeft = s.trial_end_at ? Math.ceil((new Date(s.trial_end_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
            return (
              <div key={s.id} className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-3 text-sm flex justify-between items-start">
                <div>
                  <p className="font-medium text-blue-400 flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> {s.customer_name || s.customer_email}</p>
                  <p className="text-muted-foreground text-xs mt-1">{s.customer_email} · ${s.monthly_price}/mo · Trial ends {s.trial_end_at ? format(new Date(s.trial_end_at), "MMM d, yyyy") : "—"}</p>
                  {s.trial_reminder_sent_at && <p className="text-yellow-400 text-xs mt-1">Reminder sent {format(new Date(s.trial_reminder_sent_at), "MMM d")}</p>}
                </div>
                <div className="text-right">
                  <Badge className="text-xs bg-blue-500/20 text-blue-400">{daysLeft}d left</Badge>
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="returns" className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <MetricCard label="Pending Returns" value={cancelledSubs.length} color="text-yellow-400" warn={cancelledSubs.length > 0} />
            <MetricCard label="Returned" value={returnedSubs.length} color="text-green-400" />
            <MetricCard label="Fees Charged" value={feeChargedSubs.length} color="text-red-400" warn={feeChargedSubs.length > 0} />
          </div>
          {cancelledSubs.length === 0 && <p className="text-muted-foreground text-sm">No pending device returns.</p>}
          {cancelledSubs.map(s => {
            const daysLeft = s.return_window_ends_at ? Math.ceil((new Date(s.return_window_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
            const isOverdue = daysLeft <= 0;
            return (
              <div key={s.id} className={`rounded-lg px-4 py-3 text-sm border ${isOverdue ? "bg-red-500/10 border-red-500/20" : "bg-yellow-500/10 border-yellow-500/20"}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium flex items-center gap-2"><Package className="w-3.5 h-3.5 text-yellow-400" /> {s.customer_name || s.customer_email}</p>
                    <p className="text-muted-foreground text-xs mt-1">{s.customer_email} · Cancelled {s.canceled_at ? format(new Date(s.canceled_at), "MMM d") : "—"}</p>
                    <p className={`text-xs mt-1 ${isOverdue ? "text-red-400" : "text-yellow-400"}`}>
                      {isOverdue ? "Return window expired — fee pending" : `${daysLeft} day(s) left to return`}
                    </p>
                    {s.device_return_warning_sent_at && <p className="text-orange-400 text-xs mt-1">⚠ Warning sent {format(new Date(s.device_return_warning_sent_at), "MMM d")}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmingReturn(s.id)}
                    disabled={confirmingReturn === s.id && confirmReturn.isPending}
                  >
                    {confirmingReturn === s.id && confirmReturn.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 mr-1" />}
                    Confirm Returned
                  </Button>
                </div>
              </div>
            );
          })}
          {confirmingReturn && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
              <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full space-y-4">
                <h3 className="font-bold text-white">Confirm Device Returned?</h3>
                <p className="text-sm text-muted-foreground">This will close the subscription with no device fee. The customer will be notified.</p>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setConfirmingReturn(null)}>Cancel</Button>
                  <Button className="flex-1 bg-green-500 hover:bg-green-600 text-white" onClick={() => confirmReturn.mutate(confirmingReturn)}>Confirm Return</Button>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="accounts" className="mt-4 space-y-2">
          {accounts.slice(0,100).map(a => (
            <div key={a.id} className="rounded-lg bg-secondary/30 px-3 py-2.5 text-sm flex justify-between items-start">
              <div>
                <p className="font-medium">{a.owner_name || a.owner_email}</p>
                <p className="text-muted-foreground text-xs">{a.owner_type} · {a.owner_email} · ${(a.monthly_total||0).toFixed(2)}/mo</p>
                <p className="text-muted-foreground text-xs">{a.active_item_count} active · {a.past_due_item_count} past due · score: {a.health_score}</p>
              </div>
              <div className="flex flex-col items-end gap-1"><SBadge status={a.status} /><SBadge status={a.health_status} /></div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="items" className="mt-4 space-y-2">
          {items.slice(0,100).map(i => (
            <div key={i.id} className="rounded-lg bg-secondary/30 px-3 py-2.5 text-sm flex justify-between items-start">
              <div>
                <p className="font-medium">{i.item_name || i.item_type?.replace(/_/g," ")}</p>
                <p className="text-muted-foreground text-xs">${(i.monthly_amount||0).toFixed(2)}/mo · {i.item_type}</p>
                {i.current_period_end && <p className="text-muted-foreground text-xs">Renews: {format(new Date(i.current_period_end),"MMM d, yyyy")}</p>}
              </div>
              <div className="flex flex-col items-end gap-1"><SBadge status={i.status} /><SBadge status={i.payment_status} /></div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="failed" className="mt-4 space-y-2">
          {items.filter(i => i.status === "past_due" || i.payment_status === "failed").map(i => (
            <div key={i.id} className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-sm flex justify-between">
              <div>
                <p className="font-medium">{i.item_name}</p>
                <p className="text-red-400 text-xs">${(i.monthly_amount||0).toFixed(2)}/mo · {i.item_type?.replace(/_/g," ")}</p>
              </div>
              <SBadge status={i.status} />
            </div>
          ))}
          {!items.filter(i => i.status==="past_due"||i.payment_status==="failed").length && <p className="text-muted-foreground text-sm">No failed payment items.</p>}
        </TabsContent>

        <TabsContent value="gps" className="mt-4 space-y-2">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <MetricCard label="GPS Active" value={gpsItems.filter(i=>i.status==="active").length} color="text-green-400" />
            <MetricCard label="GPS Past Due" value={gpsItems.filter(i=>i.status==="past_due").length} color="text-red-400" />
            <MetricCard label="GPS MRR" value={`$${gpsMRR.toFixed(2)}`} color="text-yellow-400" />
          </div>
          {gpsItems.slice(0,50).map(i => (
            <div key={i.id} className="rounded-lg bg-secondary/30 px-3 py-2.5 text-sm flex justify-between">
              <div>
                <p className="font-medium">{i.item_name}</p>
                <p className="text-muted-foreground text-xs">${(i.monthly_amount||0).toFixed(2)}/mo {i.device_id ? `· device: ${i.device_id.slice(-8)}` : ""}</p>
              </div>
              <SBadge status={i.status} />
            </div>
          ))}
        </TabsContent>

        <TabsContent value="host" className="mt-4 space-y-2">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <MetricCard label="Host Plans Active" value={hostPlatformItems.filter(i=>i.status==="active").length} color="text-green-400" />
            <MetricCard label="Host Plans Trialing" value={hostPlatformItems.filter(i=>i.status==="trialing").length} color="text-blue-400" />
            <MetricCard label="Host Platform MRR" value={`$${hostMRR.toFixed(2)}`} color="text-primary" />
          </div>
          {hostPlatformItems.slice(0,50).map(i => (
            <div key={i.id} className="rounded-lg bg-secondary/30 px-3 py-2.5 text-sm flex justify-between">
              <div>
                <p className="font-medium">{i.item_name}</p>
                <p className="text-muted-foreground text-xs">${(i.monthly_amount||0).toFixed(2)}/mo · {i.plan_code?.replace(/_/g," ")}</p>
              </div>
              <SBadge status={i.status} />
            </div>
          ))}
        </TabsContent>

        <TabsContent value="alerts" className="mt-4 space-y-2">
          {alerts.slice(0,50).map(a => (
            <div key={a.id} className={`rounded-lg px-3 py-2.5 text-sm ${a.status==="open" ? "bg-red-500/10 border border-red-500/20" : "bg-secondary/30"}`}>
              <div className="flex justify-between items-center">
                <p className="font-medium">{a.alert_type?.replace(/_/g," ")}</p>
                <div className="flex gap-1"><SBadge status={a.severity} /><SBadge status={a.status} /></div>
              </div>
              <p className="text-muted-foreground text-xs mt-1">{a.message}</p>
              {a.amount_at_risk > 0 && <p className="text-red-400 text-xs">At risk: ${a.amount_at_risk.toFixed(2)}</p>}
            </div>
          ))}
          {!alerts.length && <p className="text-muted-foreground text-sm">No subscription alerts.</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}