import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { TrendingUp, DollarSign, Car, BarChart3 } from "lucide-react";
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white font-syne">Fleet Insights</h1>
        <p className="text-white/40 text-sm mt-1">ROI tracking and vehicle performance analytics</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, color: "text-green-400" },
          { label: "Net Profit", value: `$${totalProfit.toLocaleString()}`, color: "text-primary" },
          { label: "Avg Utilization", value: `${(avgUtilization * 100).toFixed(0)}%`, color: "text-blue-400" },
          { label: "Fleet Size", value: vehicles.length, color: "text-yellow-400" },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl border border-white/[0.08] p-5 glass text-center">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-2">{s.label}</p>
            <p className={`text-2xl font-black font-syne ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {chartData.length > 0 && (
        <div className="rounded-2xl border border-white/[0.08] p-6 glass">
          <h3 className="font-bold text-white mb-4">Weekly Revenue & Profit</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="week" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip contentStyle={{ background: "hsl(222 28% 12%)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "white" }} />
              <Bar dataKey="revenue" fill="hsl(338 90% 56% / 0.7)" radius={[4,4,0,0]} name="Revenue" />
              <Bar dataKey="profit" fill="hsl(152 60% 46% / 0.7)" radius={[4,4,0,0]} name="Profit" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {insights.length === 0 && !isLoading && (
        <div className="text-center py-20">
          <BarChart3 className="h-12 w-12 text-white/20 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white mb-2">No insights yet</h3>
          <p className="text-white/40 text-sm">Fleet insights are generated automatically as your vehicles generate rental activity.</p>
        </div>
      )}

      {/* Per-vehicle ROI */}
      {vehicles.length > 0 && (
        <div className="rounded-2xl border border-white/[0.08] glass overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.06]">
            <h3 className="font-bold text-white">Per-Vehicle ROI</h3>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {vehicles.map(v => {
              const vInsights = insights.filter(i => i.vehicle_id === v.id);
              const vRevenue = vInsights.reduce((s, i) => s + (i.gross_revenue || 0), 0);
              const vProfit = vInsights.reduce((s, i) => s + (i.net_profit || 0), 0);
              const weeklyAvg = vInsights.length > 0 ? vRevenue / vInsights.length : 0;
              const breakEvenWeeks = v.purchase_price && weeklyAvg > 0 ? Math.ceil(v.purchase_price / weeklyAvg) : null;
              return (
                <div key={v.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{v.year} {v.make} {v.model}</p>
                    <p className="text-xs text-white/40">{vInsights.length} weeks tracked · ${weeklyAvg.toFixed(0)}/wk avg</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-400">${vRevenue.toLocaleString()} earned</p>
                    {breakEvenWeeks && <p className="text-xs text-white/30">Break even in ~{breakEvenWeeks} wks</p>}
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