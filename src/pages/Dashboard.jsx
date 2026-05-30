import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/lib/useTenant";
import { Car, Users, CalendarDays, DollarSign, FileKey, AlertTriangle, ArrowUpRight, Clock, Bell, ImageIcon, CheckCircle, Loader2, WrenchIcon, Play } from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import StatCardDrawer, { DrawerRow, DrawerBookingRow } from "@/components/dashboard/StatCardDrawer";
import PaymentOperationalAlertPanel from "@/components/payments/PaymentOperationalAlertPanel";
import TelematicsMap from "@/components/telematics/TelematicsMap";
import TelematicsService from "@/lib/telematics/TelematicsService";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid
} from "recharts";

const CHART_COLORS = ["hsl(338,90%,56%)", "hsl(265,80%,62%)", "hsl(152,60%,46%)", "hsl(38,95%,54%)", "hsl(199,90%,54%)"];

const GlassCard = ({ children, className = "" }) => (
  <div className={`rounded-2xl border border-white/[0.07] p-6 ${className}`}
    style={{ background: "hsl(222 24% 10% / 0.9)", boxShadow: "0 4px 32px hsl(222 28% 5% / 0.5)" }}>
    {children}
  </div>
);

const ChartTooltip = ({ active, payload, label, prefix = "" }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 px-3 py-2 text-xs" style={{ background: "hsl(222 28% 12%)", boxShadow: "0 8px 32px hsl(222 28% 5% / 0.8)" }}>
      <p className="text-white/50 mb-1">{label}</p>
      <p className="font-semibold text-white">{prefix}{payload[0].value?.toLocaleString()}</p>
    </div>
  );
};

