import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { TrendingUp, DollarSign, Car, BarChart3 } from "lucide-react";
import HostPageHeader from "@/components/host/HostPageHeader";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function HostFleetInsights() {
  const { user } = useAuth();

  const { data: hosts = [] } = useQuery({ queryKey: ["my-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user?.email }), enabled: !!user?.email });
  const host = hosts[0];

  const { data: insights = [], isLoading } = useQuery({
    queryKey: ["fleet-insights", host?.id],
    queryFn: () => base44.entities.FleetInsight.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["host-vehicles", host?.id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const totalRevenue = insights.reduce((s, i) => s + (i.gross_revenue || 0), 0);
  const totalProfit = insights.reduce((s, i) => s + (i.net_profit || 0), 0);
  const avgUtilization = insights.length > 0 ? insights.reduce((s, i) => s + (i.utilization_rate || 0), 0) / insights.length : 0;

  const chartData = insights.slice(-8).map(i => ({
    week: i.week_start?.slice(5),
    revenue: i.gross_revenue || 0,
    profit: i.net_profit || 0,
  }));

  return (
    <div className="space-y-5">
      <HostPageHeader title="Fleet Insights" subtitle="ROI tracking and vehicle performance analytics" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, color: "text-emerald-600", grad: "hsl(152 60% 46% / 0.1)" },
          { label: "Net Profit", value: `$${totalProfit.toLocaleString()}`, color: "text-pink-600", grad: "hsl(338 90% 56% / 0.08)" },
          { label: "Avg Utilization", value: `${(avgUtilization * 100).toFixed(0)}%`, color: "text-blue-600", grad: null },
          { label: "Fleet Size", value: vehicles.length, color: "text-violet-600", grad: null },
        ].map((s, i) => (
          <div key={i} className={`rounded-3xl shadow-sm p-4 text-center hover:shadow-md transition-shadow ${s.grad ? "" : "bg-white border border-gray-100"}`}
            style={s.grad ? { background: `linear-gradient(135deg, ${s.grad}, transparent)`, border: `1px solid ${s.grad}` } : {}}>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{s.label}</p>
            <p className={`text-2xl font-black ${s.color}`} style={{ fontFamily: "var(--font-syne)" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {chartData.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-900 mb-4 text-sm">Weekly Revenue & Profit</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="week" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12 }} />
              <Bar dataKey="revenue" fill="hsl(338 90% 56% / 0.8)" radius={[4,4,0,0]} name="Revenue" />
              <Bar dataKey="profit" fill="hsl(152 60% 46% / 0.8)" radius={[4,4,0,0]} name="Profit" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {insights.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <BarChart3 className="h-7 w-7 text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">No insights yet</h3>
          <p className="text-gray-400 text-sm">Fleet insights are generated automatically as your vehicles generate rental activity.</p>
        </div>
      )}

      {vehicles.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="font-bold text-gray-900 text-sm">Per-Vehicle ROI</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {vehicles.map(v => {
              const vInsights = insights.filter(i => i.vehicle_id === v.id);
              const vRevenue = vInsights.reduce((s, i) => s + (i.gross_revenue || 0), 0);
              const weeklyAvg = vInsights.length > 0 ? vRevenue / vInsights.length : 0;
              const breakEvenWeeks = v.purchase_price && weeklyAvg > 0 ? Math.ceil(v.purchase_price / weeklyAvg) : null;
              return (
                <div key={v.id} className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{v.year} {v.make} {v.model}</p>
                    <p className="text-xs text-gray-400">{vInsights.length} weeks tracked · ${weeklyAvg.toFixed(0)}/wk avg</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-600">${vRevenue.toLocaleString()} earned</p>
                    {breakEvenWeeks && <p className="text-xs text-gray-400">Break even ~{breakEvenWeeks} wks</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}