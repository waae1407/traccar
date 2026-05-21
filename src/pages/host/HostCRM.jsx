import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Users, Activity, DollarSign, AlertTriangle } from "lucide-react";
import HostPageHeader from "@/components/host/HostPageHeader";
import CRMFilters, { DEFAULT_FILTERS } from "@/components/host/crm/CRMFilters";
import CustomerCard, { getRiskInfo } from "@/components/host/crm/CustomerCard";
import NeedsAttention from "@/components/host/crm/NeedsAttention";
import CustomerDrawer from "@/components/host/crm/CustomerDrawer";
import { startOfMonth } from "date-fns";

const ACTIVE_STATUSES = new Set(["active", "confirmed", "approved", "payment_due", "grace_period", "under_review"]);

function KpiCard({ icon: Icon, label, value, color, bg }) {
  return (
    <div className={`rounded-3xl border shadow-sm p-4 text-center ${bg}`}>
      <Icon className={`h-4 w-4 mx-auto mb-1.5 ${color}`} />
      <p className={`text-2xl font-black ${color}`} style={{ fontFamily: "var(--font-syne)" }}>{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

export default function HostCRM() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const { data: hosts = [] } = useQuery({
    queryKey: ["my-host", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user?.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const { data: customers = [], isLoading: loadingCustomers } = useQuery({
    queryKey: ["host-customers", host?.id],
    queryFn: () => base44.entities.HostCustomer.filter({ host_id: host.id }, "-created_date", 300),
    enabled: !!host?.id,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["host-vehicles-crm", host?.id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const { data: allBookings = [] } = useQuery({
    queryKey: ["host-bookings-crm-v2", host?.id, vehicles.map(v => v.id).join(",")],
    queryFn: async () => {
      const results = [];
      if (host?.id) {
        try {
          const byHost = await base44.entities.BookingRequest.filter({ host_id: host.id }, "-created_date", 300);
          results.push(...byHost);
        } catch (_) {}
      }
      if (vehicles.length > 0) {
        const perVehicle = await Promise.all(
          vehicles.slice(0, 15).map(v =>
            base44.entities.BookingRequest.filter({ vehicle_id: v.id }, "-created_date", 50).catch(() => [])
          )
        );
        results.push(...perVehicle.flat());
      }
      const seen = new Set();
      return results.filter(b => { if (seen.has(b.id)) return false; seen.add(b.id); return true; });
    },
    enabled: !!host?.id,
  });

  const { data: paymentLogs = [] } = useQuery({
    queryKey: ["host-crm-payments", host?.id],
    queryFn: () => base44.entities.PaymentLog.filter({ host_id: host.id }, "-paid_at", 200),
    enabled: !!host?.id,
  });

  const { data: disputes = [] } = useQuery({
    queryKey: ["host-disputes-crm", host?.id],
    queryFn: () => base44.entities.Dispute.filter({ host_id: host.id }, "-created_date", 100),
    enabled: !!host?.id,
  });

  const bookingsByEmail = useMemo(() => {
    const map = {};
    for (const b of allBookings) {
      if (!b.user_email) continue;
      if (!map[b.user_email]) map[b.user_email] = [];
      map[b.user_email].push(b);
    }
    return map;
  }, [allBookings]);

  const disputesByBookingId = useMemo(() => {
    const map = {};
    for (const d of disputes) {
      if (d.booking_request_id) map[d.booking_request_id] = d;
    }
    return map;
  }, [disputes]);

  const kpis = useMemo(() => {
    const activeRentals = customers.filter(c => {
      const bks = bookingsByEmail[c.email] || [];
      return bks.some(b => ACTIVE_STATUSES.has(b.booking_status));
    }).length;

    const monthStart = startOfMonth(new Date());
    const monthlyRevenue = paymentLogs
      .filter(l => l.status === "paid" && l.paid_at && new Date(l.paid_at) >= monthStart)
      .reduce((s, l) => s + (l.amount || 0), 0);

    const needsAttention = customers.filter(c => {
      const bks = bookingsByEmail[c.email] || [];
      const hasDispute = bks.some(b => disputesByBookingId[b.id]);
      const hasIssue = bks.some(b =>
        ["payment_due", "grace_period", "suspended", "under_review"].includes(b.booking_status)
      );
      return hasDispute || hasIssue;
    }).length;

    return { total: customers.length, activeRentals, monthlyRevenue, needsAttention };
  }, [customers, bookingsByEmail, paymentLogs, disputesByBookingId]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const bks = bookingsByEmail[c.email] || [];
      const activeBooking = bks.find(b => ACTIVE_STATUSES.has(b.booking_status));
      const openDispute = bks.some(b => {
        const d = disputesByBookingId[b.id];
        return d && ["open", "under_review", "evidence_requested", "payout_held"].includes(d.status);
      });
      const risk = getRiskInfo(c, activeBooking, openDispute);

      if (filters.search) {
        const q = filters.search.toLowerCase();
        const match =
          (c.full_name || "").toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q) ||
          (c.phone || "").toLowerCase().includes(q) ||
          bks.some(b =>
            (b.id || "").toLowerCase().includes(q) ||
            (b.vehicle_name || "").toLowerCase().includes(q)
          );
        if (!match) return false;
      }

      if (filters.status) {
        const statusMap = {
          active: () => !!activeBooking && ["active", "confirmed", "approved"].includes(activeBooking.booking_status),
          completed: () => bks.some(b => b.booking_status === "completed") && !activeBooking,
          suspended: () => activeBooking?.booking_status === "suspended",
          under_review: () => activeBooking?.booking_status === "under_review",
          overdue: () => ["payment_due", "grace_period"].includes(activeBooking?.booking_status),
          cancelled: () => bks.some(b => b.booking_status === "cancelled") && !activeBooking,
        };
        const check = statusMap[filters.status];
        if (check && !check()) return false;
      }

      if (filters.rentalType) {
        const isRTO = bks.some(b => b.booking_type === "Rent-to-Own" || b.contract_type === "rent_to_own");
        if (filters.rentalType === "rto" && !isRTO) return false;
        if (filters.rentalType === "weekly" && isRTO) return false;
      }

      if (filters.paymentStatus) {
        const ps = filters.paymentStatus;
        if (ps === "current" && !["active", "confirmed", "approved"].includes(activeBooking?.booking_status)) return false;
        if (ps === "payment_due" && activeBooking?.booking_status !== "payment_due") return false;
        if (ps === "grace_period" && activeBooking?.booking_status !== "grace_period") return false;
        if (ps === "failed" && activeBooking?.payment_status !== "failed") return false;
        if (ps === "suspended" && activeBooking?.booking_status !== "suspended") return false;
      }

      if (filters.risk && risk.level !== filters.risk) return false;

      if (filters.vehicleId) {
        const v = vehicles.find(veh => veh.id === filters.vehicleId);
        if (!v) return false;
        const hasVehicle = bks.some(b =>
          (b.vehicle_name || "").toLowerCase().includes((v.make || "").toLowerCase()) ||
          b.vehicle_id === filters.vehicleId
        );
        if (!hasVehicle) return false;
      }

      return true;
    });
  }, [customers, bookingsByEmail, disputesByBookingId, filters, vehicles]);

  const selectedBookings = useMemo(() => {
    if (!selected) return [];
    return (bookingsByEmail[selected.email] || []).sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
  }, [selected, bookingsByEmail]);

  return (
    <div className="space-y-5">
      <HostPageHeader
        title="Customers"
        subtitle={`${kpis.total} total · ${kpis.activeRentals} active rentals`}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="Total Customers" value={kpis.total} color="text-gray-900" bg="bg-white border-gray-100" />
        <KpiCard icon={Activity} label="Active Rentals" value={kpis.activeRentals} color="text-emerald-600" bg="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200" />
        <KpiCard icon={DollarSign} label="Monthly Revenue" value={`$${Math.round(kpis.monthlyRevenue).toLocaleString()}`} color="text-pink-600" bg="bg-gradient-to-br from-pink-50 to-purple-50 border-pink-200" />
        <KpiCard
          icon={AlertTriangle}
          label="Needs Attention"
          value={kpis.needsAttention}
          color={kpis.needsAttention > 0 ? "text-yellow-600" : "text-gray-400"}
          bg={kpis.needsAttention > 0 ? "bg-yellow-50 border-yellow-200" : "bg-white border-gray-100"}
        />
      </div>

      <NeedsAttention
        customers={customers}
        bookingsByEmail={bookingsByEmail}
        disputesByBookingId={disputesByBookingId}
        onSelect={setSelected}
      />

      <CRMFilters
        filters={filters}
        onChange={setFilters}
        vehicles={vehicles}
        resultCount={filteredCustomers.length}
      />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loadingCustomers ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />)}
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="text-center py-14">
            <Users className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">
              {customers.length === 0
                ? "Customers will appear here after your first booking."
                : "No customers match these filters."}
            </p>
          </div>
        ) : (
          filteredCustomers.map(c => {
            const bks = bookingsByEmail[c.email] || [];
            const activeBooking = bks.find(b => ACTIVE_STATUSES.has(b.booking_status));
            const openDispute = bks.some(b => {
              const d = disputesByBookingId[b.id];
              return d && ["open", "under_review", "evidence_requested", "payout_held"].includes(d.status);
            });
            return (
              <CustomerCard
                key={c.id}
                customer={c}
                activeBooking={activeBooking}
                openDispute={openDispute}
                isSelected={selected?.id === c.id}
                onClick={() => setSelected(selected?.id === c.id ? null : c)}
              />
            );
          })
        )}
      </div>

      {selected && (
        <CustomerDrawer
          customer={selected}
          hostId={host?.id}
          bookings={selectedBookings}
          vehicles={vehicles}
          onClose={() => setSelected(null)}
          onNote={() => qc.invalidateQueries({ queryKey: ["host-customers"] })}
        />
      )}
    </div>
  );
}