export default function Dashboard() {
  const { tenantFilter, companyId, isSuperadmin, overrideCompanyId } = useTenant();
  const scopeKey = companyId || "all";
  const [activeDrawer, setActiveDrawer] = useState(null);
  const [backfillState, setBackfillState] = useState("idle"); // idle | running | done
  const [billingState, setBillingState] = useState("idle"); // idle | running | done | error

  const handleRunBilling = async () => {
    if (!window.confirm("Run weekly billing now? This will charge all active renters whose billing date is today or overdue.")) return;
    setBillingState("running");
    try {
      const res = await base44.functions.invoke("processWeeklyBilling", {});
      console.log("Billing result:", res.data);
      setBillingState("done");
      setTimeout(() => setBillingState("idle"), 8000);
    } catch (e) {
      console.error("Billing error:", e);
      setBillingState("error");
      setTimeout(() => setBillingState("idle"), 8000);
    }
  };

  const handleBackfillInspectionImages = async () => {
    setBackfillState("running");
    const targets = bookingRequests.filter((b) =>
      ["active", "approved", "confirmed"].includes(b.booking_status) &&
      b.vehicle_image &&
      !b.inspection_sample_images?.interior_front
    );
    for (const b of targets) {
      try {
        await base44.functions.invoke("generateInspectionSamples", { booking_id: b.id, vehicle_image: b.vehicle_image });
      } catch (e) {
        console.error("Backfill failed for", b.id, e.message);
      }
    }
    setBackfillState("done");
    setTimeout(() => setBackfillState("idle"), 5000);
  };

  const { data: platformUsers = [] } = useQuery({ queryKey: ["platform-users-dash"], queryFn: () => base44.entities.User.list("-created_date", 200) });
  const { data: allBookingRequestsForLeads = [] } = useQuery({ queryKey: ["all-br-leads"], queryFn: () => base44.entities.BookingRequest.list("-created_date", 500) });
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles", scopeKey], queryFn: () => base44.entities.Vehicle.filter(tenantFilter()) });
  const { data: customers = [] } = useQuery({ queryKey: ["customers", scopeKey], queryFn: () => base44.entities.Customer.filter(tenantFilter()) });
  const { data: bookings = [] } = useQuery({ queryKey: ["bookings", scopeKey], queryFn: () => base44.entities.Booking.filter(tenantFilter()) });
  const { data: payments = [] } = useQuery({ queryKey: ["payments", scopeKey], queryFn: () => base44.entities.Payment.filter(tenantFilter()) });
  const { data: contracts = [] } = useQuery({ queryKey: ["contracts", scopeKey], queryFn: () => base44.entities.RentToOwnContract.filter(tenantFilter()) });
  const { data: bookingRequests = [] } = useQuery({ queryKey: ["booking-requests-admin", scopeKey], queryFn: () => base44.entities.BookingRequest.filter(tenantFilter(), "-created_date", 200), refetchInterval: 30_000 });
  const { data: gpsDevices = [], refetch: refetchGpsDevices } = useQuery({ queryKey: ["dashboard-gps-devices"], queryFn: () => base44.entities.TelematicsDevice.list("-location_updated_at", 100), refetchInterval: 60_000 });
  const { data: pendingHosts = [] } = useQuery({ queryKey: ["pending-hosts-dash"], queryFn: () => base44.entities.Host.filter({ status: "pending" }), refetchInterval: 60_000 });
  const unviewedHosts = pendingHosts.filter(h => !h.admin_viewed);

  // Lead funnel derived data
  const nonAdminUsers = platformUsers.filter(u => u.role !== "admin");
  const bookedUserEmails = new Set(
    allBookingRequestsForLeads
      .filter(b => !["draft", "cancelled"].includes(b.booking_status))
      .map(b => b.user_email).filter(Boolean)
  );
  const neverBookedCount = nonAdminUsers.filter(u => !bookedUserEmails.has(u.email)).length;

  // Abandoned checkout count
  const ABANDONED_STATUSES = ["draft", "pending_verification", "pending_contract", "pending_payment"];
  const abandonedBookings = bookingRequests.filter(b =>
    ABANDONED_STATUSES.includes(b.booking_status) &&
    b.user_email &&
    !b.abandoned_checkout
  );

  const outOfServiceVehicles = vehicles.filter((v) => v.status === "Out of Service");
  const pendingReviews = bookingRequests.filter((b) => b.booking_status === "pending_review");
  const unopenedPending = pendingReviews.filter((b) => !b.viewed_by_admin);
  const today = new Date(); today.setHours(0,0,0,0);
  const pendingToday = pendingReviews.filter((b) => {
    const d = new Date(b.submitted_at || b.created_date); d.setHours(0,0,0,0);
    return d.getTime() === today.getTime();
  });

  // Real active rentals from BookingRequests (source of truth)
  const activeRentals = bookingRequests.filter((b) => ["approved", "confirmed", "active", "pending_review"].includes(b.booking_status)).length;
  const availableVehicles = vehicles.filter((v) => v.status === "Available").length;
  const overduePayments = payments.filter((p) => p.status === "Overdue");
  const activeContracts = contracts.filter((c) => c.status === "Active").length +
    bookingRequests.filter((b) => b.booking_type === "Rent-to-Own" && ["approved", "confirmed", "active"].includes(b.booking_status)).length;

  // Real revenue: BookingRequests (paid) + legacy Payment records
  const revenueFromRequests = bookingRequests
    .filter((b) => b.payment_status === "paid")
    .reduce((s, b) => s + (b.total_due_now || 0), 0);
  const revenueFromPayments = payments.filter((p) => p.status === "Paid").reduce((s, p) => s + (p.amount || 0), 0);
  const totalRevenue = revenueFromRequests + revenueFromPayments;

  const now = new Date();
  const thisMonthRevenue = bookingRequests
    .filter((b) => {
      if (b.payment_status !== "paid") return false;
      const dateStr = b.agreement_accepted_at || b.submitted_at || b.created_date;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, b) => s + (b.total_due_now || 0), 0)
    + payments.filter((p) => {
      if (!p.paid_date || p.status !== "Paid") return false;
      const d = new Date(p.paid_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).reduce((s, p) => s + (p.amount || 0), 0);

  // Monthly trend (BookingRequests + legacy Payments)
  const monthlyData = {};
  bookingRequests.filter((b) => b.payment_status === "paid").forEach((b) => {
    const dateStr = b.agreement_accepted_at || b.submitted_at || b.created_date;
    if (!dateStr) return;
    const d = new Date(dateStr);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyData[key] = (monthlyData[key] || 0) + (b.total_due_now || 0);
  });
  payments.filter((p) => p.status === "Paid" && p.paid_date).forEach((p) => {
    const d = new Date(p.paid_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyData[key] = (monthlyData[key] || 0) + (p.amount || 0);
  });
  const trendData = Object.entries(monthlyData).sort().map(([month, revenue]) => ({ month: month.slice(5), revenue }));

  // Fleet status pie
  const statusCounts = {};
  vehicles.forEach((v) => { statusCounts[v.status] = (statusCounts[v.status] || 0) + 1; });
  const fleetPie = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  if (fleetPie.length === 0) {
    fleetPie.push({ name: "No Data", value: 1 });
  }

  // Payment method breakdown
  const methodData = {};
  payments.filter((p) => p.status === "Paid").forEach((p) => {
    methodData[p.payment_method || "Other"] = (methodData[p.payment_method || "Other"] || 0) + (p.amount || 0);
  });
  const methodChart = Object.entries(methodData).map(([name, value]) => ({ name, value }));

  // Use BookingRequests as the source of recent activity (real data)
  const recentBookings = [...bookingRequests]
    .filter((b) => b.booking_status !== "draft")
    .slice(0, 5);

  const activeRentalsList = bookingRequests.filter((b) => ["approved", "confirmed", "active", "pending_review"].includes(b.booking_status));
  const availableVehiclesList = vehicles.filter((v) => v.status === "Available");
  const paidBookingRequests = bookingRequests.filter((b) => b.payment_status === "paid");
  const thisMonthPaid = bookingRequests.filter((b) => {
    if (b.payment_status !== "paid") return false;
    const dateStr = b.agreement_accepted_at || b.submitted_at || b.created_date;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const activeRTOList = [
    ...contracts.filter((c) => c.status === "Active"),
    ...bookingRequests.filter((b) => b.booking_type === "Rent-to-Own" && ["approved", "confirmed", "active"].includes(b.booking_status)),
  ];

  const stats = [
    { title: "Active Rentals", value: activeRentals, icon: CalendarDays, colorIndex: 0, drawer: "active_rentals" },
    { title: "Available Vehicles", value: availableVehicles, icon: Car, colorIndex: 2, drawer: "available_vehicles" },
    { title: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, icon: DollarSign, colorIndex: 1, drawer: "total_revenue" },
    { title: "Monthly Revenue", value: `$${thisMonthRevenue.toLocaleString()}`, icon: DollarSign, colorIndex: 3, drawer: "monthly_revenue" },
    { title: "Total Customers", value: customers.length, icon: Users, colorIndex: 5, drawer: "customers" },
    { title: "Active RTO", value: activeContracts, icon: FileKey, colorIndex: 4, drawer: "active_rto" },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PaymentOperationalAlertPanel scope="admin" limit={3} />

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <TelematicsMap
            role="admin"
            devices={gpsDevices.filter(d => d.vehicle_id && vehicles.some(v => v.id === d.vehicle_id && ["Booked", "Active Rental", "Reserved", "Payment Due", "Grace Period"].includes(v.status))).slice(0, 25)}
            vehicles={vehicles}
            bookings={bookingRequests}
            height={220}
            compact
            showFilters={false}
            refreshLabel="Refresh Locations"
            onRefresh={async () => { await TelematicsService.syncTraccarPositions(); await refetchGpsDevices(); }}
          />
        </div>
        <Link to="/admin/telematics-operations" className="rounded-3xl border border-white/[0.07] p-5 glass-hover flex flex-col justify-between min-h-[220px]" style={{ background: "hsl(222 24% 10% / 0.9)" }}>
          <div>
            <p className="text-xs font-bold text-white/40 uppercase tracking-wider">Fleet GPS</p>
            <h3 className="mt-2 text-xl font-black text-white">Open full fleet map</h3>
            <p className="mt-2 text-sm text-white/45">View all cached Traccar locations, stale vehicles, provider filters, and fleet health.</p>
          </div>
          <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary">Full map <ArrowUpRight className="h-4 w-4" /></span>
        </Link>
      </div>

      {/* Run Weekly Billing */}
      <div className="rounded-2xl border border-green-500/30 p-4 flex items-center justify-between gap-4 flex-wrap"
        style={{ background: "hsl(152 60% 46% / 0.07)" }}>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-green-500/20 border border-green-500/30 flex items-center justify-center flex-shrink-0">
            <DollarSign className="h-4 w-4 text-green-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-green-300">Weekly Billing</p>
            <p className="text-xs text-white/40">Charge active renters whose billing date is due</p>
          </div>
        </div>
        <button
          onClick={handleRunBilling}
          disabled={billingState === "running"}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-white disabled:opacity-60 transition-all"
          style={{ background: "linear-gradient(135deg, hsl(152 60% 40%), hsl(199 90% 44%))" }}
        >
          {billingState === "running" && <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>}
          {billingState === "done" && <><CheckCircle className="h-4 w-4" /> Done!</>}
          {billingState === "error" && <>⚠️ Failed — check logs</>}
          {billingState === "idle" && <><Play className="h-4 w-4" /> Run Now</>}
        </button>
      </div>

      {/* Pending Host Applications Alert */}
      {pendingHosts.length > 0 && (
        <div className="rounded-2xl border-2 border-yellow-500/40 overflow-hidden"
          style={{ background: "linear-gradient(135deg, hsl(45 95% 60% / 0.10) 0%, hsl(265 80% 62% / 0.06) 100%)" }}>
          <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, hsl(45 95% 55%), hsl(265 80% 55%))" }} />
          <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center flex-shrink-0">
                <Users className="h-6 w-6 text-yellow-400" />
              </div>
              <div>
                <p className="font-bold text-yellow-300 text-base">
                  {pendingHosts.length} Host Application{pendingHosts.length > 1 ? "s" : ""} Awaiting Review
                </p>
                <div className="flex items-center gap-4 mt-1 text-xs text-white/50">
                  {unviewedHosts.length > 0 && <span className="text-yellow-400 font-semibold">{unviewedHosts.length} unseen</span>}
                  <span>Verify identity · Collect EIN · Approve for Stripe</span>
                </div>
              </div>
            </div>
            <Link to="/admin/hosts"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-black transition-all hover:opacity-90 active:scale-95 flex-shrink-0"
              style={{ background: "linear-gradient(135deg, hsl(45 95% 60%), hsl(38 95% 54%))" }}>
              Review Applications <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Out of Service Alert Widget */}
      {outOfServiceVehicles.length > 0 && (
        <div className="rounded-2xl border-2 border-red-500/40 overflow-hidden"
          style={{ background: "linear-gradient(135deg, hsl(0 72% 58% / 0.10) 0%, hsl(338 90% 56% / 0.06) 100%)" }}>
          <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, hsl(0 72% 55%), hsl(338 90% 50%))" }} />
          <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                <WrenchIcon className="h-6 w-6 text-red-400" />
              </div>
              <div>
                <p className="font-bold text-red-300 text-base">
                  {outOfServiceVehicles.length} Vehicle{outOfServiceVehicles.length > 1 ? "s" : ""} Out of Service — Inspection Required
                </p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {outOfServiceVehicles.map((v) => (
                    <span key={v.id} className="text-xs text-white/50 bg-white/[0.06] px-2 py-0.5 rounded-lg border border-white/10">
                      {v.year} {v.make} {v.model} {v.plate ? `· ${v.plate}` : ""}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <Link
              to="/vehicles"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 active:scale-95 flex-shrink-0"
              style={{ background: "linear-gradient(135deg, hsl(0 72% 52%), hsl(338 90% 50%))" }}
            >
              Inspect & Clear <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Pending Reviews Alert Widget */}
      {pendingReviews.length > 0 && (
        <div className="rounded-2xl border-2 border-yellow-400/40 overflow-hidden"
          style={{ background: "linear-gradient(135deg, hsl(45 95% 60% / 0.12) 0%, hsl(38 95% 54% / 0.08) 100%)" }}>
          <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, hsl(45 95% 55%), hsl(38 95% 50%))" }} />
          <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-yellow-400/20 border border-yellow-400/30 flex items-center justify-center flex-shrink-0">
                <Bell className="h-6 w-6 text-yellow-400" />
              </div>
              <div>
                <p className="font-bold text-yellow-300 text-base">
                  {pendingReviews.length} Pending {pendingReviews.length === 1 ? "Booking" : "Bookings"} Awaiting Review
                </p>
                <div className="flex items-center gap-4 mt-1 text-xs text-white/50">
                  <span>{unopenedPending.length} unopened</span>
                  <span>·</span>
                  <span>{pendingToday.length} new today</span>
                </div>
              </div>
            </div>
            <Link
              to="/bookings-admin"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-black transition-all hover:opacity-90 active:scale-95 flex-shrink-0"
              style={{ background: "linear-gradient(135deg, hsl(45 95% 60%), hsl(38 95% 54%))" }}
            >
              Review Now <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Inspection images backfill tool */}
      {(() => {
        const missing = bookingRequests.filter((b) =>
          ["active", "approved", "confirmed"].includes(b.booking_status) &&
          b.vehicle_image &&
          !b.inspection_sample_images?.interior_front
        );
        if (missing.length === 0) return null;
        return (
          <div className="rounded-2xl border border-blue-500/30 p-4 flex items-center justify-between gap-4 flex-wrap"
            style={{ background: "hsl(199 90% 54% / 0.07)" }}>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                <ImageIcon className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-blue-300">
                  {missing.length} active booking{missing.length > 1 ? "s" : ""} missing inspection images
                </p>
                <p className="text-xs text-white/40 mt-0.5">Pre-generate sample images so customers see them instantly</p>
              </div>
            </div>
            <button
              onClick={handleBackfillInspectionImages}
              disabled={backfillState !== "idle"}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-white disabled:opacity-60 transition-all"
              style={{ background: "linear-gradient(135deg, hsl(199 90% 44%), hsl(265 80% 55%))" }}
            >
              {backfillState === "running" && <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>}
              {backfillState === "done" && <><CheckCircle className="h-4 w-4" /> Done!</>}
              {backfillState === "idle" && <><ImageIcon className="h-4 w-4" /> Generate Now</>}
            </button>
          </div>
        );
      })()}

      {/* Abandoned Checkout Widget */}
      {abandonedBookings.length > 0 && (
        <div className="rounded-2xl border-2 border-orange-500/40 overflow-hidden"
          style={{ background: "linear-gradient(135deg, hsl(25 95% 55% / 0.10) 0%, hsl(38 95% 54% / 0.06) 100%)" }}>
          <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, hsl(25 95% 55%), hsl(38 95% 50%))" }} />
          <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
                <Clock className="h-6 w-6 text-orange-400" />
              </div>
              <div>
                <p className="font-bold text-orange-300 text-base">
                  {abandonedBookings.length} Incomplete Booking{abandonedBookings.length !== 1 ? "s" : ""} — Reminder Campaign Active
                </p>
                <div className="flex items-center gap-4 mt-1 text-xs text-white/50">
                  <span>{abandonedBookings.filter(b => b.booking_status === "pending_payment").length} stuck at payment</span>
                  <span>·</span>
                  <span>{abandonedBookings.filter(b => b.booking_status === "draft").length} abandoned early</span>
                  <span>·</span>
                  <span>Daily nudges sending automatically</span>
                </div>
              </div>
            </div>
            <Link
              to="/bookings-admin"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 active:scale-95 flex-shrink-0"
              style={{ background: "linear-gradient(135deg, hsl(25 95% 50%), hsl(38 95% 45%))" }}
            >
              View Bookings <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Platform Users / Leads widget */}
      {nonAdminUsers.length > 0 && (
        <div className="rounded-2xl border border-white/[0.07] p-5 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: "linear-gradient(135deg, hsl(265 80% 62% / 0.10) 0%, hsl(338 90% 56% / 0.06) 100%)" }}>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0 border border-purple-500/30"
              style={{ background: "hsl(265 80% 62% / 0.20)" }}>
              <Users className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <p className="font-bold text-white text-base">
                {nonAdminUsers.length} Platform User{nonAdminUsers.length !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-4 mt-1 text-xs text-white/50">
                <span className="text-green-400 font-semibold">{nonAdminUsers.length - neverBookedCount} booked</span>
                <span>·</span>
                <span className="text-yellow-400 font-semibold">{neverBookedCount} never booked</span>
                <span>·</span>
                <span>weekly follow-ups active</span>
              </div>
            </div>
          </div>
          <Link
            to="/customers"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 active:scale-95 flex-shrink-0"
            style={{ background: "linear-gradient(135deg, hsl(265 80% 55%), hsl(338 90% 50%))" }}
          >
            View Users <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((s) => <StatCard key={s.title} {...s} onClick={() => setActiveDrawer(s.drawer)} />)}
      </div>

      {/* ── Drawers ── */}

      {/* Active Rentals */}
      <StatCardDrawer open={activeDrawer === "active_rentals"} onClose={() => setActiveDrawer(null)} title="Active Rentals" linkTo="/bookings-admin" linkLabel="Manage bookings">
        {activeRentalsList.length === 0 ? <p className="text-white/30 text-sm text-center py-10">No active rentals</p> : activeRentalsList.map((b) => <DrawerBookingRow key={b.id} booking={b} />)}
      </StatCardDrawer>

      {/* Available Vehicles */}
      <StatCardDrawer open={activeDrawer === "available_vehicles"} onClose={() => setActiveDrawer(null)} title="Available Vehicles" linkTo="/vehicles" linkLabel="Manage fleet">
        {availableVehiclesList.length === 0 ? <p className="text-white/30 text-sm text-center py-10">No available vehicles</p> : availableVehiclesList.map((v) => (
          <DrawerRow key={v.id} label={`${v.year} ${v.make} ${v.model}`} value={`$${v.weekly_rate || 0}/wk`} sub={`${v.city || v.current_city || "—"} · ${v.color || "—"} · ${v.plate || "No plate"}`} highlight="green" />
        ))}
      </StatCardDrawer>

      {/* Total Revenue */}
      <StatCardDrawer open={activeDrawer === "total_revenue"} onClose={() => setActiveDrawer(null)} title="Total Revenue" linkTo="/payments" linkLabel="View payments">
        <div className="mb-4 p-4 rounded-2xl border border-white/[0.07] bg-white/[0.03]">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-1">All-time collected</p>
          <p className="text-3xl font-syne font-bold text-white">${totalRevenue.toLocaleString()}</p>
        </div>
        {paidBookingRequests.map((b) => (
          <DrawerRow key={b.id} label={b.customer_full_name || "Customer"} value={`$${(b.total_due_now || 0).toLocaleString()}`} sub={`${b.vehicle_name} · ${b.booking_type}`} highlight="green" />
        ))}
        {payments.filter((p) => p.status === "Paid").map((p) => (
          <DrawerRow key={p.id} label={p.customer_name || "Customer"} value={`$${(p.amount || 0).toLocaleString()}`} sub={`${p.payment_type} · ${p.payment_method}`} highlight="green" />
        ))}
      </StatCardDrawer>

      {/* Monthly Revenue */}
      <StatCardDrawer open={activeDrawer === "monthly_revenue"} onClose={() => setActiveDrawer(null)} title="Monthly Revenue" linkTo="/payments" linkLabel="View payments">
        <div className="mb-4 p-4 rounded-2xl border border-white/[0.07] bg-white/[0.03]">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-1">{format(now, "MMMM yyyy")}</p>
          <p className="text-3xl font-syne font-bold text-white">${thisMonthRevenue.toLocaleString()}</p>
        </div>
        {thisMonthPaid.length === 0 ? <p className="text-white/30 text-sm text-center py-6">No payments this month</p> : thisMonthPaid.map((b) => (
          <DrawerRow key={b.id} label={b.customer_full_name || "Customer"} value={`$${(b.total_due_now || 0).toLocaleString()}`} sub={`${b.vehicle_name} · ${b.booking_type}`} highlight="green" />
        ))}
      </StatCardDrawer>

      {/* Customers */}
      <StatCardDrawer open={activeDrawer === "customers"} onClose={() => setActiveDrawer(null)} title="All Customers" linkTo="/customers" linkLabel="Manage customers">
        {customers.length === 0 ? <p className="text-white/30 text-sm text-center py-10">No customers yet</p> : customers.map((c) => (
          <DrawerRow key={c.id} label={c.full_name} value={c.status} sub={`${c.phone || "—"} · ${c.email || "—"}`} highlight={c.status === "Active" || c.status === "Approved" ? "green" : c.status === "Blocked" ? "red" : null} />
        ))}
      </StatCardDrawer>

      {/* Active RTO */}
      <StatCardDrawer open={activeDrawer === "active_rto"} onClose={() => setActiveDrawer(null)} title="Active Rent-to-Own" linkTo="/rent-to-own" linkLabel="Manage RTO">
        {activeRTOList.length === 0 ? <p className="text-white/30 text-sm text-center py-10">No active RTO contracts</p> : activeRTOList.map((item) => (
          item.customer_full_name
            ? <DrawerBookingRow key={item.id} booking={item} />
            : <DrawerRow key={item.id} label={item.customer_name || "Customer"} value={`$${item.weekly_payment || 0}/wk`} sub={item.vehicle_name} highlight="green" />
        ))}
      </StatCardDrawer>

      {/* Revenue area chart + fleet pie */}
      <div className="grid lg:grid-cols-3 gap-4">
        <GlassCard className="lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-syne font-bold text-white text-base">Revenue Trend</h3>
              <p className="text-xs text-white/35 mt-0.5">Monthly collected revenue</p>
            </div>
            <span className="text-xs font-semibold text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-lg">+12.4%</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendData.length > 0 ? trendData : [{ month: "01", revenue: 0 }]}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(338,90%,56%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(338,90%,56%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 20% 95% / 0.05)" />
              <XAxis dataKey="month" fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} />
              <YAxis fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip prefix="$" />} />
              <Area type="monotone" dataKey="revenue" stroke="hsl(338,90%,56%)" strokeWidth={2.5} fill="url(#revGrad)" dot={false} activeDot={{ r: 5, fill: "hsl(338,90%,56%)", stroke: "hsl(222,28%,10%)", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </GlassCard>

        <GlassCard>
          <div className="mb-5">
            <h3 className="font-syne font-bold text-white text-base">Fleet Status</h3>
            <p className="text-xs text-white/35 mt-0.5">{vehicles.length} total vehicles</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={fleetPie} cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={3} dataKey="value" strokeWidth={0}>
                {fleetPie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {fleetPie.map((item, i) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-xs text-white/50">{item.name}</span>
                </div>
                <span className="text-xs font-semibold text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Payment methods bar + recent bookings + overdue */}
      <div className="grid lg:grid-cols-3 gap-4">
        <GlassCard>
          <div className="mb-5">
            <h3 className="font-syne font-bold text-white text-base">Payment Methods</h3>
            <p className="text-xs text-white/35 mt-0.5">Revenue by method</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={methodChart.length > 0 ? methodChart : [{ name: "No Data", value: 0 }]}>
              <XAxis dataKey="name" fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} />
              <YAxis fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip prefix="$" />} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="url(#barGrad)">
                {methodChart.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} opacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-syne font-bold text-white text-base">Recent Bookings</h3>
              <p className="text-xs text-white/35 mt-0.5">Latest activity</p>
            </div>
            <Link to="/bookings" className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2.5">
            {recentBookings.length > 0 ? recentBookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.06] transition-colors border border-white/[0.04]">
                <div className="min-w-0">
                  <p className="font-medium text-white text-sm truncate">{b.customer_full_name || "Customer"}</p>
                  <p className="text-xs text-white/35 mt-0.5 truncate">{b.vehicle_name} · {b.booking_type}</p>
                </div>
                <StatusBadge status={b.booking_status} />
              </div>
            )) : (
              <p className="text-white/25 text-sm text-center py-6">No bookings yet</p>
            )}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-syne font-bold text-white text-base">Overdue Payments</h3>
              <p className="text-xs text-white/35 mt-0.5">Requires attention</p>
            </div>
            <Link to="/payments" className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2.5">
            {overduePayments.length > 0 ? overduePayments.slice(0, 4).map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-red-500/[0.07] border border-red-500/20 hover:bg-red-500/10 transition-colors">
                <div className="min-w-0">
                  <p className="font-medium text-white text-sm truncate">{p.customer_name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3 text-red-400" />
                    <p className="text-xs text-red-400/80">{p.due_date ? format(new Date(p.due_date), "MMM d") : "N/A"}</p>
                  </div>
                </div>
                <p className="font-bold text-red-400 text-sm">${p.amount?.toLocaleString()}</p>
              </div>
            )) : (
              <div className="flex flex-col items-center py-6">
                <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center mb-2">
                  <span className="text-green-400 text-lg">✓</span>
                </div>
                <p className="text-white/25 text-sm">All payments on time</p>
              </div>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}