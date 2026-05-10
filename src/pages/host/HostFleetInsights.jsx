import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { BarChart3 } from "lucide-react";
import HostPageHeader from "@/components/host/HostPageHeader";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, startOfWeek, eachWeekOfInterval, subWeeks } from "date-fns";

export default function HostFleetInsights() {
  const { user } = useAuth();

  const { data: hosts = [] } = useQuery({
    queryKey: ["my-host", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user?.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const { data: vehicles = [] } = useQuery({
    queryKey: ["host-vehicles", host?.id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const vehicleIds = vehicles.map(v => v.id);

  const { data: allBookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ["host-fleet-bookings", host?.id, vehicles.length],
    queryFn: async () => {
      const all = await base44.entities.BookingRequest.list("-created_date", 500);
      return all.filter(b => vehicleIds.includes(b.vehicle_id));
    },
    enabled: !!host?.id && vehicles.length > 0,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["host-expenses-insights", host?.id],
    queryFn: () => base44.entities.HostExpense.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  // Only count bookings that are active/confirmed/completed (revenue-generating)
  const activeBookings = allBookings.filter(b =>
    ["active", "confirmed", "approved", "completed"].includes(b.booking_status)
  );

  // Total revenue = sum of weekly rates × billing weeks completed
  const totalRevenue = activeBookings.reduce((s, b) => {
    const weeks = Math.max(1, b.billing_week_number || 1);
    return s + (b.weekly_rate || 0) * weeks;
  }, 0);

  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalProfit = totalRevenue - totalExpenses;

  // Utilization: vehicles currently rented / total vehicles
  const rentedVehicles = vehicles.filter(v => v.status === "Booked").length;
  const utilization = vehicles.length > 0 ? rentedVehicles / vehicles.length : 0;

  // Build weekly revenue chart from booking start dates (last 8 weeks)
  const now = new Date();
  const weeks = eachWeekOfInterval({ start: subWeeks(now, 7), end: now }, { weekStartsOn: 1 });

  const chartData = weeks.map(weekStart => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weekRevenue = activeBookings
      .filter(b => {
        if (!b.start_date) return false;
        const start = new Date(b.start_date);
        return start >= weekStart && start < weekEnd;
      })
      .reduce((s, b) => s + (b.weekly_rate || 0), 0);

    const weekExpenses = expenses
      .filter(e => {
        if (!e.date) return false;
        const d = new Date(e.date);
        return d >= weekStart && d < weekEnd;
      })
      .reduce((s, e) => s + (e.amount || 0), 0);

    return {
      week: format(weekStart, "MMM d"),
      revenue: weekRevenue,
      profit: Math.max(0, weekRevenue - weekExpenses),
    };
  });

  const hasData = activeBookings.length > 0;
  const isLoading = loadingBookings && vehicles.length > 0;

  return (
    <div className="space-y-5">
      <HostPageHeader title="Fleet Insights" subtitle="Live ROI tracking from your active bookings" />

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, color: "text-emerald-600", grad: "hsl(152 60% 46% / 0.1)" },
          { label: "Net Profit", value: `$${totalProfit.toLocaleString()}`, color: totalProfit >= 0 ? "text-pink-600" : "text-red-600", grad: "hsl(338 90% 56% / 0.08)" },
          { label: "Avg Utilization", value: `${(utilization * 100).toFixed(0)}%`, color: "text-blue-600", grad: null },
          { label: "Fleet Size", value: vehicles.length, color: "text-violet-600", grad: null },
        ].map((s, i) => (
          <div key={i}
            className={`rounded-3xl shadow-sm p-4 text-center ${s.grad ? "" : "bg-white border border-gray-100"}`}
            style={s.grad ? { background: `linear-gradient(135deg, ${s.grad}, transparent)`, border: `1px solid ${s.grad}` } : {}}>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{s.label}</p>
            <p className={`text-2xl font-black ${s.color}`} style={{ fontFamily: "var(--font-syne)" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Weekly chart */}
      {chartData.some(d => d.revenue > 0) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-900 mb-4 text-sm">Weekly Revenue & Profit (Live)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="week" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12 }} />
              <Bar dataKey="revenue" fill="hsl(338, 90%, 56%)" radius={[4, 4, 0, 0]} name="Revenue" />
              <Bar dataKey="profit" fill="hsl(152, 60%, 46%)" radius={[4, 4, 0, 0]} name="Profit" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !hasData && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <BarChart3 className="h-7 w-7 text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">No active rentals yet</h3>
          <p className="text-gray-400 text-sm">Insights will appear here once you have active or completed bookings.</p>
        </div>
      )}

      {/* Per-vehicle ROI */}
      {vehicles.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="font-bold text-gray-900 text-sm">Per-Vehicle Performance</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {vehicles.map(v => {
              const vBookings = activeBookings.filter(b => b.vehicle_id === v.id);
              const vRevenue = vBookings.reduce((s, b) => s + (b.weekly_rate || 0) * Math.max(1, b.billing_week_number || 1), 0);
              const vExpenses = expenses.filter(e => e.vehicle_id === v.id).reduce((s, e) => s + (e.amount || 0), 0);
              const vProfit = vRevenue - vExpenses;
              const isRented = v.status === "Booked";
              const currentBooking = vBookings.find(b => ["active", "confirmed", "approved"].includes(b.booking_status));

              return (
                <div key={v.id} className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{v.year} {v.make} {v.model}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isRented ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                          {isRented ? "Rented" : v.status}
                        </span>
                      </div>
                      {currentBooking && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {currentBooking.customer_full_name} · Week {currentBooking.billing_week_number || 1} · ${currentBooking.weekly_rate}/wk
                        </p>
                      )}
                      {!currentBooking && <p className="text-xs text-gray-400 mt-0.5">{vBookings.length} booking{vBookings.length !== 1 ? "s" : ""} total</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-600">${vRevenue.toLocaleString()} earned</p>
                      <p className={`text-xs font-semibold ${vProfit >= 0 ? "text-gray-400" : "text-red-400"}`}>
                        ${vProfit.toLocaleString()} net
                      </p>
                      {v.purchase_price && vRevenue > 0 && (
                        <p className="text-xs text-gray-300">
                          {Math.round((vRevenue / v.purchase_price) * 100)}% ROI recovered
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Revenue progress bar */}
                  {v.purchase_price && (
                    <div className="mt-2">
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, (vRevenue / v.purchase_price) * 100)}%`,
                            background: "linear-gradient(90deg, hsl(338 90% 56%), hsl(265 80% 62%))"
                          }} />
                      </div>
                      <p className="text-[10px] text-gray-300 mt-1">${vRevenue.toLocaleString()} of ${v.purchase_price.toLocaleString()} purchase price recovered</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}