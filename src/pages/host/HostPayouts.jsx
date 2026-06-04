import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { CheckCircle2, AlertTriangle, ExternalLink, Zap, Loader2, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import HostPayoutReceipt from "@/components/host/HostPayoutReceipt";
import HostPageHeader from "@/components/host/HostPageHeader";
import PayoutFilters, { DEFAULT_FILTERS, getDateRange } from "@/components/host/payouts/PayoutFilters";
import UpcomingTransfers from "@/components/host/payouts/UpcomingTransfers";
import HeldPayouts from "@/components/host/payouts/HeldPayouts";
import PayoutRow from "@/components/host/payouts/PayoutRow";
import PayoutDetailDrawer from "@/components/host/payouts/PayoutDetailDrawer";
import PaymentOperationalAlertPanel from "@/components/payments/PaymentOperationalAlertPanel";

const PAGE_SIZE = 20;

function fmt(n) {
  return (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function HostPayouts() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedPayout, setSelectedPayout] = useState(null);
  const [receiptPayout, setReceiptPayout] = useState(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState(null);
  const [checkingReturn, setCheckingReturn] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  // ── DATA FETCHING (all host-scoped) ───────────────────────────────────────
  const { data: hosts = [] } = useQuery({
    queryKey: ["my-host", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user?.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const { data: allPayouts = [], isLoading: loadingPayouts } = useQuery({
    queryKey: ["host-payouts", host?.id],
    queryFn: () => base44.entities.HostPayout.filter({ host_id: host.id }, "-created_date", 500),
    enabled: !!host?.id,
  });

  const { data: myVehicles = [] } = useQuery({
    queryKey: ["host-vehicles-list", host?.id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const { data: myBookings = [] } = useQuery({
    queryKey: ["host-bookings-v2", host?.id, myVehicles.map(v => v.id).join(",")],
    queryFn: async () => {
      const results = [];
      // By host_id
      if (host?.id) {
        try {
          const byHost = await base44.entities.BookingRequest.filter({ host_id: host.id }, "-created_date", 300);
          results.push(...byHost);
        } catch (_) { /* ignore */ }
      }
      // By vehicle_id for each host vehicle
      if (myVehicles.length > 0) {
        const perVehicle = await Promise.all(
          myVehicles.slice(0, 15).map(v =>
            base44.entities.BookingRequest.filter({ vehicle_id: v.id }, "-created_date", 50).catch(() => [])
          )
        );
        results.push(...perVehicle.flat());
      }
      const seen = new Set();
      return results.filter(b => { if (seen.has(b.id)) return false; seen.add(b.id); return true; });
    },
    enabled: !!host?.id || myVehicles.length > 0,
  });

  const { data: myDisputes = [] } = useQuery({
    queryKey: ["host-disputes", host?.id],
    queryFn: () => base44.entities.Dispute.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  // Also load PaymentLog to backfill missing HostPayout records.
  // Query BOTH by host_id AND by each vehicle_id, since older records may have
  // an empty host_id if booking.host_id wasn't set at payment time.
  const { data: paymentLogs = [] } = useQuery({
    queryKey: ["host-payment-logs-v2", host?.id, myVehicles.map(v => v.id).join(",")],
    queryFn: async () => {
      const results = [];

      // Approach 1: by host_id (works for newer records)
      if (host?.id) {
        try {
          const byHost = await base44.entities.PaymentLog.filter({ host_id: host.id }, "-paid_at", 300);
          results.push(...byHost);
        } catch (_) { /* ignore */ }
      }

      // Approach 2: by vehicle_id (catches records where host_id was blank)
      if (myVehicles.length > 0) {
        const perVehicle = await Promise.all(
          myVehicles.slice(0, 15).map(v =>
            base44.entities.PaymentLog.filter({ vehicle_id: v.id }, "-paid_at", 100).catch(() => [])
          )
        );
        results.push(...perVehicle.flat());
      }

      // Dedup by id
      const seen = new Set();
      return results.filter(l => { if (seen.has(l.id)) return false; seen.add(l.id); return true; });
    },
    enabled: !!host?.id || myVehicles.length > 0,
  });

  // ── LOOKUP MAPS ───────────────────────────────────────────────────────────
  const bookingMap = useMemo(() =>
    Object.fromEntries(myBookings.map(b => [b.id, b])), [myBookings]);

  const disputeMap = useMemo(() => {
    const map = {};
    for (const d of myDisputes) {
      if (d.booking_request_id) map[d.booking_request_id] = d;
    }
    return map;
  }, [myDisputes]);

  // ── SYNTHESIZE MISSING PAYOUT RECORDS FROM PAYMENT LOGS ───────────────────
  // For payments that predate the HostPayout fix, build display records from PaymentLog
  const mergedPayouts = useMemo(() => {
    const existingBookingIds = new Set(
      allPayouts.filter(p => p.booking_request_id).map(p => `${p.booking_request_id}_${p.period_start || ""}`)
    );

    const synthesized = paymentLogs
      .filter(log => log.status === "paid") // only paid logs
      .filter(log => {
        // Skip if there's already a HostPayout for this booking+period
        if (!log.booking_request_id) return false;
        // If ANY HostPayout exists for this booking, skip (payout system is active)
        const hasPayoutForBooking = allPayouts.some(p => p.booking_request_id === log.booking_request_id);
        return !hasPayoutForBooking;
      })
      .map(log => {
        const gross = log.amount || 0;
        const commRate = host?.commission_rate ?? 0.08;
        const platformFee = Math.round(gross * commRate * 100) / 100;
        // Stripe fee is already grossed into the charge — the actual transfer to host
        // is gross - platformFee only (matching processWeeklyBilling logic exactly).
        const net = Math.max(0, gross - platformFee);
        // Stripe fee is informational: what Stripe took from the gross before settling
        const stripeFee = Math.round((gross - gross / (1 + 0.029) - 0.30 / (1 - 0.029)) * 100) / 100;
        const booking = log.booking_request_id ? bookingMap[log.booking_request_id] : null;

        return {
          id: `log_${log.id}`,
          _synthesized: true,
          host_id: host?.id,
          booking_request_id: log.booking_request_id,
          vehicle_name: log.vehicle_name || "",
          vehicle_id: log.vehicle_id || "",
          gross_booking_amount: gross,
          gross_collected: gross,
          stripe_fee_amount: stripeFee,
          uride_platform_fee_amount: platformFee,
          uride_platform_fee_rate: commRate,
          net_host_payout: net,
          net_payout: net,
          platform_fee: platformFee,
          status: "paid",
          payout_date: log.paid_at ? log.paid_at.split("T")[0] : log.created_date?.split("T")[0],
          period_start: booking?.start_date || "",
          period_end: log.paid_at ? log.paid_at.split("T")[0] : "",
          stripe_transfer_id: "",
          created_date: log.paid_at || log.created_date,
          _from_payment_log: true,
          _week_number: log.week_number,
          _customer_name: log.customer_name || "",
          _customer_email: log.customer_email || "",
        };
      });

    return [...allPayouts, ...synthesized];
  }, [allPayouts, paymentLogs, host, bookingMap]);

  // ── HANDLE STRIPE RETURN ──────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isReturn = params.get("stripe_success") || params.get("stripe_refresh");
    if (!isReturn || !host?.id || host?.stripe_onboarding_complete) return;

    setCheckingReturn(true);
    base44.functions.invoke("getStripeConnectStatus", { host_id: host.id })
      .then(async res => {
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

  // ── FILTER LOGIC ──────────────────────────────────────────────────────────
  const filteredPayouts = useMemo(() => {
    let list = [...mergedPayouts];

    // Date range
    if (filters.dateRange !== "all") {
      const range = getDateRange(filters.dateRange);
      if (range) {
        list = list.filter(p => {
          const d = new Date(p.payout_date || p.period_end || p.created_date);
          return d >= range.from && d <= range.to;
        });
      }
    }

    // Status
    if (filters.status) {
      list = list.filter(p => p.status === filters.status);
    }

    // Vehicle — match host's vehicle list
    if (filters.vehicleId) {
      const v = myVehicles.find(v => v.id === filters.vehicleId);
      if (v) {
        const makeLower = v.make.toLowerCase();
        const modelLower = v.model.toLowerCase();
        list = list.filter(p =>
          (p.vehicle_name || "").toLowerCase().includes(makeLower) ||
          (p.vehicle_name || "").toLowerCase().includes(modelLower)
        );
      }
    }

    // Search: booking ID, renter, vehicle, payout ID
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(p => {
        const booking = p.booking_request_id ? bookingMap[p.booking_request_id] : null;
        return (
          (p.vehicle_name || "").toLowerCase().includes(q) ||
          (p.booking_request_id || "").toLowerCase().includes(q) ||
          (p.id || "").toLowerCase().includes(q) ||
          (p.stripe_transfer_id || "").toLowerCase().includes(q) ||
          (booking?.customer_full_name || "").toLowerCase().includes(q) ||
          (booking?.user_email || "").toLowerCase().includes(q)
        );
      });
    }

    return list.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
  }, [mergedPayouts, filters, myVehicles, bookingMap]);

  // ── KPI CARDS (from FILTERED payouts) ─────────────────────────────────────
  const kpis = useMemo(() => {
    const pending = filteredPayouts.filter(p => ["pending", "processing"].includes(p.status));
    const paid = filteredPayouts.filter(p => ["paid", "released"].includes(p.status));
    const held = filteredPayouts.filter(p => ["held", "failed"].includes(p.status));

    const pendingTotal = pending.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
    const paidTotal = paid.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
    const heldTotal = held.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);

    // Average keep % from payouts with gross > 0
    const withGross = paid.filter(p => (p.gross_booking_amount || p.gross_collected || 0) > 0);
    let avgKeepPct = null;
    if (withGross.length > 0) {
      const ratios = withGross.map(p => {
        const gross = p.gross_booking_amount || p.gross_collected || 0;
        const net = p.net_host_payout || p.net_payout || 0;
        return net / gross;
      });
      avgKeepPct = (ratios.reduce((s, r) => s + r, 0) / ratios.length * 100).toFixed(1);
    }

    return { pendingTotal, paidTotal, heldTotal, heldCount: held.length, avgKeepPct };
  }, [filteredPayouts]);

  // ── PAGINATION ────────────────────────────────────────────────────────────
  // Exclude pending/processing/held from history (shown in upcoming/held sections)
  const historyPayouts = filteredPayouts.filter(p => !["pending", "processing", "held"].includes(p.status));
  const totalPages = Math.max(1, Math.ceil(historyPayouts.length / PAGE_SIZE));
  const pagedHistory = historyPayouts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [filters]);

  // ── CSV EXPORT ────────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = [
      ["Payout ID", "Date", "Booking ID", "Customer", "Vehicle", "Gross", "Platform Fee", "Stripe Fee", "Reserve/Hold", "Net Payout", "Status", "Hold Reason", "Paid Date", "Stripe Transfer ID"],
      ...filteredPayouts.map(p => {
        const booking = p.booking_request_id ? bookingMap[p.booking_request_id] : null;
        const gross = p.gross_booking_amount || p.gross_collected || 0;
        const net = p.net_host_payout || p.net_payout || 0;
        const stripeFee = p.stripe_fee_amount || 0;
        const platformFee = p.uride_platform_fee_amount || p.platform_fee || 0;
        const reserve = Math.max(0, gross - platformFee - stripeFee - net);
        return [
          p.id || "",
          p.created_date ? new Date(p.created_date).toISOString().split("T")[0] : "",
          p.booking_request_id || "",
          booking?.customer_full_name || booking?.user_email || "",
          p.vehicle_name || "",
          gross.toFixed(2),
          platformFee.toFixed(2),
          stripeFee.toFixed(2),
          reserve.toFixed(2),
          net.toFixed(2),
          p.status || "",
          p.hold_reason || "",
          p.payout_date || "",
          p.stripe_transfer_id || "",
        ];
      }),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
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
      const res = await base44.functions.invoke("createStripeConnectAccount", {
        host_id: host.id, host_email: host.email, host_name: host.full_name,
      });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        setStripeError(res.data?.error || "Could not generate onboarding link.");
      }
    } catch (err) {
      setStripeError(err.message || "Something went wrong.");
    } finally {
      setStripeLoading(false);
    }
  };

  const commissionRate = host?.commission_rate ?? 0.08;
  const platformFeeLabel = `${(commissionRate * 100).toFixed(0)}%`;
  const defaultKeepPct = `${(100 - commissionRate * 100).toFixed(0)}%`;

  return (
    <div className="space-y-5">
      {/* 1. HERO */}
      <HostPageHeader title="Payouts" subtitle="Automated via Stripe Connect — deposits go directly to your bank" />
      <PaymentOperationalAlertPanel scope="host" hostId={host?.id} limit={3} />

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
              <p className="text-sm text-yellow-700 mb-3">
                Payouts cannot be sent until you complete Stripe Connect onboarding. Takes about 5 minutes.
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

      {/* 3. KPI CARDS — data-driven from filtered payouts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button type="button" onClick={() => setFilters(f => ({ ...f, status: f.status === "pending" ? "" : "pending" }))} className={`bg-white rounded-3xl border shadow-sm p-4 text-center transition-all hover:-translate-y-0.5 ${filters.status === "pending" ? "border-pink-300 ring-2 ring-pink-100" : "border-gray-100"}`}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Pending Transfers</p>
          <p className="text-2xl font-black text-yellow-500" style={{ fontFamily: "var(--font-syne)" }}>${fmt(kpis.pendingTotal)}</p>
          <p className="text-[10px] text-gray-400 mt-1">In transit to bank</p>
        </button>
        <button type="button" onClick={() => setFilters(f => ({ ...f, status: f.status === "paid" ? "" : "paid" }))} className={`rounded-3xl shadow-sm p-4 text-center transition-all hover:-translate-y-0.5 ${filters.status === "paid" ? "ring-2 ring-pink-100" : ""}`}
          style={{ background: "linear-gradient(135deg, hsl(152 60% 46% / 0.12), hsl(199 90% 54% / 0.08))", border: filters.status === "paid" ? "1px solid #f9a8d4" : "1px solid hsl(152 60% 46% / 0.2)" }}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Total Paid</p>
          <p className="text-2xl font-black text-emerald-600" style={{ fontFamily: "var(--font-syne)" }}>${fmt(kpis.paidTotal)}</p>
          <p className="text-[10px] text-gray-400 mt-1">Net received · filtered period</p>
        </button>
        <button type="button" onClick={() => setFilters(f => ({ ...f, status: f.status === "held" ? "" : "held" }))} className={`bg-white rounded-3xl border shadow-sm p-4 text-center transition-all hover:-translate-y-0.5 ${filters.status === "held" ? "border-pink-300 ring-2 ring-pink-100" : kpis.heldCount > 0 ? "border-orange-200" : "border-gray-100"}`}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Held / Review</p>
          <p className={`text-2xl font-black ${kpis.heldCount > 0 ? "text-orange-500" : "text-gray-300"}`} style={{ fontFamily: "var(--font-syne)" }}>{kpis.heldCount > 0 ? `$${fmt(kpis.heldTotal)}` : "$0.00"}</p>
          <p className="text-[10px] text-gray-400 mt-1">{kpis.heldCount > 0 ? `${kpis.heldCount} payout${kpis.heldCount > 1 ? "s" : ""} on hold` : "Nothing held"}</p>
        </button>
        <button type="button" onClick={() => setFilters(f => ({ ...f, status: "" }))} className={`bg-white rounded-3xl border shadow-sm p-4 text-center transition-all hover:-translate-y-0.5 ${!filters.status ? "border-pink-300 ring-2 ring-pink-100" : "border-gray-100"}`}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Avg Keep %</p>
          <p className="text-2xl font-black text-pink-600" style={{ fontFamily: "var(--font-syne)" }}>{kpis.avgKeepPct !== null ? `${kpis.avgKeepPct}%` : defaultKeepPct}</p>
          <p className="text-[10px] text-gray-400 mt-1">{kpis.avgKeepPct !== null ? "avg after all fees" : "before Stripe processing"}</p>
        </button>
      </div>

      {/* 4. FILTERS */}
      <PayoutFilters
        filters={filters}
        onChange={f => { setFilters(f); setPage(1); }}
        vehicles={myVehicles}
        onExport={handleExport}
        resultCount={filteredPayouts.length}
      />

      {/* 5. UPCOMING TRANSFERS */}
      <UpcomingTransfers
        payouts={filteredPayouts}
        bookingMap={bookingMap}
        onSelect={setSelectedPayout}
      />

      {/* 6. PAYOUT HISTORY */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900">Payout History</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {historyPayouts.length} record{historyPayouts.length !== 1 ? "s" : ""}
              {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
            </p>
          </div>
        </div>
        {loadingPayouts ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />)}
          </div>
        ) : pagedHistory.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">
              {mergedPayouts.length === 0
                ? "Payouts will appear here after your first successful booking payment."
                : "No payouts match your current filters."}
            </p>
          </div>
        ) : (
          <>
            {pagedHistory.map(p => (
              <PayoutRow
                key={p.id}
                payout={p}
                booking={p.booking_request_id ? bookingMap[p.booking_request_id] : null}
                onSelect={setSelectedPayout}
                onReceipt={setReceiptPayout}
              />
            ))}
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-gray-50 flex items-center justify-between">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </button>
                <span className="text-xs text-gray-400">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed">
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 7. HELD / UNDER REVIEW */}
      <HeldPayouts
        payouts={filteredPayouts}
        bookingMap={bookingMap}
        disputeMap={disputeMap}
        onSelect={setSelectedPayout}
      />

      {/* 8. HOW PAYOUTS WORK */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2 text-sm">
          <Zap className="h-4 w-4 text-pink-500" /> How Payouts Work
        </h3>
        <div className="space-y-3">
          {[
            "Renter is charged on their weekly billing date",
            `uRide Platform Fee: ${platformFeeLabel} of booking revenue`,
            `You keep ${defaultKeepPct} of booking revenue before Stripe processing fees`,
            "Stripe processing fee is deducted at actual cost (2.9% + $0.30 per charge) — shown on each payout",
            "Net payout is transferred to your Stripe Connected account",
            "Funds arrive in your bank within 2 business days",
            "Stripe automatically issues 1099-K at year end for earnings over $600",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3 text-sm text-gray-600">
              <span className="h-6 w-6 rounded-full bg-pink-50 text-pink-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              {step}
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 rounded-xl bg-gray-50 border border-gray-100 text-xs text-gray-500">
          Stripe fees are collected by Stripe and not treated as uRideHub platform revenue. Your actual keep % varies slightly per transaction based on Stripe's processing fee.
        </div>
      </div>

      {/* DETAIL DRAWER */}
      {selectedPayout && (
        <PayoutDetailDrawer
          payout={selectedPayout}
          booking={selectedPayout.booking_request_id ? bookingMap[selectedPayout.booking_request_id] : null}
          dispute={selectedPayout.booking_request_id ? disputeMap[selectedPayout.booking_request_id] : null}
          onClose={() => setSelectedPayout(null)}
        />
      )}

      {/* RECEIPT MODAL */}
      {receiptPayout && (
        <HostPayoutReceipt payout={receiptPayout} onClose={() => setReceiptPayout(null)} />
      )}
    </div>
  );
}