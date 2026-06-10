import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Info, Wallet, ArrowDownCircle } from "lucide-react";
import { format, differenceInDays } from "date-fns";

function WalletStatusBanner({ balance, openCount }) {
  if (balance < 0) {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4">
        <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold text-yellow-300 text-sm">You owe ${Math.abs(balance).toFixed(2)} in uRide platform fees</p>
          <p className="text-xs text-yellow-400/80 mt-1">
            These fees were added because {openCount} payment{openCount !== 1 ? 's were' : ' was'} collected outside uRide payments.
            This balance will be automatically offset from your next eligible payout.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl bg-green-500/10 border border-green-500/30 p-4">
      <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
      <p className="text-sm text-green-300 font-medium">Your uRide fee balance is clear.</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    open: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    partially_paid: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    offset_applied: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    paid: "bg-green-500/20 text-green-400 border-green-500/30",
    waived: "bg-muted text-muted-foreground border-border",
    disputed: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const labels = {
    open: "Pending Offset",
    partially_paid: "Partially Cleared",
    offset_applied: "Offset Applied",
    paid: "Cleared",
    waived: "Waived",
    disputed: "Disputed",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${map[status] || map.open}`}>
      {labels[status] || status}
    </span>
  );
}

export default function HostWalletSection() {
  const { user } = useAuth();

  const { data: hosts = [] } = useQuery({
    queryKey: ["wallet-host", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const { data: walletData, isLoading } = useQuery({
    queryKey: ["host-wallet", host?.id],
    queryFn: () => base44.functions.invoke("getHost360", { host_id: host.id }),
    enabled: !!host?.id,
    select: (res) => res?.data?.wallet || null,
    staleTime: 30000,
  });

  const { data: walletFees } = useQuery({
    queryKey: ["host-wallet-fees", host?.id],
    queryFn: () => base44.functions.invoke("getHost360", { host_id: host.id }),
    enabled: !!host?.id,
    select: (res) => res?.data?.manual_payment_fees || null,
    staleTime: 30000,
  });

  if (isLoading || !walletData) return null;

  const balance = walletData.balance || 0;
  const openItems = walletData.open_receivables || [];

  if (balance >= 0 && openItems.length === 0) {
    // Show a clean green "all clear" only if there are also no recently closed items
    const recentlyClosed = (walletFees?.offset_applied || []).length + (walletFees?.paid || []).length;
    if (recentlyClosed === 0) return null;
  }

  return (
    <Card className="glass border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-primary" />
          uRide Fee Balance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <WalletStatusBanner balance={balance} openCount={openItems.length} />

        {balance < 0 && (
          <div className="rounded-lg bg-secondary/30 border border-border p-3 text-xs text-muted-foreground space-y-1">
            <p className="flex items-center gap-1.5 text-foreground font-medium"><Info className="h-3.5 w-3.5" /> Why was this fee added?</p>
            <p>uRide charges a platform fee when you collect payments outside uRide. This fee is tracked in your fee balance and deducted from your next eligible payout automatically — no action needed.</p>
          </div>
        )}

        {openItems.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Open Items</p>
            {openItems.map((r) => {
              const ageDays = r.created_at ? differenceInDays(new Date(), new Date(r.created_at)) : null;
              return (
                <div key={r.id} className="rounded-lg bg-yellow-500/8 border border-yellow-500/20 px-3 py-2.5">
                  <div className="flex justify-between items-start gap-2">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-foreground">
                        ${(r.remaining_amount || r.platform_fee_amount_due || 0).toFixed(2)} fee
                        <span className="text-muted-foreground font-normal"> from ${(r.gross_collected_amount || 0).toFixed(2)} {r.payment_method?.toUpperCase()} payment</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.customer_email} · {r.plan_mode?.replace(/_/g, ' ')} plan · {((r.platform_fee_rate || 0) * 100).toFixed(0)}% fee
                      </p>
                      {r.created_at && (
                        <p className="text-xs text-muted-foreground">
                          Added {format(new Date(r.created_at), 'MMM d, yyyy')}
                          {ageDays !== null && ageDays > 6 && <span className="text-yellow-400 ml-1">· {ageDays} days ago</span>}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {(walletFees?.offset_applied || []).length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recently Cleared</p>
            {(walletFees.offset_applied || []).slice(0, 5).map((r) => (
              <div key={r.id} className="rounded-lg bg-blue-500/8 border border-blue-500/20 px-3 py-2 flex justify-between items-center">
                <div>
                  <p className="text-sm text-foreground">${(r.platform_fee_amount_due || r.original_amount || 0).toFixed(2)} offset from payout</p>
                  <p className="text-xs text-muted-foreground">{r.customer_email} · {r.resolved_at ? format(new Date(r.resolved_at), 'MMM d, yyyy') : 'Recently'}</p>
                </div>
                <div className="flex items-center gap-1.5 text-blue-400 text-xs font-medium">
                  <ArrowDownCircle className="h-3.5 w-3.5" />
                  Offset Applied
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}