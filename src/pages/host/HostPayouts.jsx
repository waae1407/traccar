import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { DollarSign, AlertTriangle, CheckCircle2, Clock, ExternalLink, Zap, Loader2 } from "lucide-react";

const statusConfig = {
  pending: { label: "Pending", color: "text-yellow-600", bg: "bg-yellow-50" },
  processing: { label: "Processing", color: "text-blue-600", bg: "bg-blue-50" },
  paid: { label: "Paid", color: "text-emerald-600", bg: "bg-emerald-50" },
  failed: { label: "Failed", color: "text-red-600", bg: "bg-red-50" },
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

  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState(null);

  const handleStripeConnect = async () => {
    setStripeLoading(true);
    setStripeError(null);
    try {
      const res = await base44.functions.invoke("createStripeConnectAccount", { host_id: host.id, host_email: host.email, host_name: host.full_name });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        setStripeError(res.data?.error || "Could not generate onboarding link. Please try again.");
      }
    } catch (err) {
      setStripeError(err.message || "Something went wrong. Please try again.");
    } finally {
      setStripeLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>Payouts</h1>
        <p className="text-gray-400 text-sm mt-1">Automated via Stripe Connect — deposits go directly to your bank</p>
      </div>

      {/* Stripe Connect Status */}
      {host && !host.stripe_onboarding_complete ? (
        <div className="p-5 rounded-2xl border border-yellow-200 bg-yellow-50">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-yellow-800 mb-1">Connect Your Bank Account</h3>
              <p className="text-sm text-yellow-700 mb-4">Complete Stripe Connect onboarding to receive automated payouts. Takes about 5 minutes.</p>
              <button onClick={handleStripeConnect} disabled={stripeLoading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                {stripeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                {stripeLoading ? "Connecting…" : "Complete Stripe Onboarding"}
              </button>
              {stripeError && <p className="text-xs text-red-600 mt-2 font-medium">{stripeError}</p>}
            </div>
          </div>
        </div>
      ) : host?.stripe_onboarding_complete && (
        <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <div>
            <p className="text-sm font-bold text-emerald-800">Stripe Connect Active</p>
            <p className="text-xs text-emerald-600">Payouts automatically deposited within 2 business days</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Pending</p>
          <p className="text-xl font-black text-yellow-600" style={{ fontFamily: "var(--font-syne)" }}>${pending.toLocaleString()}</p>
          <p className="text-[10px] text-gray-400 mt-1">Awaiting transfer</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Total Paid</p>
          <p className="text-xl font-black text-emerald-600" style={{ fontFamily: "var(--font-syne)" }}>${totalPaid.toLocaleString()}</p>
          <p className="text-[10px] text-gray-400 mt-1">All time earnings</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Your Cut</p>
          <p className="text-xl font-black text-pink-600" style={{ fontFamily: "var(--font-syne)" }}>{(100 - (host?.commission_rate || 0.20) * 100).toFixed(0)}%</p>
          <p className="text-[10px] text-gray-400 mt-1">Per rental</p>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2 text-sm">
          <Zap className="h-4 w-4 text-pink-500" /> How Automated Payouts Work
        </h3>
        <div className="space-y-3">
          {[
            "Renter is charged weekly on their billing date",
            `uRide automatically keeps ${((host?.commission_rate || 0.20) * 100).toFixed(0)}% (platform fee)`,
            `${(100 - (host?.commission_rate || 0.20) * 100).toFixed(0)}% is instantly transferred to your Stripe account`,
            "Funds arrive in your bank within 2 business days",
            "Stripe automatically issues 1099-K at year end for earnings over $600",
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-3 text-sm text-gray-600">
              <span className="h-6 w-6 rounded-full bg-pink-50 text-pink-600 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
              {step}
            </div>
          ))}
        </div>
      </div>

      {/* Payout history */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h3 className="font-bold text-gray-900">Payout History</h3>
        </div>
        {isLoading ? (
          <div className="p-5 space-y-3">{[1,2,3].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}</div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No payouts yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {sorted.map(p => {
              const cfg = statusConfig[p.status] || statusConfig.pending;
              return (
                <div key={p.id} className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{p.period_start} — {p.period_end}</p>
                    <p className="text-xs text-gray-400">{p.booking_count} bookings · {p.vehicle_count} vehicles</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">${p.net_payout?.toLocaleString()}</p>
                      <p className="text-xs text-gray-400">of ${p.gross_collected?.toLocaleString()} gross</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
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