import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { DollarSign, Zap } from "lucide-react";
import {
  OperationalPageShell,
  OperationalHero,
  OperationalKpiGrid,
  OperationalFilterBar,
  OperationalExportToolbar,
  OperationalDataSection,
  OperationalDetailDrawer,
  OperationalPagination,
} from "@/components/operational";

const PAGE_SIZE = 50;

const statusConfig = {
  pending: { label: "Pending", color: "bg-yellow-500/20 text-yellow-400" },
  processing: { label: "Processing", color: "bg-blue-500/20 text-blue-400" },
  paid: { label: "Paid", color: "bg-green-500/20 text-green-400" },
  failed: { label: "Failed", color: "bg-red-500/20 text-red-400" },
  held: { label: "Held", color: "bg-orange-500/20 text-orange-400" },
  released: { label: "Released", color: "bg-green-500/20 text-green-400" },
};

export default function AdminPayouts() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ search: "", status: "" });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);

  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: () => base44.entities.HostPayout.list("-created_date", 300),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.HostPayout.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-payouts"] }),
  });

  const triggerPayout = async (payout) => {
    updateMutation.mutate({ id: payout.id, data: { status: "processing" } });
    const res = await base44.functions.invoke("processHostPayout", { payout_id: payout.id });
    if (res.data?.success) updateMutation.mutate({ id: payout.id, data: { status: "paid", payout_date: new Date().toISOString().split("T")[0], stripe_transfer_id: res.data.transfer_id } });
  };

  const filtered = useMemo(() => payouts.filter(p => {
    const q = (filters.search || "").toLowerCase();
    const matchSearch = !q || p.host_name?.toLowerCase().includes(q) || p.host_email?.toLowerCase().includes(q) || p.vehicle_name?.toLowerCase().includes(q);
    const matchFilter = !filters.status || p.status === filters.status;
    return matchSearch && matchFilter;
  }), [payouts, filters]);

  const paged = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const totalPending = payouts.filter(p => p.status === "pending").reduce((s, p) => s + (p.net_payout || p.net_host_payout || 0), 0);
  const totalPaid = payouts.filter(p => p.status === "paid").reduce((s, p) => s + (p.net_payout || p.net_host_payout || 0), 0);
  const totalPlatformFees = payouts.reduce((s, p) => s + (p.platform_fee || p.uride_platform_fee_amount || 0), 0);

  const exportCsv = () => {
    const rows = [["Host", "Email", "Vehicle", "Gross", "Platform Fee", "Net Payout", "Status", "Period Start", "Period End", "Transfer ID"], ...filtered.map(p => [p.host_name || "", p.host_email || "", p.vehicle_name || "", p.gross_collected || p.gross_booking_amount || 0, p.platform_fee || p.uride_platform_fee_amount || 0, p.net_payout || p.net_host_payout || 0, p.status || "", p.period_start || "", p.period_end || "", p.stripe_transfer_id || ""])];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `admin-payouts-${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const metrics = [
    { label: "Pending Payouts", value: totalPending, type: "currency", variant: "warning" },
    { label: "Total Paid Out", value: totalPaid, type: "currency", variant: "success" },
    { label: "Platform Revenue", value: totalPlatformFees, type: "currency", variant: "primary" },
    { label: "Filtered Records", value: filtered.length, variant: "default" },
  ];

  return (
    <OperationalPageShell mode="admin">
      <OperationalHero
        mode="admin"
        title="Host Payouts"
        subtitle={`Stripe Connect payout operations · ${payouts.filter(p => p.status === "pending").length} pending`}
        eyebrow="Operations"
        actions={<OperationalExportToolbar mode="admin" exports={[{ label: "Export", onClick: exportCsv }]} />}
      />

      <OperationalKpiGrid mode="admin" metrics={metrics} />
      <OperationalFilterBar mode="admin" filters={filters} onChange={(next) => { setFilters(next); setPage(0); }} statuses={["pending", "processing", "paid", "failed", "held", "released"]} resultCount={filtered.length} totalCount={payouts.length} placeholder="Search host, email, vehicle..." />

      <OperationalDataSection mode="admin" title="Payout Records" count={filtered.length} loading={isLoading} empty={filtered.length === 0} emptyIcon={DollarSign} emptyTitle="No payouts found" emptyDescription="Adjust filters to review host payout records.">
        <div className="divide-y divide-white/[0.06]">
          {paged.map(p => {
            const cfg = statusConfig[p.status] || statusConfig.pending;
            return (
              <div key={p.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <button onClick={() => setSelected(p)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold text-white">{p.host_name || p.host_email || "Unknown host"}</p>
                  <p className="text-xs text-white/40">{p.period_start} → {p.period_end} · {p.booking_count || 0} bookings</p>
                  {p.stripe_transfer_id && <p className="mt-0.5 truncate font-mono text-xs text-white/20">{p.stripe_transfer_id}</p>}
                </button>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <div className="text-right">
                    <p className="text-sm font-bold text-white">${(p.net_payout || p.net_host_payout || 0).toLocaleString()}</p>
                    <p className="text-xs text-white/30">${(p.gross_collected || p.gross_booking_amount || 0).toLocaleString()} gross · ${(p.platform_fee || p.uride_platform_fee_amount || 0).toLocaleString()} fee</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                  {p.status === "pending" && (
                    <button onClick={() => triggerPayout(p)} disabled={updateMutation.isPending} className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/20 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-primary/30">
                      <Zap className="h-3 w-3" /> Pay Now
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </OperationalDataSection>

      <OperationalPagination mode="admin" page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      <OperationalDetailDrawer mode="admin" title="Payout detail" record={selected} open={!!selected} onClose={() => setSelected(null)} fields={[
        { key: "host_name", label: "Host" }, { key: "host_email", label: "Email" }, { key: "vehicle_name", label: "Vehicle" },
        { key: "gross_booking_amount", label: "Gross", render: (r) => `$${Number(r.gross_collected || r.gross_booking_amount || 0).toLocaleString()}` },
        { key: "net_host_payout", label: "Net payout", render: (r) => `$${Number(r.net_payout || r.net_host_payout || 0).toLocaleString()}` },
        { key: "status", label: "Status" }, { key: "stripe_transfer_id", label: "Stripe transfer" },
      ]} />
    </OperationalPageShell>
  );
}