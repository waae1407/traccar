import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, Clock, CheckCircle2, AlertTriangle, DollarSign, Car, FileText, User, ExternalLink } from "lucide-react";
import { format } from "date-fns";

function fmt(n) {
  return (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TIMELINE_EVENTS = {
  "payment.succeeded":      { label: "Payment received",        color: "text-emerald-600", dot: "bg-emerald-400" },
  "payment.failed":         { label: "Payment failed",          color: "text-red-500",     dot: "bg-red-400" },
  "payment.retry_deferred": { label: "Retry deferred",          color: "text-yellow-600",  dot: "bg-yellow-400" },
  "payout.created":         { label: "Payout created",          color: "text-blue-600",    dot: "bg-blue-400" },
  "payout.sent":            { label: "Payout sent",             color: "text-emerald-600", dot: "bg-emerald-400" },
  "payout.held":            { label: "Payout held",             color: "text-orange-500",  dot: "bg-orange-400" },
  "payout.released":        { label: "Payout released",         color: "text-emerald-600", dot: "bg-emerald-400" },
  "dispute.opened":         { label: "Dispute opened",          color: "text-red-500",     dot: "bg-red-400" },
  "dispute.resolved":       { label: "Dispute resolved",        color: "text-emerald-600", dot: "bg-emerald-400" },
  "booking.activated":      { label: "Booking activated",       color: "text-blue-500",    dot: "bg-blue-400" },
  "booking.completed":      { label: "Booking completed",       color: "text-emerald-500", dot: "bg-emerald-400" },
};

const PAYOUT_EVENT_TYPES = Object.keys(TIMELINE_EVENTS);

export default function PayoutDetailDrawer({ payout, booking, dispute, onClose }) {
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const gross = payout.gross_booking_amount || payout.gross_collected || 0;
  const net = payout.net_host_payout || payout.net_payout || 0;
  const stripeFee = payout.stripe_fee_amount || 0;
  const platformFee = payout.uride_platform_fee_amount || payout.platform_fee || 0;
  const holdAmount = gross - platformFee - stripeFee - net;
  const appliedRate = payout.uride_platform_fee_rate || 0.08;

  // Lazy-load activity timeline
  useEffect(() => {
    if (!payout.booking_request_id) return;
    setLoadingEvents(true);
    base44.entities.ActivityEvent.filter({ booking_id: payout.booking_request_id })
      .then(all => {
        const relevant = all
          .filter(e => PAYOUT_EVENT_TYPES.some(t => e.event_type?.startsWith(t.split(".")[0])))
          .sort((a, b) => new Date(a.created_date) - new Date(b.created_date))
          .slice(0, 20);
        setEvents(relevant);
      })
      .catch(() => setEvents([]))
      .finally(() => setLoadingEvents(false));
  }, [payout.booking_request_id]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between z-10">
          <div>
            <h3 className="font-bold text-gray-900">{payout.vehicle_name || "Payout Detail"}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {payout.period_start && `${payout.period_start} — ${payout.period_end}`}
            </p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Payout breakdown */}
          <Section title="Payout Breakdown" icon={DollarSign}>
            <LineItem label="Gross Rental" value={`$${fmt(gross)}`} bold />
            <LineItem label={`uRide Platform Fee (${(appliedRate * 100).toFixed(0)}%)`} value={`-$${fmt(platformFee)}`} red />
            <LineItem
              label={`Stripe Processing Fee${payout.stripe_effective_rate ? ` (${payout.stripe_effective_rate.toFixed(2)}%)` : ""}`}
              value={`-$${fmt(stripeFee)}`}
              red
            />
            {holdAmount > 0.01 && (
              <LineItem label="Reserve / Hold" value={`-$${fmt(holdAmount)}`} red />
            )}
            <div className="border-t border-gray-100 pt-2 mt-1">
              <LineItem label="Net Payout" value={`$${fmt(net)}`} big green />
            </div>
            {payout.stripe_transfer_id && (
              <p className="text-[10px] text-gray-400 pt-1 font-mono break-all">
                Transfer: {payout.stripe_transfer_id}
              </p>
            )}
          </Section>

          {/* Booking info */}
          {booking && (
            <Section title="Booking" icon={FileText}>
              <InfoRow label="Booking ID" value={booking.id?.slice(0, 20) + "…"} mono />
              {booking.customer_full_name && <InfoRow label="Renter" value={booking.customer_full_name} />}
              {booking.user_email && <InfoRow label="Email" value={booking.user_email} />}
              {booking.booking_type && <InfoRow label="Type" value={booking.booking_type} />}
              {booking.start_date && (
                <InfoRow label="Rental Period" value={`${booking.start_date} — ${booking.end_date || "ongoing"}`} />
              )}
              <InfoRow label="Status" value={booking.booking_status} />
            </Section>
          )}
          {!booking && payout.booking_request_id && (
            <Section title="Booking" icon={FileText}>
              <p className="text-xs text-gray-400 font-mono break-all">{payout.booking_request_id}</p>
            </Section>
          )}

          {/* Dispute info */}
          {dispute && (
            <Section title="Dispute" icon={AlertTriangle} alert>
              <InfoRow label="Type" value={dispute.dispute_type} />
              <InfoRow label="Status" value={dispute.status} />
              {dispute.description && <InfoRow label="Note" value={dispute.description} />}
              {dispute.due_by && <InfoRow label="Due By" value={format(new Date(dispute.due_by), "MMM d, yyyy")} />}
            </Section>
          )}

          {/* Hold info */}
          {(payout.status === "held" || payout.hold_reason) && (
            <Section title="Hold Details" icon={AlertTriangle} orange>
              {payout.hold_reason && <InfoRow label="Reason" value={payout.hold_reason} />}
              {payout.hold_notes && <InfoRow label="Notes" value={payout.hold_notes} />}
              {payout.held_at && <InfoRow label="Held Since" value={format(new Date(payout.held_at), "MMM d, yyyy")} />}
              {payout.release_after && (
                <InfoRow label="Expected Release" value={format(new Date(payout.release_after), "MMM d, yyyy")} green />
              )}
            </Section>
          )}

          {/* Activity timeline */}
          <Section title="Activity Timeline" icon={Clock}>
            {loadingEvents ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-8 bg-gray-100 rounded-lg animate-pulse" />)}
              </div>
            ) : events.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No activity events recorded for this booking.</p>
            ) : (
              <div className="relative space-y-0">
                {events.map((e, i) => {
                  const cfg = TIMELINE_EVENTS[e.event_type] || { label: e.event_type, color: "text-gray-500", dot: "bg-gray-300" };
                  return (
                    <div key={e.id} className="flex gap-3 pb-3 relative">
                      {i < events.length - 1 && (
                        <div className="absolute left-[7px] top-4 bottom-0 w-px bg-gray-100" />
                      )}
                      <div className={`h-3.5 w-3.5 rounded-full flex-shrink-0 mt-0.5 ring-2 ring-white ${cfg.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold ${cfg.color}`}>{cfg.label || e.event_title || e.event_type}</p>
                        {e.summary && <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{e.summary}</p>}
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {e.created_date && format(new Date(e.created_date), "MMM d, yyyy h:mma")}
                          {e.actor_email && e.actor_email !== "system" && ` · ${e.actor_email}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children, alert, orange }) {
  const iconColor = alert ? "text-red-400" : orange ? "text-orange-400" : "text-pink-400";
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{title}</p>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function LineItem({ label, value, bold, red, green, big }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`${big ? "text-base" : "text-sm"} ${bold ? "font-bold text-gray-800" : ""} ${red ? "text-red-400" : ""} ${green ? "font-black text-emerald-600" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function InfoRow({ label, value, mono, green }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-gray-400 flex-shrink-0">{label}</span>
      <span className={`text-xs text-right ${mono ? "font-mono text-gray-500" : "text-gray-700"} ${green ? "text-emerald-600 font-semibold" : ""}`}>
        {value}
      </span>
    </div>
  );
}