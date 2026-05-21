import { base44 } from "@/api/base44Client";
import { assertOperationalScope, isWithinSharedDateRange, textMatches } from "./sharedOperationalFilters";

function indexById(records = []) {
  return Object.fromEntries(records.filter(Boolean).map((record) => [record.id, record]));
}

function resolveHostId(record, vehiclesById, bookingsById) {
  return record.host_id || vehiclesById[record.vehicle_id]?.host_id || bookingsById[record.booking_request_id]?.host_id || "";
}

function estimateStripeFee(gross) {
  if (!gross) return 0;
  return Math.max(0, Math.round((gross * 0.029 + 0.30) * 100) / 100);
}

function enrichPayout(payout, hostsById, vehiclesById, bookingsById, disputesByBookingId) {
  const hostId = resolveHostId(payout, vehiclesById, bookingsById);
  const host = hostsById[hostId] || null;
  const booking = bookingsById[payout.booking_request_id] || null;
  const dispute = disputesByBookingId[payout.booking_request_id] || null;
  return {
    ...payout,
    host_id: hostId,
    host_name: payout.host_name || host?.business_name || host?.full_name || "",
    host_email: payout.host_email || host?.email || "",
    customer_name: booking?.customer_full_name || payout.customer_name || "",
    customer_email: booking?.user_email || payout.customer_email || "",
    booking,
    dispute,
    _synthesized: false,
    _displayOnly: false,
  };
}

function synthesizePayoutsFromPaymentLogs(paymentLogs, payouts, hostsById, vehiclesById, bookingsById) {
  return paymentLogs
    .filter((log) => log.status === "paid" && log.booking_request_id)
    .filter((log) => !payouts.some((payout) => payout.booking_request_id === log.booking_request_id))
    .map((log) => {
      const hostId = resolveHostId(log, vehiclesById, bookingsById);
      const host = hostsById[hostId] || null;
      const gross = log.amount || 0;
      const commissionRate = host?.commission_rate ?? 0.08;
      const platformFee = Math.round(gross * commissionRate * 100) / 100;
      const net = Math.max(0, gross - platformFee);
      const booking = bookingsById[log.booking_request_id] || null;

      return {
        id: `synth_${log.id}`,
        source_payment_log_id: log.id,
        _synthesized: true,
        _displayOnly: true,
        _actionsDisabled: true,
        host_id: hostId,
        host_name: host?.business_name || host?.full_name || "",
        host_email: host?.email || "",
        booking_request_id: log.booking_request_id,
        vehicle_id: log.vehicle_id || booking?.vehicle_id || "",
        vehicle_name: log.vehicle_name || booking?.vehicle_name || "",
        customer_name: log.customer_name || booking?.customer_full_name || "",
        customer_email: log.customer_email || booking?.user_email || "",
        gross_booking_amount: gross,
        gross_collected: gross,
        stripe_fee_amount: estimateStripeFee(gross),
        uride_platform_fee_amount: platformFee,
        uride_platform_fee_rate: commissionRate,
        net_host_payout: net,
        net_payout: net,
        platform_fee: platformFee,
        status: "paid",
        payout_date: log.paid_at ? log.paid_at.split("T")[0] : log.created_date?.split("T")[0],
        period_start: booking?.start_date || "",
        period_end: log.paid_at ? log.paid_at.split("T")[0] : "",
        created_date: log.paid_at || log.created_date,
        booking,
      };
    });
}

function applyPayoutFilters(payouts, filters = {}) {
  return payouts.filter((payout) => {
    if (filters.hostId && payout.host_id !== filters.hostId) return false;
    if (filters.vehicleId && payout.vehicle_id !== filters.vehicleId) return false;
    if (filters.bookingId && payout.booking_request_id !== filters.bookingId) return false;
    if (filters.status && payout.status !== filters.status) return false;
    if (!isWithinSharedDateRange(payout.payout_date || payout.created_date, filters.dateRange)) return false;
    if (filters.customer && !textMatches(`${payout.customer_name || ""} ${payout.customer_email || ""}`, filters.customer)) return false;
    if (filters.search && !textMatches(`${payout.host_name || ""} ${payout.host_email || ""} ${payout.vehicle_name || ""} ${payout.customer_name || ""} ${payout.booking_request_id || ""}`, filters.search)) return false;
    return true;
  });
}

export async function loadSharedPayoutEngine({ mode = "host", hostId = "", filters = {}, limit = 1000 } = {}) {
  assertOperationalScope({ mode, hostId });

  const [hosts, vehicles, bookings, disputes, payouts, paymentLogs] = await Promise.all([
    base44.entities.Host.list("-created_date", 500),
    base44.entities.Vehicle.list("-created_date", 1000),
    base44.entities.BookingRequest.list("-created_date", 1000),
    base44.entities.Dispute.list("-created_date", 500),
    mode === "host" ? base44.entities.HostPayout.filter({ host_id: hostId }, "-created_date", limit) : base44.entities.HostPayout.list("-created_date", limit),
    mode === "host" ? base44.entities.PaymentLog.filter({ host_id: hostId }, "-paid_at", limit) : base44.entities.PaymentLog.list("-paid_at", limit),
  ]);

  const hostsById = indexById(hosts);
  const vehiclesById = indexById(vehicles);
  const bookingsById = indexById(bookings);
  const disputesByBookingId = Object.fromEntries(disputes.filter((d) => d.booking_request_id).map((d) => [d.booking_request_id, d]));

  const enrichedPayouts = payouts.map((payout) => enrichPayout(payout, hostsById, vehiclesById, bookingsById, disputesByBookingId));
  const synthesizedPayouts = synthesizePayoutsFromPaymentLogs(paymentLogs, enrichedPayouts, hostsById, vehiclesById, bookingsById);
  const scopedPayouts = [...enrichedPayouts, ...synthesizedPayouts].filter((payout) => mode !== "host" || payout.host_id === hostId);
  const filteredPayouts = applyPayoutFilters(scopedPayouts, { ...filters, hostId: mode === "host" ? hostId : filters.hostId });

  const pending = filteredPayouts.filter((payout) => ["pending", "processing"].includes(payout.status));
  const paid = filteredPayouts.filter((payout) => ["paid", "released"].includes(payout.status));
  const held = filteredPayouts.filter((payout) => ["held", "failed"].includes(payout.status));
  const totalPending = pending.reduce((sum, payout) => sum + (payout.net_host_payout || payout.net_payout || 0), 0);
  const totalPaid = paid.reduce((sum, payout) => sum + (payout.net_host_payout || payout.net_payout || 0), 0);
  const totalHeld = held.reduce((sum, payout) => sum + (payout.net_host_payout || payout.net_payout || 0), 0);
  const synthesizedCount = filteredPayouts.filter((payout) => payout._synthesized).length;

  return {
    mode,
    payouts: filteredPayouts,
    realPayouts: enrichedPayouts,
    synthesizedPayouts,
    kpis: { totalPending, totalPaid, totalHeld, pendingCount: pending.length, paidCount: paid.length, heldCount: held.length, synthesizedCount },
    alerts: { held, failed: filteredPayouts.filter((payout) => payout.status === "failed") },
    sources: { hosts, vehicles, bookings, disputes, paymentLogs },
  };
}