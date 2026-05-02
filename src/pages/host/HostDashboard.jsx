import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Link } from "react-router-dom";
import { DollarSign, Car, Shield, TrendingUp, AlertTriangle, CheckCircle2, Clock, Zap, ArrowRight } from "lucide-react";

const StatCard = ({ label, value, sub, icon: Icon, color }) => (
  <div className="rounded-2xl border border-white/[0.08] p-5 glass">
    <div className="flex items-center justify-between mb-3">
      <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">{label}</p>
      <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
    </div>
    <p className="text-2xl font-black text-white font-syne">{value}</p>
    {sub && <p className="text-xs text-white/40 mt-1">{sub}</p>}
  </div>
);

export default function HostDashboard() {
  const { user } = useAuth();

  const { data: hosts = [] } = useQuery({
    queryKey: ["my-host-profile", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user?.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const { data: vehicles = [] } = useQuery({
    queryKey: ["host-vehicles", host?.id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ["host-payouts", host?.id],
    queryFn: () => base44.entities.HostPayout.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const { data: compliance = [] } = useQuery({
    queryKey: ["host-compliance", host?.id],
    queryFn: () => base44.entities.HostVehicleCompliance.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["host-bookings", host?.id],
    queryFn: () => base44.entities.BookingRequest.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const pendingPayout = payouts.filter(p => p.status === "pending").reduce((s, p) => s + (p.net_payout || 0), 0);
  const totalEarned = payouts.filter(p => p.status === "paid").reduce((s, p) => s + (p.net_payout || 0), 0);
  const activeBookings = bookings.filter(b => ["active", "confirmed", "approved"].includes(b.booking_status));
  const expiringDocs = compliance.filter(c => c.status === "expiring_soon" || c.status === "expired");

  if (!host) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Clock className="h-12 w-12 text-white/20 mb-4" />
      <h2 className="text-xl font-bold text-white mb-2">Application Pending</h2>
      <p className="text-white/40 text-sm max-w-sm">Your host application is under review. You'll receive an email once approved with your Stripe Connect onboarding link.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white font-syne">Welcome back, {host.full_name?.split(" ")[0]}!</h1>
        <p className="text-white/40 text-sm mt-1">Here's your fleet performance overview</p>
      </div>

      {/* Stripe Connect alert */}
      {!host.stripe_onboarding_complete && (
        <div className="p-4 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-yellow-300">Set Up Your Payouts</p>
              <p className="text-xs text-yellow-400/70">Complete Stripe Connect onboarding to receive automatic payouts</p>
            </div>
          </div>
          <Link to="/host/payouts" className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold text-white bg-yellow-500/20 border border-yellow-500/30 hover:bg-yellow-500/30 transition-all">
            Set Up Now →
          </Link>
        </div>
      )}

      {/* Compliance alert */}
      {expiringDocs.length > 0 && (
        <div className="p-4 rounded-2xl border border-red-500/30 bg-red-500/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-red-300">{expiringDocs.length} Document{expiringDocs.length > 1 ? "s" : ""} Need Attention</p>
              <p className="text-xs text-red-400/70">Insurance or registration documents expiring soon</p>
            </div>
          </div>
          <Link to="/host/compliance" className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 transition-all">
            View Docs →
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pending Payout" value={`$${pendingPayout.toLocaleString()}`} sub="Next transfer" icon={DollarSign} color="bg-green-500/20" />
        <StatCard label="Total Earned" value={`$${totalEarned.toLocaleString()}`} sub="All time" icon={TrendingUp} color="bg-primary/20" />
        <StatCard label="Active Vehicles" value={vehicles.filter(v => v.status === "Booked" || v.status === "Available").length} sub={`of ${vehicles.length} total`} icon={Car} color="bg-blue-500/20" />
        <StatCard label="Active Rentals" value={activeBookings.length} sub="Operators on road" icon={CheckCircle2} color="bg-purple-500/20" />
      </div>

      {/* Fleet Score */}
      <div className="rounded-2xl border border-white/[0.08] p-6 glass">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-white">Fleet Score</h3>
          <span className="text-2xl font-black gradient-text font-syne">{host.fleet_score || 100}/100</span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full gradient-primary transition-all" style={{ width: `${host.fleet_score || 100}%` }} />
        </div>
        <p className="text-xs text-white/30 mt-2">Fleet score reflects compliance, payment history, and operator satisfaction</p>
      </div>

      {/* Active Rentals */}
      {activeBookings.length > 0 && (
        <div className="rounded-2xl border border-white/[0.08] p-6 glass">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">Active Rentals</h3>
            <Link to="/host/vehicles" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">View all <ArrowRight className="h-3 w-3" /></Link>
          </div>
          <div className="space-y-3">
            {activeBookings.slice(0, 5).map(b => (
              <div key={b.id} className="flex items-center justify-between py-2 border-b border-white/[0.06] last:border-0">
                <div>
                  <p className="text-sm font-semibold text-white">{b.vehicle_name}</p>
                  <p className="text-xs text-white/40">{b.customer_full_name || b.user_email}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-green-400">${b.weekly_rate}/wk</p>
                  <p className="text-xs text-white/40 capitalize">{b.booking_status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Add Vehicle", href: "/host/vehicles", icon: Car },
          { label: "View Payouts", href: "/host/payouts", icon: DollarSign },
          { label: "Upload Docs", href: "/host/compliance", icon: Shield },
          { label: "Fleet Insights", href: "/host/fleet-insights", icon: TrendingUp },
        ].map(item => (
          <Link key={item.href} to={item.href}
            className="flex items-center gap-3 p-4 rounded-2xl border border-white/[0.08] hover:border-primary/30 bg-white/[0.02] hover:bg-primary/5 transition-all group">
            <item.icon className="h-5 w-5 text-white/30 group-hover:text-primary transition-colors" />
            <span className="text-sm font-medium text-white/60 group-hover:text-white transition-colors">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}