import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { loadSharedMaintenanceEngine } from "@/lib/operational/sharedMaintenanceEngine";
import { buildMaintenanceExportRows, downloadCsv } from "@/lib/operational/sharedExportUtils";
import {
  OperationalPageHeader,
  OperationalMetricGrid,
  OperationalFilters,
  OperationalSectionCard,
  OperationalListContainer,
  OperationalRecordHealth,
} from "@/components/admin/operational";
import PrototypePagination from "@/components/admin/prototypes/PrototypePagination";
import PrototypeDetailDrawer from "@/components/admin/prototypes/PrototypeDetailDrawer";

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
    <div className="space-y-5 animate-fade-in-up">
      <OperationalPageHeader
        title="Admin Maintenance"
        subtitle="Fleet service tracking, alerts, and operational cost visibility across hosts"
        eyebrow="Operations"
        action={<Button onClick={() => downloadCsv(buildMaintenanceExportRows(records), "admin-maintenance.csv")} className="gap-2"><Download className="h-4 w-4" /> Export</Button>}
      />
      <OperationalFilters filters={filters} onChange={(next) => { setFilters(next); setPage(0); }} hosts={hosts} vehicles={vehicles} categories={categories} statuses={STATUSES} resultCount={records.length} totalCount={data?.hostMaintenanceLogs?.length || records.length} />
      {legacyRecords.length > 0 && (
        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/[0.06] px-4 py-3 text-sm text-yellow-200">
          {legacyRecords.length} historical maintenance record{legacyRecords.length === 1 ? "" : "s"} available for review.
        </div>
      )}
      <OperationalMetricGrid metrics={metrics} />
      <OperationalRecordHealth currentCount={data?.hostMaintenanceLogs?.length || 0} historicalCount={legacyRecords.length} needsReviewCount={unresolvedLegacyRecords.length} dateFilter={currentDateFilter} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <OperationalListContainer title="Maintenance Records" count={pagedRecords.length} loading={isLoading} emptyTitle="No maintenance records found" emptyDescription="Adjust filters to review service records.">
            <div className="divide-y divide-white/[0.06]">
              {pagedRecords.map((record) => (
                <button key={`${record.source}_${record.source_id}`} onClick={() => setSelected(record)} className="w-full text-left px-4 py-3 hover:bg-white/[0.04] transition-all">
                  <div className="flex items-center justify-between gap-4"><span className="font-medium text-white truncate">{record.vehicle_name || "Unknown vehicle"}</span><span className="font-bold text-white">${Number(record.cost || 0).toLocaleString()}</span></div>
                  <div className="text-xs text-white/40 mt-1 truncate">{record.host_name || "Unknown host"} · {record.service_type || "service"} · {record.computed_status?.replaceAll("_", " ")}</div>
                </button>
              ))}
            </div>
          </OperationalListContainer>
        </div>
        <div className="space-y-4">
          <OperationalSectionCard title="Historical Records">
            <div className="p-4 space-y-2 text-sm text-white/45">
              <div className="flex justify-between"><span>Count</span><span className="text-white">{legacyRecords.length}</span></div>
              <div className="flex justify-between"><span>Total cost</span><span className="text-white">${legacyTotalCost.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Needs review</span><span className="text-white">{unresolvedLegacyRecords.length}</span></div>
              <div>
                <p>Affected vehicles</p>
                <p className="text-white mt-1">{affectedLegacyVehicles.length ? affectedLegacyVehicles.join(", ") : "—"}</p>
              </div>
            </div>
          </OperationalSectionCard>
          <OperationalSectionCard title="Service Alerts"><p className="p-4 text-sm text-white/45">{data?.alerts?.overdue?.length || 0} overdue and {data?.alerts?.dueSoon?.length || 0} due soon records.</p></OperationalSectionCard>
          <OperationalSectionCard title="Cost Insights by Host"><div className="p-4 space-y-3">{costInsights.map(([hostId, amount]) => { const host = hosts.find((item) => item.id === hostId); return <div key={hostId} className="flex justify-between gap-3 text-sm"><span className="text-white/45 truncate">{host?.business_name || host?.full_name || "Unknown"}</span><span className="font-semibold text-white">${amount.toLocaleString()}</span></div>; })}</div></OperationalSectionCard>
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