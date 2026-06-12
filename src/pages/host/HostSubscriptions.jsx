import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertTriangle, DollarSign, CreditCard, Zap, Satellite } from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS = {
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  trialing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  past_due: "bg-red-500/20 text-red-400 border-red-500/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  paid: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
};

function SBadge({ status }) {
  return <Badge className={`text-xs ${STATUS_COLORS[status] || "bg-muted text-muted-foreground"}`}>{status?.replace(/_/g, " ")}</Badge>;
}

export default function HostSubscriptions() {
  const { user } = useAuth();

  const { data: hosts = [] } = useQuery({
    queryKey: ["host-sub-host", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["host-sub-account", host?.id],
    queryFn: () => base44.entities.SubscriptionAccount.filter({ host_id: host.id }, "-updated_date", 1),
    enabled: !!host?.id,
  });
  const account = accounts[0];

  const { data: items = [] } = useQuery({
    queryKey: ["host-sub-items", account?.id],
    queryFn: () => base44.entities.SubscriptionItem.filter({ subscription_account_id: account.id }, "-updated_date", 20),
    enabled: !!account?.id,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ["host-sub-alerts", account?.id],
    queryFn: () => base44.entities.SubscriptionAlert.filter({ subscription_account_id: account.id }, "-created_at", 10),
    enabled: !!account?.id,
  });

  // Also pull legacy data as fallback while unified is being populated
  const { data: legacyPlatformSubs = [] } = useQuery({
    queryKey: ["host-legacy-platform-sub", host?.id],
    queryFn: () => base44.entities.HostPlatformSubscription.filter({ host_id: host.id }, "-updated_date", 3),
    enabled: !!host?.id && items.length === 0,
  });
  const { data: legacyGPSSubs = [] } = useQuery({
    queryKey: ["host-legacy-gps-sub", host?.id],
    queryFn: () => base44.entities.GPSSubscription.filter({ host_id: host.id }, "-updated_date", 10),
    enabled: !!host?.id && items.length === 0,
  });

  const openAlerts = alerts.filter(a => a.status === "open");
  const platformItems = items.filter(i => i.item_type === "host_platform");
  const gpsItems = items.filter(i => i.item_type === "contactless360_gps");

  // Fallback to legacy if unified not populated yet
  const effectivePlatformItems = platformItems.length > 0 ? platformItems : legacyPlatformSubs.map(s => ({
    id: s.id, item_name: `uRide ${(s.plan_mode||"").replace(/_/g," ")}`, status: s.status, payment_status: s.last_payment_status,
    monthly_amount: s.monthly_amount, current_period_end: s.current_period_end, plan_code: s.plan_mode, _legacy: true
  }));
  const effectiveGPSItems = gpsItems.length > 0 ? gpsItems : legacyGPSSubs.map(s => ({
    id: s.id, item_name: s.plan_name || "Contactless360 GPS", status: s.subscription_status, payment_status: s.payment_status,
    monthly_amount: s.monthly_price, current_period_end: s.current_period_end, device_id: s.device_id, _legacy: true
  }));

  const monthlyTotal = account?.monthly_total
    || [...effectivePlatformItems, ...effectiveGPSItems].filter(i => ["active","trialing"].includes(i.status)).reduce((s,i)=>s+(i.monthly_amount||0),0);

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading subscriptions…</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black" style={{ fontFamily: "var(--font-syne)" }}>Subscriptions</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your platform plan, GPS devices, and billing.</p>
      </div>

      {openAlerts.map(a => (
        <Alert key={a.id} className="border-red-500/30 bg-red-500/10">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertDescription className="text-red-300 text-sm">{a.message}</AlertDescription>
        </Alert>
      ))}

      {/* Account Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl p-4 border border-border bg-secondary/40">
          <p className="text-muted-foreground text-xs">Monthly Total</p>
          <p className="text-xl font-bold text-green-400 mt-1">${monthlyTotal.toFixed(2)}</p>
        </div>
        <div className="rounded-xl p-4 border border-border bg-secondary/40">
          <p className="text-muted-foreground text-xs">Account Status</p>
          <div className="mt-1"><SBadge status={account?.status || "no_payment_method"} /></div>
        </div>
        <div className="rounded-xl p-4 border border-border bg-secondary/40">
          <p className="text-muted-foreground text-xs">Active Plans</p>
          <p className="text-xl font-bold mt-1">{(account?.active_item_count || 0)}</p>
        </div>
        {account?.next_billing_date && (
          <div className="rounded-xl p-4 border border-border bg-secondary/40">
            <p className="text-muted-foreground text-xs">Next Billing</p>
            <p className="text-sm font-semibold mt-1">{format(new Date(account.next_billing_date), "MMM d, yyyy")}</p>
          </div>
        )}
      </div>

      {/* Host Platform Plan */}
      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Host Platform Plan</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {effectivePlatformItems.length === 0 && <p className="text-muted-foreground text-sm">No active platform plan.</p>}
          {effectivePlatformItems.map(i => (
            <div key={i.id} className="flex justify-between items-start rounded-xl bg-secondary/40 px-3 py-3">
              <div>
                <p className="font-semibold text-sm">{i.item_name}</p>
                <p className="text-muted-foreground text-xs">${(i.monthly_amount||0).toFixed(2)}/mo · {i.plan_code?.replace(/_/g," ") || "—"}</p>
                {i.current_period_end && <p className="text-muted-foreground text-xs">Renews {format(new Date(i.current_period_end),"MMM d, yyyy")}</p>}
                {i._legacy && <Badge className="bg-yellow-500/20 text-yellow-400 text-xs mt-1">Legacy record</Badge>}
              </div>
              <div className="flex flex-col gap-1 items-end"><SBadge status={i.status} /><SBadge status={i.payment_status} /></div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* GPS Subscriptions */}
      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Satellite className="h-4 w-4 text-yellow-400" /> Contactless360 GPS</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {effectiveGPSItems.length === 0 && <p className="text-muted-foreground text-sm">No GPS subscriptions.</p>}
          {effectiveGPSItems.map(i => (
            <div key={i.id} className="flex justify-between items-start rounded-xl bg-secondary/40 px-3 py-3">
              <div>
                <p className="font-semibold text-sm">{i.item_name}</p>
                <p className="text-muted-foreground text-xs">${(i.monthly_amount||0).toFixed(2)}/mo</p>
                {i.device_id && <p className="text-muted-foreground text-xs">Device: {i.device_id.slice(-10)}</p>}
                {i.current_period_end && <p className="text-muted-foreground text-xs">Renews {format(new Date(i.current_period_end),"MMM d, yyyy")}</p>}
              </div>
              <div className="flex flex-col gap-1 items-end"><SBadge status={i.status} /></div>
            </div>
          ))}
        </CardContent>
      </Card>

      {account?.payment_method_brand && (
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="h-4 w-4" /> Payment Method</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm">{account.payment_method_brand} ···· {account.payment_method_last4}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}