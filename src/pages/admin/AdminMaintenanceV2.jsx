import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { loadSharedMaintenanceEngine } from "@/lib/operational/sharedMaintenanceEngine";
import { buildMaintenanceExportRows, downloadCsv } from "@/lib/operational/sharedExportUtils";
import PrototypePageHeader from "@/components/admin/prototypes/PrototypePageHeader";
import PrototypeMetricGrid from "@/components/admin/prototypes/PrototypeMetricGrid";
import PrototypeFilters from "@/components/admin/prototypes/PrototypeFilters";
import PrototypePagination from "@/components/admin/prototypes/PrototypePagination";
import PrototypeDetailDrawer from "@/components/admin/prototypes/PrototypeDetailDrawer";
import PrototypeReconciliationPanel from "@/components/admin/prototypes/PrototypeReconciliationPanel";

const PAGE_SIZE = 50;
const STATUSES = ["overdue", "due_soon", "scheduled", "completed", "in_maintenance"];

export default function AdminMaintenanceV2() {
  const [filters, setFilters] = useState({ dateRange: "last30" });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-maintenance-v2-prototype", filters, page],
    queryFn: async () => {
      const user = await base44.auth.me();
      return loadSharedMaintenanceEngine({ mode: "admin", user, filters, limit: 500 });
    },
  });

  const records = data?.records || [];
  const currentDateFilter = filters.dateRange || "last30";
  const legacyRecords = data?.legacyMaintenanceRecords || [];
  const unresolvedLegacyRecords = legacyRecords.filter((record) => !record.host_id);
  const legacyTotalCost = legacyRecords.reduce((sum, record) => sum + (record.cost || 0), 0);
  const affectedLegacyVehicles = [...new Set(legacyRecords.map((record) => record.vehicle_name).filter(Boolean))];
  const hosts = data?.sources?.hosts || [];
  const vehicles = data?.sources?.vehicles || [];
  const categories = useMemo(() => [...new Set(records.map((item) => item.service_type).filter(Boolean))], [records]);
  const pagedRecords = records.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const costInsights = useMemo(() => Object.entries(data?.breakdowns?.byHost || {}).sort((a, b) => b[1] - a[1]).slice(0, 5), [data]);

  const metrics = [
    { label: "Maintenance cost", value: data?.kpis?.totalCost, type: "currency" },
    { label: "Overdue alerts", value: data?.kpis?.overdueCount },
    { label: "Due soon alerts", value: data?.kpis?.dueSoonCount },
    { label: "Downtime vehicles", value: data?.kpis?.downtimeCount },
  ];

  return (
    <div className="p-6 space-y-6 mesh-bg min-h-screen">
      <PrototypePageHeader
        title="Admin Maintenance"
        subtitle="Fleet maintenance tracking, service alerts, and operational cost visibility."
        action={<Button onClick={() => downloadCsv(buildMaintenanceExportRows(records), "admin-maintenance.csv")} className="gap-2"><Download className="h-4 w-4" /> Export</Button>}
      />
      <PrototypeFilters filters={filters} onChange={(next) => { setFilters(next); setPage(0); }} hosts={hosts} vehicles={vehicles} categories={categories} statuses={STATUSES} />
      <div className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold text-primary capitalize">
        Date range: {currentDateFilter.replaceAll("_", " ")}
      </div>
      {legacyRecords.length > 0 && (
        <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-200">
          Some historical maintenance records need host review.
        </div>
      )}
      <PrototypeMetricGrid metrics={metrics} />
      <PrototypeReconciliationPanel modernCount={data?.hostMaintenanceLogs?.length || 0} legacyCount={legacyRecords.length} unresolvedCount={unresolvedLegacyRecords.length} dateFilter={currentDateFilter} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 glass rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-white/10 font-semibold">Maintenance records</div>
          {isLoading ? <div className="p-6 text-muted-foreground">Loading maintenance records...</div> : pagedRecords.map((record) => (
            <button key={`${record.source}_${record.source_id}`} onClick={() => setSelected(record)} className="w-full text-left p-4 border-b border-white/5 hover:bg-white/[0.04] transition-all">
              <div className="flex justify-between gap-4"><span className="font-medium">{record.vehicle_name || "Unknown vehicle"}</span><span>${Number(record.cost || 0).toLocaleString()}</span></div>
              <div className="text-xs text-muted-foreground mt-1">{record.host_name || "Unknown host"} · {record.service_type || "service"} · {record.computed_status?.replaceAll("_", " ")}</div>
            </button>
          ))}
        </div>
        <div className="space-y-4">
          <div className="glass rounded-2xl p-4">
            <h3 className="font-semibold mb-3">Historical Records</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex justify-between"><span>Count</span><span className="text-white">{legacyRecords.length}</span></div>
              <div className="flex justify-between"><span>Total cost</span><span className="text-white">${legacyTotalCost.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Unresolved host attribution</span><span className="text-white">{unresolvedLegacyRecords.length}</span></div>
              <div>
                <p>Affected vehicles</p>
                <p className="text-white mt-1">{affectedLegacyVehicles.length ? affectedLegacyVehicles.join(", ") : "—"}</p>
              </div>
            </div>
          </div>
          <div className="glass rounded-2xl p-4"><h3 className="font-semibold mb-3">Overdue / due soon</h3><p className="text-sm text-muted-foreground">{data?.alerts?.overdue?.length || 0} overdue and {data?.alerts?.dueSoon?.length || 0} due soon records from shared alerts.</p></div>
          <div className="glass rounded-2xl p-4"><h3 className="font-semibold mb-3">Cost insights by host</h3><div className="space-y-3">{costInsights.map(([hostId, amount]) => { const host = hosts.find((item) => item.id === hostId); return <div key={hostId} className="flex justify-between text-sm"><span className="text-muted-foreground">{host?.business_name || host?.full_name || "Unknown"}</span><span>${amount.toLocaleString()}</span></div>; })}</div></div>
        </div>
      </div>

      <PrototypePagination page={page} pageSize={PAGE_SIZE} total={records.length} onPageChange={setPage} />
      <PrototypeDetailDrawer title="Maintenance detail" record={selected} open={!!selected} onOpenChange={() => setSelected(null)} fields={[
        { key: "host_name", label: "Host" }, { key: "vehicle_name", label: "Vehicle" },
        { key: "service_type", label: "Service" }, { key: "computed_status", label: "Status", render: (r) => r.computed_status?.replaceAll("_", " ") },
        { key: "cost", label: "Cost", render: (r) => `$${Number(r.cost || 0).toLocaleString()}` }, { key: "date", label: "Date" },
        { key: "next_service_date", label: "Next service date" }, { key: "next_service_mileage", label: "Next service mileage" }, { key: "notes", label: "Notes" },
      ]} />
    </div>
  );
}