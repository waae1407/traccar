import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { FileKey, TrendingUp, DollarSign, CheckCircle2 } from "lucide-react";

const statusColors = {
  Active: "bg-emerald-50 text-emerald-600",
  "At Risk": "bg-yellow-50 text-yellow-600",
  Completed: "bg-blue-50 text-blue-600",
  Cancelled: "bg-red-50 text-red-600",
};

export default function HostRTO() {
  const { user } = useAuth();

  const { data: hosts = [] } = useQuery({ queryKey: ["my-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user?.email }), enabled: !!user?.email });
  const host = hosts[0];

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["host-rto", host?.id],
    queryFn: () => base44.entities.RentToOwnContract.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const totalValue = contracts.reduce((s, c) => s + (c.total_contract_value || 0), 0);
  const totalCollected = contracts.reduce((s, c) => s + (c.total_paid || 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>RTO Contracts</h1>
        <p className="text-gray-400 text-sm mt-1">Rent-to-Own contracts for your vehicles</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Active</p>
          <p className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>{contracts.filter(c => c.status === "Active").length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Total Value</p>
          <p className="text-2xl font-black text-emerald-600" style={{ fontFamily: "var(--font-syne)" }}>${totalValue.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Collected</p>
          <p className="text-2xl font-black text-pink-600" style={{ fontFamily: "var(--font-syne)" }}>${totalCollected.toLocaleString()}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />)}</div>
      ) : contracts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <FileKey className="h-7 w-7 text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">No RTO Contracts</h3>
          <p className="text-gray-400 text-sm">When renters enter RTO agreements on your vehicles, they'll appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {contracts.map(c => {
            const progress = c.total_contract_value > 0 ? Math.min(100, ((c.total_paid || 0) / c.total_contract_value) * 100) : 0;
            const remaining = (c.total_contract_value || 0) - (c.total_paid || 0);
            const equity = c.total_contract_value > 0 ? ((c.total_paid || 0) / c.total_contract_value) * 100 : 0;
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-gray-900">{c.vehicle_name}</h3>
                    <p className="text-sm text-gray-400">{c.customer_name} · Started {c.start_date}</p>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${statusColors[c.status] || "bg-gray-100 text-gray-500"}`}>{c.status}</span>
                </div>
                <div className="grid grid-cols-4 gap-3 mb-4 text-sm">
                  <div><p className="text-gray-400 text-xs">Weekly</p><p className="font-bold text-gray-900">${c.weekly_payment}/wk</p></div>
                  <div><p className="text-gray-400 text-xs">Collected</p><p className="font-bold text-emerald-600">${(c.total_paid || 0).toLocaleString()}</p></div>
                  <div><p className="text-gray-400 text-xs">Remaining</p><p className="font-bold text-gray-900">${remaining.toLocaleString()}</p></div>
                  <div><p className="text-gray-400 text-xs">Equity</p><p className="font-bold text-pink-600">{equity.toFixed(1)}%</p></div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                    <span>Progress toward ownership</span>
                    <span>{progress.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: "linear-gradient(90deg, hsl(338 90% 56%), hsl(265 80% 62%))" }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}