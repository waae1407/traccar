import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Satellite, CreditCard } from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS = {
  active: "bg-green-500/20 text-green-400",
  trialing: "bg-blue-500/20 text-blue-400",
  past_due: "bg-red-500/20 text-red-400",
  cancelled: "bg-muted text-muted-foreground",
  paid: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
};

function SBadge({ status }) {
  return <Badge className={`text-xs ${STATUS_COLORS[status] || "bg-muted text-muted-foreground"}`}>{status?.replace(/_/g, " ")}</Badge>;
}

export default function CustomerSubscriptions() {
  const { user } = useAuth();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["cust-sub-account", user?.id],
    queryFn: () => user?.id
      ? base44.entities.SubscriptionAccount.filter({ customer_user_id: user.id }, "-updated_date", 1)
      : [],
    enabled: !!user?.id,
  });
  const account = accounts[0];

  const { data: items = [] } = useQuery({
    queryKey: ["cust-sub-items", account?.id],
    queryFn: () => base44.entities.SubscriptionItem.filter({ subscription_account_id: account.id }, "-updated_date", 20),
    enabled: !!account?.id,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ["cust-sub-alerts", account?.id],
    queryFn: () => base44.entities.SubscriptionAlert.filter({ subscription_account_id: account.id }, "-created_at", 5),
    enabled: !!account?.id,
  });

  // Fallback to legacy GPSSubscription if unified not yet populated
  const { data: legacyGPS = [] } = useQuery({
    queryKey: ["cust-legacy-gps", user?.id],
    queryFn: () => base44.entities.GPSSubscription.filter({ customer_user_id: user.id }, "-updated_date", 10),
    enabled: !!user?.id && items.length === 0,
  });

  const gpsItems = items.filter(i => i.item_type === "contactless360_gps");
  const effectiveGPS = gpsItems.length > 0 ? gpsItems : legacyGPS.map(s => ({
    id: s.id, item_name: s.plan_name || "Contactless360 GPS", status: s.subscription_status,
    payment_status: s.payment_status, monthly_amount: s.monthly_price,
    current_period_end: s.current_period_end, device_id: s.device_id, _legacy: true
  }));

  const openAlerts = alerts.filter(a => a.status === "open");
  const monthlyTotal = account?.monthly_total
    || effectiveGPS.filter(i => ["active","trialing"].includes(i.status)).reduce((s,i)=>s+(i.monthly_amount||0),0);

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading subscriptions…</div>;

  if (!account && effectiveGPS.length === 0) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-xl font-bold">Subscriptions</h1>
        <p className="text-muted-foreground text-sm">You have no active subscriptions. <a href="/gps" className="text-primary underline">Get GPS protection</a> for your vehicle.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5 pb-24">
      <div>
        <h1 className="text-xl font-bold">My Subscriptions</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your GPS protection plans and billing.</p>
      </div>

      {openAlerts.map(a => (
        <Alert key={a.id} className="border-red-500/30 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <AlertDescription className="text-red-700 text-sm">{a.message}</AlertDescription>
        </Alert>
      ))}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-4 border border-gray-100 bg-white shadow-sm">
          <p className="text-gray-400 text-xs">Monthly Total</p>
          <p className="text-xl font-bold text-green-600 mt-1">${monthlyTotal.toFixed(2)}</p>
        </div>
        <div className="rounded-xl p-4 border border-gray-100 bg-white shadow-sm">
          <p className="text-gray-400 text-xs">Status</p>
          <div className="mt-1"><SBadge status={account?.status || "active"} /></div>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Satellite className="h-4 w-4 text-yellow-500" /> GPS Protection Plans</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {effectiveGPS.length === 0 && <p className="text-gray-400 text-sm">No active GPS subscriptions.</p>}
          {effectiveGPS.map(i => (
            <div key={i.id} className="flex justify-between items-start rounded-xl bg-gray-50 px-3 py-3">
              <div>
                <p className="font-semibold text-sm text-gray-900">{i.item_name}</p>
                <p className="text-gray-400 text-xs">${(i.monthly_amount||0).toFixed(2)}/mo</p>
                {i.device_id && <p className="text-gray-400 text-xs">Device: {i.device_id.slice(-10)}</p>}
                {i.current_period_end && <p className="text-gray-400 text-xs">Renews {format(new Date(i.current_period_end),"MMM d, yyyy")}</p>}
                {i._legacy && <Badge className="bg-yellow-100 text-yellow-700 text-xs mt-1">Legacy record</Badge>}
              </div>
              <SBadge status={i.status} />
            </div>
          ))}
        </CardContent>
      </Card>

      {account?.payment_method_brand && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="h-4 w-4" /> Payment Method</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{account.payment_method_brand} ···· {account.payment_method_last4}</p></CardContent>
        </Card>
      )}
    </div>
  );
}