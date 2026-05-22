import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { loadSharedMaintenanceEngine } from "@/lib/operational/sharedMaintenanceEngine";
import { buildMaintenanceExportRows, downloadCsv } from "@/lib/operational/sharedExportUtils";
import { SHARED_DATE_RANGES } from "@/lib/operational/sharedOperationalFilters";
import {
  OperationalPageShell,
  OperationalHero,
  OperationalKpiGrid,
  OperationalFilterBar,
  OperationalAdvancedFilters,
  OperationalExportToolbar,
  OperationalDataSection,
  OperationalDetailDrawer,
  OperationalPagination,
} from "@/components/operational";
import { Wrench } from "lucide-react";

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
    { label: "Maintenance cost", value: data?.kpis?.totalCost, type: "currency", variant: "danger" },
    { label: "Overdue alerts", value: data?.kpis?.overdueCount, variant: "danger" },
    { label: "Due soon alerts", value: data?.kpis?.dueSoonCount, variant: "warning" },
    { label: "Downtime vehicles", value: data?.kpis?.downtimeCount, variant: "info" },
  ];

  return (
    <OperationalPageShell mode="admin">
      <OperationalHero
        mode="admin"
        title="Admin Maintenance"
        subtitle="Fleet service tracking, alerts, and operational cost visibility across hosts"
        eyebrow="Operations"
        actions={<OperationalExportToolbar mode="admin" exports={[{ label: "Export", onClick: () => downloadCsv(buildMaintenanceExportRows(records), "admin-maintenance.csv") }]} />}
      />

      <OperationalKpiGrid mode="admin" metrics={metrics} />

      <OperationalDataSection mode="admin" title="Maintenance Insights" subtitle="Historical records, alerts, and host cost concentration" bodyClassName="p-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-white/35">Historical Records</p>
            <div className="mt-3 space-y-2 text-sm text-white/45">
              <div className="flex justify-between"><span>Count</span><span className="text-white">{legacyRecords.length}</span></div>
              <div className="flex justify-between"><span>Total cost</span><span className="text-white">${legacyTotalCost.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Needs review</span><span className="text-yellow-400">{unresolvedLegacyRecords.length}</span></div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-white/35">Service Alerts</p>
            <p className="mt-3 text-sm text-white/45">{data?.alerts?.overdue?.length || 0} overdue and {data?.alerts?.dueSoon?.length || 0} due soon records.</p>
            <p className="mt-2 text-xs text-white/30">Affected vehicles: {affectedLegacyVehicles.length ? affectedLegacyVehicles.join(", ") : "—"}</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-white/35">Cost Insights by Host</p>
            <div className="mt-3 space-y-2">
              {costInsights.map(([hostId, amount]) => { const host = hosts.find((item) => item.id === hostId); return <div key={hostId} className="flex justify-between gap-3 text-sm"><span className="truncate text-white/45">{host?.business_name || host?.full_name || "Unknown"}</span><span className="font-semibold text-white">${amount.toLocaleString()}</span></div>; })}
            </div>
          </div>
        </div>
      </OperationalDataSection>

      <OperationalFilterBar mode="admin" filters={filters} onChange={(next) => { setFilters(next); setPage(0); }} vehicles={vehicles} categories={categories} statuses={STATUSES} dateRanges={SHARED_DATE_RANGES} resultCount={records.length} totalCount={data?.hostMaintenanceLogs?.length || records.length} />
      <OperationalAdvancedFilters mode="admin" filters={filters} onChange={(next) => { setFilters(next); setPage(0); }} hosts={hosts} />

      <OperationalDataSection mode="admin" title="Maintenance Records" count={records.length} loading={isLoading} empty={records.length === 0} emptyIcon={Wrench} emptyTitle="No maintenance records found" emptyDescription="Adjust filters to review service records.">
        <div className="divide-y divide-white/[0.06]">
          {pagedRecords.map((record) => (
            <button key={`${record.source}_${record.source_id}`} onClick={() => setSelected(record)} className="w-full px-4 py-3 text-left transition-all hover:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-4"><span className="truncate font-medium text-white">{record.vehicle_name || "Unknown vehicle"}</span><span className="font-bold text-white">${Number(record.cost || 0).toLocaleString()}</span></div>
              <div className="mt-1 truncate text-xs text-white/40">{record.host_name || "Unknown host"} · {record.service_type || "service"} · {record.computed_status?.replaceAll("_", " ")}</div>
            </button>
          ))}
        </div>
      </OperationalDataSection>

      <OperationalPagination mode="admin" page={page} pageSize={PAGE_SIZE} total={records.length} onPageChange={setPage} />
      <OperationalDetailDrawer mode="admin" title="Maintenance detail" record={selected} open={!!selected} onClose={() => setSelected(null)} fields={[
        { key: "host_name", label: "Host" }, { key: "vehicle_name", label: "Vehicle" },
        { key: "service_type", label: "Service" }, { key: "computed_status", label: "Status", render: (r) => r.computed_status?.replaceAll("_", " ") },
        { key: "cost", label: "Cost", render: (r) => `$${Number(r.cost || 0).toLocaleString()}` }, { key: "date", label: "Date" },
        { key: "next_service_date", label: "Next service date" }, { key: "next_service_mileage", label: "Next service mileage" }, { key: "notes", label: "Notes" },
      ]} />
    </OperationalPageShell>
  );
}