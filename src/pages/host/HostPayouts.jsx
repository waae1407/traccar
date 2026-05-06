import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { DollarSign, AlertTriangle, CheckCircle2, Clock, ExternalLink, Zap, Loader2, Receipt, PartyPopper } from "lucide-react";
import HostPayoutReceipt from "@/components/host/HostPayoutReceipt";
import HostPageHeader from "@/components/host/HostPageHeader";

const statusConfig = {
  pending: { label: "Pending", color: "text-yellow-600", bg: "bg-yellow-50" },
  processing: { label: "Processing", color: "text-blue-600", bg: "bg-blue-50" },
  paid: { label: "Paid", color: "text-emerald-600", bg: "bg-emerald-50" },
  failed: { label: "Failed", color: "text-red-600", bg: "bg-red-50" },
};

function fmt(n) {
  return (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function HostPayouts() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedPayout, setSelectedPayout] = useState(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState(null);
  const [justConnected, setJustConnected] = useState(false);
  const [checkingReturn, setCheckingReturn] = useState(false);

  const { data: hosts = [] } = useQuery({
    queryKey: ["my-host", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user?.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ["host-payouts", host?.id],
    queryFn: () => base44.entities.HostPayout.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const sorted = [...payouts].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  const pendingNet = payouts.filter(p => p.status === "pending")
    .reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
  const totalPaid = payouts.filter(p => p.status === "paid")
    .reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);

  // When Stripe redirects back, check if onboarding is now complete and update host record
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isReturn = params.get("stripe_success") || params.get("stripe_refresh");
    if (!isReturn || !host?.id || host?.stripe_onboarding_complete) return;

    setCheckingReturn(true);
    base44.functions.invoke("getStripeConnectStatus", { host_id: host.id })
      .then(async (res) => {
        if (res.data?.charges_enabled || res.data?.onboarding_complete) {
          await base44.entities.Host.update(host.id, { stripe_onboarding_complete: true });
          qc.invalidateQueries({ queryKey: ["my-host"] });
          setJustConnected(true);
          // Clean up URL params
          window.history.replaceState({}, "", window.location.pathname);
        }
      })
      .finally(() => setCheckingReturn(false));
  }, [host?.id]); // eslint-disable-line

  const commissionRate = host?.commission_rate ?? 0.08;
  const platformFeeLabel = `${(commissionRate * 100).toFixed(0)}%`;
  const hostKeepsLabel = `${(100 - commissionRate * 100).toFixed(0)}%`;

  const handleStripeConnect = async () => {
    setStripeLoading(true);
    setStripeError(null);
    try {
      if (!host?.id || !host?.email) {
        setStripeError("Host profile not loaded. Please refresh and try again.");
        setStripeLoading(false);
        return;
      }
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
      <HostPageHeader
        title="Payouts"
        subtitle="Automated via Stripe Connect — deposits go directly to your bank"
      />

      {/* Checking return from Stripe */}
      {checkingReturn && (
        <div className="p-4 rounded-2xl border border-blue-200 bg-blue-50 flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
          <p className="text-sm font-semibold text-blue-800">Verifying your Stripe connection…</p>
        </div>
      )}

      {/* Just connected celebration */}
      {justConnected && (
        <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle2 className="h-6 w-6 text-emerald-500 flex-shrink-0" />
            <p className="font-bold text-emerald-800 text-base">🎉 Stripe Connected Successfully!</p>
          </div>
          <p className="text-sm text-emerald-700">Your bank account is now linked. Payouts will be automatically deposited within 2 business days of each booking payment.</p>
        </div>
      )}

      {/* Stripe Connect Status */}
      {host && !host.stripe_onboarding_complete && !checkingReturn ? (
        <div className="p-5 rounded-2xl border border-yellow-200 bg-yellow-50">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-yellow-800 mb-1">Connect Your Bank Account</h3>
              <p className="text-sm text-yellow-700 mb-4">Complete Stripe Connect onboarding to receive automated payouts. Takes about 5 minutes.</p>
              <button onClick={handleStripeConnect} disabled={stripeLoading || !host?.id}
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
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 text-center hover:shadow-md transition-shadow">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Pending</p>
          <p className="text-2xl font-black text-yellow-500" style={{ fontFamily: "var(--font-syne)" }}>${fmt(pendingNet)}</p>
          <p className="text-[10px] text-gray-400 mt-1">Awaiting transfer</p>
        </div>
        <div className="rounded-3xl shadow-sm p-4 text-center" style={{ background: "linear-gradient(135deg, hsl(152 60% 46% / 0.12), hsl(199 90% 54% / 0.08))", border: "1px solid hsl(152 60% 46% / 0.2)" }}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Total Paid</p>
          <p className="text-2xl font-black text-emerald-600" style={{ fontFamily: "var(--font-syne)" }}>${fmt(totalPaid)}</p>
          <p className="text-[10px] text-gray-400 mt-1">Net received</p>
        </div>
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 text-center hover:shadow-md transition-shadow">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">You Keep</p>
          <p className="text-2xl font-black text-pink-600" style={{ fontFamily: "var(--font-syne)" }}>{hostKeepsLabel}</p>
          <p className="text-[10px] text-gray-400 mt-1">{platformFeeLabel} platform fee</p>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2 text-sm">
          <Zap className="h-4 w-4 text-pink-500" /> How Payouts Work
        </h3>
        <div className="space-y-3">
          {[
            "Renter is charged on their weekly billing date",
            `Uride Platform Fee: ${platformFeeLabel} of booking revenue`,
            `You keep ${hostKeepsLabel} before Stripe processing`,
            "Stripe processing fee is deducted at actual cost (shown transparently on each receipt)",
            "Net payout is transferred to your Stripe Connected account",
            "Funds arrive in your bank within 2 business days",
            "Stripe automatically issues 1099-K at year end for earnings over $600",
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-3 text-sm text-gray-600">
              <span className="h-6 w-6 rounded-full bg-pink-50 text-pink-600 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
              {step}
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 rounded-xl bg-gray-50 border border-gray-100 text-xs text-gray-500">
          Stripe processing fees are collected by Stripe. UrideHub does not treat Stripe processing fees as platform revenue.
        </div>
      </div>

      {/* Payout history */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h3 className="font-bold text-gray-900">Payout History</h3>
          <p className="text-xs text-gray-400 mt-0.5">Click "Receipt" to see the full fee breakdown</p>
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
              const gross = p.gross_booking_amount || p.gross_collected || 0;
              const net = p.net_host_payout || p.net_payout || 0;
              const stripeFee = p.stripe_fee_amount || 0;
              const platformFee = p.uride_platform_fee_amount || p.platform_fee || 0;
              const stripeRate = p.stripe_effective_rate ? `${p.stripe_effective_rate.toFixed(2)}%` : null;

              return (
                <div key={p.id} className="px-5 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">
                        {p.vehicle_name || `${p.period_start} — ${p.period_end}`}
                      </p>
                      <p className="text-xs text-gray-400">{p.period_start} — {p.period_end}</p>
                      {/* Fee breakdown mini */}
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
                        <span>Booking: <span className="text-gray-600 font-medium">${fmt(gross)}</span></span>
                        {stripeFee > 0 && <span>Stripe{stripeRate ? ` (${stripeRate})` : ""}: <span className="text-gray-600">-${fmt(stripeFee)}</span></span>}
                        <span>Uride Fee ({(( p.uride_platform_fee_rate || commissionRate) * 100).toFixed(0)}%): <span className="text-gray-600">-${fmt(platformFee)}</span></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">${fmt(net)}</p>
                        <p className="text-xs text-gray-400">net payout</p>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                      <button
                        onClick={() => setSelectedPayout(p)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                      >
                        <Receipt className="h-3 w-3" /> Receipt
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Receipt modal */}
      {selectedPayout && (
        <HostPayoutReceipt payout={selectedPayout} onClose={() => setSelectedPayout(null)} />
      )}
    </div>
  );
}