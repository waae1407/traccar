import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { DollarSign, AlertTriangle, CheckCircle2, Clock, ExternalLink, Zap } from "lucide-react";

const statusConfig = {
  pending: { label: "Pending", color: "bg-yellow-500/20 text-yellow-400" },
  processing: { label: "Processing", color: "bg-blue-500/20 text-blue-400" },
  paid: { label: "Paid", color: "bg-green-500/20 text-green-400" },
  failed: { label: "Failed", color: "bg-red-500/20 text-red-400" },
};

export default function HostPayouts() {
  const { user } = useAuth();

  const { data: hosts = [] } = useQuery({ queryKey: ["my-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user?.email }), enabled: !!user?.email });
  const host = hosts[0];

  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ["host-payouts", host?.id],
    queryFn: () => base44.entities.HostPayout.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const sorted = [...payouts].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
  const pending = payouts.filter(p => p.status === "pending").reduce((s, p) => s + (p.net_payout || 0), 0);
  const totalPaid = payouts.filter(p => p.status === "paid").reduce((s, p) => s + (p.net_payout || 0), 0);

  const handleStripeConnect = async () => {
    const res = await base44.functions.invoke("createStripeConnectAccount", { host_id: host.id, host_email: host.email, host_name: host.full_name });
    if (res.data?.url) window.open(res.data.url, "_blank");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white font-syne">Payouts</h1>
        <p className="text-white/40 text-sm mt-1">Automated via Stripe Connect — deposits go directly to your bank</p>
      </div>

      {/* Stripe Connect Status */}
      {host && !host.stripe_onboarding_complete ? (
        <div className="p-6 rounded-2xl border border-yellow-500/30 bg-yellow-500/10">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-6 w-6 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-yellow-300 mb-1">Connect Your Bank Account</h3>
              <p className="text-sm text-yellow-400/70 mb-4">You need to complete Stripe Connect onboarding to receive automated payouts. This takes about 5 minutes and requires your bank account and ID.</p>
              <button onClick={handleStripeConnect}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-yellow-500/30 border border-yellow-500/40 hover:bg-yellow-500/40 transition-all">
                <ExternalLink className="h-4 w-4" /> Complete Stripe Onboarding
              </button>
            </div>
          </div>
        </div>
      ) : host?.stripe_onboarding_complete && (
        <div className="p-4 rounded-2xl border border-green-500/30 bg-green-500/10 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-400" />
          <div>
            <p className="text-sm font-bold text-green-300">Stripe Connect Active</p>
            <p className="text-xs text-green-400/70">Payouts automatically deposited within 2 business days of each rental charge</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/[0.08] p-5 glass text-center">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Pending</p>
          <p className="text-2xl font-black text-yellow-400 font-syne">${pending.toLocaleString()}</p>
          <p className="text-xs text-white/30 mt-1">Awaiting transfer</p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] p-5 glass text-center">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Total Paid</p>
          <p className="text-2xl font-black text-green-400 font-syne">${totalPaid.toLocaleString()}</p>
          <p className="text-xs text-white/30 mt-1">All time earnings</p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] p-5 glass text-center">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Commission</p>
          <p className="text-2xl font-black text-primary font-syne">{((host?.commission_rate || 0.20) * 100).toFixed(0)}%</p>
          <p className="text-xs text-white/30 mt-1">Platform fee</p>
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-2xl border border-white/[0.08] p-6 glass">
        <h3 className="font-bold text-white mb-4 flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> How Automated Payouts Work</h3>
        <div className="space-y-3">
          {[
            "Renter is charged weekly on their billing date",
            `uRide automatically keeps ${((host?.commission_rate || 0.20) * 100).toFixed(0)}% (platform fee)`,
            `${(100 - (host?.commission_rate || 0.20) * 100).toFixed(0)}% is instantly transferred to your Stripe account`,
            "Funds arrive in your bank within 2 business days",
            "Stripe automatically issues 1099-K at year end for earnings over $600",
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-3 text-sm text-white/60">
              <span className="h-6 w-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
              {step}
            </div>
          ))}
        </div>
      </div>

      {/* Payout history */}
      <div className="rounded-2xl border border-white/[0.08] glass overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <h3 className="font-bold text-white">Payout History</h3>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-14 rounded-xl bg-white/[0.04] animate-pulse" />)}</div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="h-8 w-8 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm">No payouts yet</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {sorted.map(p => {
              const cfg = statusConfig[p.status] || statusConfig.pending;
              return (
                <div key={p.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{p.period_start} — {p.period_end}</p>
                    <p className="text-xs text-white/40">{p.booking_count} bookings · {p.vehicle_count} vehicles</p>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <div>
                      <p className="text-sm font-bold text-white">${p.net_payout?.toLocaleString()}</p>
                      <p className="text-xs text-white/30">of ${p.gross_collected?.toLocaleString()} gross</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${cfg.color}`}>{cfg.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}