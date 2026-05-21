import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { CheckCircle2, AlertTriangle, ExternalLink, Zap, Loader2, Clock } from "lucide-react";
import HostPayoutReceipt from "@/components/host/HostPayoutReceipt";
import HostPageHeader from "@/components/host/HostPageHeader";
import PayoutFilters, { getDateRange } from "@/components/host/payouts/PayoutFilters";
import UpcomingTransfers from "@/components/host/payouts/UpcomingTransfers";
import HeldPayouts from "@/components/host/payouts/HeldPayouts";
import PayoutRow from "@/components/host/payouts/PayoutRow";

function fmt(n) {
  return (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const DEFAULT_FILTERS = { search: "", dateRange: "all", status: "", vehicleId: "" };

export default function HostPayouts() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedPayout, setSelectedPayout] = useState(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState(null);
  const [checkingReturn, setCheckingReturn] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

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

  const { data: myVehicles = [] } = useQuery({
    queryKey: ["host-vehicles-list", host?.id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const { data: activeBookings = [] } = useQuery({
    queryKey: ["host-active-bookings", host?.id],
    queryFn: () => base44.entities.BookingRequest.filter({ host_id: host.id, booking_status: "active" }),
    enabled: !!host?.id,
  });

  // Handle Stripe return
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
          window.location.href = `/host/brand?stripe_connected=1&step=6`;
        } else {
          window.history.replaceState({}, "", window.location.pathname);
          setCheckingReturn(false);
        }
      })
      .catch(() => setCheckingReturn(false));
  }, [host?.id]); // eslint-disable-line

  const commissionRate = host?.commission_rate ?? 0.08;
  const hostKeepPct = `${(100 - commissionRate * 100).toFixed(0)}%`;
  const platformFeeLabel = `${(commissionRate * 100).toFixed(0)}%`;

  // ── FILTER LOGIC ──────────────────────────────────────────────────────────
  const filteredPayouts = useMemo(() => {
    let list = [...payouts].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

    if (filters.status) {
      list = list.filter(p => p.status === filters.status);
    }
    if (filters.vehicleId) {
      // Match by vehicle name (payouts store vehicle_name, not vehicle_id)
      const v = myVehicles.find(v => v.id === filters.vehicleId);
      if (v) {
        const vname = `${v.year} ${v.make} ${v.model}`.toLowerCase();
        list = list.filter(p => (p.vehicle_name || "").toLowerCase().includes(v.make.toLowerCase()));
      }
    }
    if (filters.dateRange !== "all") {
      const range = getDateRange(filters.dateRange);
      if (range) {
        list = list.filter(p => {
          const d = new Date(p.payout_date || p.period_end || p.created_date);
          return d >= range.from && d <= range.to;
        });
      }
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(p =>
        (p.vehicle_name || "").toLowerCase().includes(q) ||
        (p.host_name || "").toLowerCase().includes(q) ||
        (p.booking_request_id || "").toLowerCase().includes(q) ||
        (p.id || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [payouts, filters, myVehicles]);

  // ── KPI CARDS ─────────────────────────────────────────────────────────────
  const pendingNet = payouts.filter(p => p.status === "pending" || p.status === "processing")
    .reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
  const totalPaid = payouts.filter(p => p.status === "paid" || p.status === "released")
    .reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
  const heldTotal = payouts.filter(p => p.status === "held" || p.status === "failed")
    .reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
  const heldCount = payouts.filter(p => p.status === "held" || p.status === "failed").length;

  // ── CSV EXPORT ────────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = [
      ["Date", "Vehicle", "Booking ID", "Gross", "Platform Fee", "Stripe Fee", "Net Payout", "Status"],
      ...filteredPayouts.map(p => [
        p.payout_date || p.period_end || "",
        p.vehicle_name || "",
        p.booking_request_id || "",
        (p.gross_booking_amount || p.gross_collected || 0).toFixed(2),
        (p.uride_platform_fee_amount || p.platform_fee || 0).toFixed(2),
        (p.stripe_fee_amount || 0).toFixed(2),
        (p.net_host_payout || p.net_payout || 0).toFixed(2),
        p.status || "",
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payouts-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStripeConnect = async () => {
    setStripeLoading(true);
    setStripeError(null);
    try {
      if (!host?.id || !host?.email) {
        setStripeError("Host profile not loaded. Please refresh and try again.");
        setStripeLoading(false);
        return;
      }
      const res = await base44.functions.invoke("createStripeConnectAccount", {
        host_id: host.id, host_email: host.email, host_name: host.full_name,
      });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        setStripeError(res.data?.error || "Could not generate onboarding link.");
      }
    } catch (err) {
      setStripeError(err.message || "Something went wrong. Please try again.");
    } finally {
      setStripeLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. HERO */}
      <HostPageHeader
        title="Payouts"
        subtitle="Automated via Stripe Connect — deposits go directly to your bank"
      />

      {/* 2. STRIPE CONNECT STATUS */}
      {checkingReturn && (
        <div className="p-4 rounded-2xl border border-blue-200 bg-blue-50 flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
          <p className="text-sm font-semibold text-blue-800">Verifying your Stripe connection…</p>
        </div>
      )}
      {host && !host.stripe_onboarding_complete && !checkingReturn ? (
        <div className="p-5 rounded-2xl border border-yellow-200 bg-yellow-50">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-yellow-800 mb-1">Connect Your Bank Account</h3>
              <p className="text-sm text-yellow-700 mb-4">
                Complete Stripe Connect onboarding to receive automated payouts. Takes about 5 minutes.
              </p>
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
            <p className="text-xs text-emerald-600">Payouts deposited within 2 business days of each successful payment</p>
          </div>
        </div>
      )}

      {/* 3. KPI CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Pending Transfers</p>
          <p className="text-2xl font-black text-yellow-500" style={{ fontFamily: "var(--font-syne)" }}>
            ${fmt(pendingNet)}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">In transit to bank</p>
        </div>
        <div className="rounded-3xl shadow-sm p-4 text-center"
          style={{ background: "linear-gradient(135deg, hsl(152 60% 46% / 0.12), hsl(199 90% 54% / 0.08))", border: "1px solid hsl(152 60% 46% / 0.2)" }}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Total Paid Out</p>
          <p className="text-2xl font-black text-emerald-600" style={{ fontFamily: "var(--font-syne)" }}>
            ${fmt(totalPaid)}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">Net received to date</p>
        </div>
        <div className={`bg-white rounded-3xl border shadow-sm p-4 text-center ${heldCount > 0 ? "border-orange-200" : "border-gray-100"}`}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Held / Review</p>
          <p className={`text-2xl font-black ${heldCount > 0 ? "text-orange-500" : "text-gray-300"}`}
            style={{ fontFamily: "var(--font-syne)" }}>
            {heldCount > 0 ? `$${fmt(heldTotal)}` : "$0.00"}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">{heldCount > 0 ? `${heldCount} payout${heldCount > 1 ? "s" : ""} held` : "Nothing held"}</p>
        </div>
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">You Keep</p>
          <p className="text-2xl font-black text-pink-600" style={{ fontFamily: "var(--font-syne)" }}>
            {hostKeepPct}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">before Stripe processing</p>
        </div>
      </div>

      {/* 4. FILTERS */}
      <PayoutFilters
        filters={filters}
        onChange={setFilters}
        vehicles={myVehicles}
        onExport={handleExport}
      />

      {/* 5. UPCOMING TRANSFERS */}
      <UpcomingTransfers
        payouts={payouts}
        bookings={activeBookings}
        commissionRate={commissionRate}
      />

      {/* 6. PAYOUT HISTORY */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900">Payout History</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {filteredPayouts.length} record{filteredPayouts.length !== 1 ? "s" : ""}
              {filters.status || filters.dateRange !== "all" || filters.search || filters.vehicleId ? " matching filters" : " total"}
            </p>
          </div>
        </div>
        {isLoading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />)}
          </div>
        ) : filteredPayouts.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">
              {payouts.length === 0 ? "No payouts yet" : "No payouts match your filters"}
            </p>
          </div>
        ) : (
          filteredPayouts.map(p => (
            <PayoutRow
              key={p.id}
              payout={p}
              commissionRate={commissionRate}
              onReceipt={setSelectedPayout}
            />
          ))
        )}
      </div>

      {/* 7. HELD / UNDER REVIEW */}
      <HeldPayouts payouts={payouts} />

      {/* 8. HOW PAYOUTS WORK */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2 text-sm">
          <Zap className="h-4 w-4 text-pink-500" /> How Payouts Work
        </h3>
        <div className="space-y-3">
          {[
            "Renter is charged on their weekly billing date",
            `uRide Platform Fee: ${platformFeeLabel} of booking revenue`,
            `You keep ${hostKeepPct} of booking revenue before Stripe processing fees`,
            "Stripe processing fee is deducted at actual cost (2.9% + $0.30 per charge) — shown transparently per payout",
            "Net payout is transferred to your Stripe Connected account",
            "Funds arrive in your bank within 2 business days",
            "Stripe automatically issues 1099-K at year end for earnings over $600",
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-3 text-sm text-gray-600">
              <span className="h-6 w-6 rounded-full bg-pink-50 text-pink-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
                {i + 1}
              </span>
              {step}
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 rounded-xl bg-gray-50 border border-gray-100 text-xs text-gray-500">
          Stripe processing fees are collected by Stripe. uRideHub does not treat Stripe processing fees as platform revenue. Your net payout may vary slightly by transaction.
        </div>
      </div>

      {/* Receipt modal */}
      {selectedPayout && (
        <HostPayoutReceipt payout={selectedPayout} onClose={() => setSelectedPayout(null)} />
      )}
    </div>
  );
}