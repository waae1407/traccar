import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  X, Phone, Mail, Car, DollarSign, Calendar, FileText,
  CheckCircle2, XCircle, AlertTriangle, ExternalLink
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

const TABS = ["Overview", "Bookings", "Payments", "Documents", "Disputes", "Timeline"];

const BOOKING_STATUS_COLOR = {
  active: "bg-emerald-50 text-emerald-700",
  confirmed: "bg-emerald-50 text-emerald-700",
  approved: "bg-emerald-50 text-emerald-700",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-gray-100 text-gray-500",
  suspended: "bg-red-50 text-red-600",
  under_review: "bg-blue-50 text-blue-600",
  payment_due: "bg-yellow-50 text-yellow-700",
  grace_period: "bg-amber-50 text-amber-700",
};

function fmt(n) { return (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d) { return d ? format(new Date(d), "MMM d, yyyy") : "—"; }

export default function CustomerDrawer({ customer, hostId, bookings = [], onClose, onNote }) {
  const [tab, setTab] = useState("Overview");
  const [note, setNote] = useState(customer.notes || "");
  const [savingNote, setSavingNote] = useState(false);

  const activeBooking = bookings.find(b =>
    ["active", "confirmed", "approved", "payment_due", "grace_period", "suspended", "under_review"].includes(b.booking_status)
  );

  const { data: paymentLogs = [] } = useQuery({
    queryKey: ["crm-payments", customer.email, hostId],
    queryFn: () => base44.entities.PaymentLog.filter({ customer_email: customer.email }, "-paid_at", 50),
    enabled: tab === "Payments",
  });

  const { data: disputes = [] } = useQuery({
    queryKey: ["crm-disputes", customer.id, hostId],
    queryFn: async () => {
      const bookingIds = bookings.map(b => b.id);
      if (bookingIds.length === 0) return [];
      const all = await base44.entities.Dispute.filter({ host_id: hostId }, "-created_date", 100);
      return all.filter(d => bookingIds.includes(d.booking_request_id));
    },
    enabled: tab === "Disputes" && !!hostId,
  });

  const { data: events = [] } = useQuery({
    queryKey: ["crm-timeline", customer.email],
    queryFn: async () => {
      const results = [];
      try {
        const byCustomer = await base44.entities.ActivityEvent.filter({ customer_id: customer.email }, "-created_date", 25);
        results.push(...byCustomer);
      } catch (_) {}
      const seen = new Set();
      return results.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; }).slice(0, 25);
    },
    enabled: tab === "Timeline",
  });

  const handleSaveNote = async () => {
    setSavingNote(true);
    await base44.entities.HostCustomer.update(customer.id, { notes: note });
    setSavingNote(false);
    onNote?.();
  };

  const totalRevenue = paymentLogs.filter(l => l.status === "paid").reduce((s, l) => s + (l.amount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56% / 0.06), hsl(265 80% 62% / 0.04))" }}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              {customer.full_name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">{customer.full_name}</p>
              <p className="text-xs text-gray-400">{customer.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0 overflow-x-auto no-scrollbar">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-shrink-0 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                tab === t ? "border-pink-500 text-pink-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === "Overview" && (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl p-3 text-center bg-gray-50 border border-gray-100">
                  <p className="text-lg font-black text-gray-900">{customer.booking_count || 0}</p>
                  <p className="text-[10px] text-gray-400">Bookings</p>
                </div>
                <div className="rounded-2xl p-3 text-center" style={{ background: "hsl(152 60% 46% / 0.08)", border: "1px solid hsl(152 60% 46% / 0.15)" }}>
                  <p className="text-lg font-black text-emerald-600">${(customer.total_spent || 0).toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400">Revenue</p>
                </div>
                <div className="rounded-2xl p-3 text-center bg-gray-50 border border-gray-100">
                  <p className="text-[11px] font-bold text-gray-700 capitalize">{customer.customer_status || "active"}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Status</p>
                </div>
              </div>

              <div className="space-y-3">
                {customer.email && (
                  <div className="flex items-start gap-2.5 text-sm">
                    <Mail className="h-4 w-4 text-gray-400 mt-0.5" />
                    <p className="text-gray-800">{customer.email}</p>
                  </div>
                )}
                {customer.phone && (
                  <div className="flex items-start gap-2.5 text-sm">
                    <Phone className="h-4 w-4 text-gray-400 mt-0.5" />
                    <p className="text-gray-800">{customer.phone}</p>
                  </div>
                )}
                {customer.created_date && (
                  <div className="flex items-start gap-2.5 text-sm">
                    <Calendar className="h-4 w-4 text-gray-400 mt-0.5" />
                    <p className="text-gray-800">Customer since {fmtDate(customer.created_date)}</p>
                  </div>
                )}
              </div>

              {activeBooking && (
                <div className="rounded-2xl border border-gray-100 p-4 space-y-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Current Rental</p>
                  <p className="text-sm font-semibold text-gray-800">{activeBooking.vehicle_name}</p>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                    <span className={`px-2 py-0.5 rounded-full font-medium ${BOOKING_STATUS_COLOR[activeBooking.booking_status] || "bg-gray-100 text-gray-600"}`}>
                      {activeBooking.booking_status?.replace(/_/g, " ")}
                    </span>
                    {activeBooking.booking_type && <span>{activeBooking.booking_type}</span>}
                    {activeBooking.start_date && <span>{fmtDate(activeBooking.start_date)}</span>}
                    {activeBooking.weekly_rate && <span>${activeBooking.weekly_rate}/wk</span>}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Internal Notes</p>
                <textarea
                  rows={3}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Add internal note…"
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-pink-400 resize-none"
                />
                <button onClick={handleSaveNote} disabled={savingNote}
                  className="w-full py-2 rounded-xl text-xs font-bold text-white disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                  {savingNote ? "Saving…" : "Save Note"}
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Quick Actions</p>
                <div className="grid grid-cols-2 gap-2">
                  {customer.email && (
                    <a href={`mailto:${customer.email}`}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
                      <Mail className="h-3.5 w-3.5 text-pink-500" /> Email Customer
                    </a>
                  )}
                  {activeBooking && (
                    <a href="/bookings-admin"
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
                      <ExternalLink className="h-3.5 w-3.5 text-blue-500" /> View Booking
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "Bookings" && (
            <div className="p-5 space-y-3">
              {bookings.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No bookings found.</p>
              ) : bookings.map(b => (
                <div key={b.id} className="rounded-2xl border border-gray-100 p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-800">{b.vehicle_name || "Vehicle"}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${BOOKING_STATUS_COLOR[b.booking_status] || "bg-gray-100 text-gray-600"}`}>
                      {b.booking_status?.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                    {b.booking_type && <span>{b.booking_type}</span>}
                    {b.start_date && <span>{fmtDate(b.start_date)}</span>}
                    {b.weekly_rate && <span>${b.weekly_rate}/wk</span>}
                    {b.billing_week_number > 1 && <span>Week {b.billing_week_number}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "Payments" && (
            <div className="p-5 space-y-3">
              {paymentLogs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Payment history will appear after the first charge.</p>
              ) : (
                <>
                  <div className="flex gap-3 mb-2">
                    <div className="flex-1 rounded-2xl p-3 text-center bg-emerald-50 border border-emerald-100">
                      <p className="text-base font-black text-emerald-600">${fmt(totalRevenue)}</p>
                      <p className="text-[10px] text-gray-400">Total Paid</p>
                    </div>
                    <div className="flex-1 rounded-2xl p-3 text-center bg-gray-50 border border-gray-100">
                      <p className="text-base font-black text-gray-700">{paymentLogs.filter(l => l.status === "paid").length}</p>
                      <p className="text-[10px] text-gray-400">Payments</p>
                    </div>
                  </div>
                  {paymentLogs.map(l => {
                    const isPaid = l.status === "paid";
                    const Icon = isPaid ? CheckCircle2 : XCircle;
                    return (
                      <div key={l.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                        <Icon className={`h-4 w-4 flex-shrink-0 ${isPaid ? "text-emerald-500" : "text-red-500"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800">Week {l.week_number} · {l.vehicle_name || ""}</p>
                          <p className="text-[11px] text-gray-400">{fmtDate(l.paid_at || l.created_date)}</p>
                        </div>
                        <p className={`text-sm font-bold flex-shrink-0 ${isPaid ? "text-emerald-600" : "text-red-500"}`}>
                          ${fmt(l.amount)}
                        </p>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {tab === "Documents" && (
            <div className="p-5 space-y-3">
              {activeBooking ? (
                <>
                  {activeBooking.license_front_url && <DocLink label="Driver License (Front)" url={activeBooking.license_front_url} />}
                  {activeBooking.license_back_url && <DocLink label="Driver License (Back)" url={activeBooking.license_back_url} />}
                  {activeBooking.selfie_url && <DocLink label="Selfie / ID Verification" url={activeBooking.selfie_url} />}
                  {activeBooking.proof_of_income_url && <DocLink label="Proof of Income" url={activeBooking.proof_of_income_url} />}
                  {activeBooking.contract_status === "signed" && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <div>
                        <p className="text-xs font-semibold text-emerald-800">Contract Signed</p>
                        {activeBooking.signed_at && <p className="text-[11px] text-emerald-600">{fmtDate(activeBooking.signed_at)}</p>}
                      </div>
                    </div>
                  )}
                  {!activeBooking.license_front_url && !activeBooking.selfie_url && (
                    <p className="text-sm text-gray-400 text-center py-8">No documents uploaded yet.</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">No active booking — documents show here when available.</p>
              )}
            </div>
          )}

          {tab === "Disputes" && (
            <div className="p-5 space-y-3">
              {disputes.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No disputes for this customer.</p>
              ) : disputes.map(d => (
                <div key={d.id} className="rounded-2xl border border-gray-100 p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-800 capitalize">{d.dispute_type?.replace(/_/g, " ")}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      d.status === "open" ? "bg-red-50 text-red-600" :
                      d.status?.includes("resolved") ? "bg-emerald-50 text-emerald-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {d.status?.replace(/_/g, " ")}
                    </span>
                  </div>
                  {d.description && <p className="text-xs text-gray-500">{d.description}</p>}
                  {d.vehicle_name && <p className="text-xs text-gray-400">{d.vehicle_name}</p>}
                  <p className="text-[11px] text-gray-400">{fmtDate(d.created_date)}</p>
                </div>
              ))}
            </div>
          )}

          {tab === "Timeline" && (
            <div className="p-5 space-y-1">
              {events.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No activity yet.</p>
              ) : events.map(e => (
                <div key={e.id} className="flex gap-3 py-2.5 border-b border-gray-50 last:border-0">
                  <div className={`h-2 w-2 rounded-full flex-shrink-0 mt-2 ${
                    e.event_status === "error" ? "bg-red-400" :
                    e.event_status === "warning" ? "bg-yellow-400" : "bg-emerald-400"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">{e.event_title || e.event_type?.replace(/\./g, " · ")}</p>
                    {e.summary && <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{e.summary}</p>}
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {e.created_date ? formatDistanceToNow(new Date(e.created_date), { addSuffix: true }) : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DocLink({ label, url }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors">
      <div className="flex items-center gap-2.5">
        <FileText className="h-4 w-4 text-pink-500" />
        <span className="text-xs font-semibold text-gray-700">{label}</span>
      </div>
      <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
    </a>
  );
}