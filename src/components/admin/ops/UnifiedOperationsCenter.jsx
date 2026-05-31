import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import UnifiedOpsSummaryCards from "./UnifiedOpsSummaryCards";
import UnifiedOpsFilters from "./UnifiedOpsFilters";
import UnifiedOpsItemList from "./UnifiedOpsItemList";
import UnifiedOpsDrawer from "./UnifiedOpsDrawer";
import { applyFilters, buildOperationsData, STREAM_TABS } from "./unifiedOpsModel";

const initialFilters = { domain: "all", severity: "all", status: "", assignedRole: "all", sourceType: "", from: "", to: "", host: "", customer: "", vehicle: "", booking: "", provider: "", alertType: "", search: "" };

function useEntityList(entityName, sort = "-created_date", limit = 200) {
  return useQuery({ queryKey: ["unified-ops", entityName, limit], queryFn: () => base44.entities[entityName].list(sort, limit), staleTime: 20_000, refetchInterval: 60_000 });
}

export default function UnifiedOperationsCenter() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(initialFilters);
  const [activeStream, setActiveStream] = useState("payments");
  const [selectedItem, setSelectedItem] = useState(null);

  const { data: user } = useQuery({ queryKey: ["unified-ops-user"], queryFn: () => base44.auth.me(), staleTime: 60_000 });
  const { data: myHosts = [] } = useQuery({ queryKey: ["unified-ops-my-hosts", user?.email], queryFn: () => base44.entities.Host.filter({ email: user.email }), enabled: !!user?.email && user?.role !== "admin" });
  const roleScope = user?.role || "admin";
  const allowedHostIds = useMemo(() => new Set(myHosts.map(h => h.id)), [myHosts]);

  const paymentAlerts = useEntityList("PaymentOperationalAlert", "-created_date", 300);
  const operationalAlerts = useEntityList("OperationalAlert", "-created_date", 300);
  const notifications = useEntityList("Notification", "-created_date", 250);
  const activities = useEntityList("ActivityEvent", "-created_date", 350);
  const telematicsEvents = useEntityList("TelematicsEvent", "-created_date", 250);
  const commands = useEntityList("TelematicsCommand", "-created_date", 200);
  const threads = useEntityList("CommunicationThread", "-updated_date", 200);
  const dealerEvents = useEntityList("DealerNetworkEventLog", "-created_date", 150);
  const reputationEvents = useEntityList("ReputationEventLog", "-created_date", 150);
  const reviewQueue = useEntityList("ReviewModerationQueue", "-created_date", 150);
  const hostMaintenance = useEntityList("HostMaintenanceLog", "-created_date", 150);
  const bookings = useEntityList("BookingRequest", "-updated_date", 300);
  const compliance = useEntityList("HostVehicleCompliance", "-updated_date", 200);
  const disputes = useEntityList("Dispute", "-updated_date", 200);
  const installRecords = useEntityList("TelematicsInstallRecord", "-updated_date", 150);
  const hosts = useEntityList("Host", "-updated_date", 250);
  const vehicles = useEntityList("Vehicle", "-updated_date", 300);

  const loading = [paymentAlerts, operationalAlerts, notifications, activities, telematicsEvents, commands, threads, dealerEvents, reputationEvents, reviewQueue, hostMaintenance, bookings, compliance, disputes, installRecords, hosts, vehicles].some(q => q.isLoading);

  const unified = useMemo(() => buildOperationsData({
    paymentAlerts: paymentAlerts.data || [], operationalAlerts: operationalAlerts.data || [], notifications: notifications.data || [], activities: activities.data || [], telematicsEvents: telematicsEvents.data || [], commands: commands.data || [], threads: threads.data || [], dealerEvents: dealerEvents.data || [], reputationEvents: reputationEvents.data || [], reviewQueue: reviewQueue.data || [], hostMaintenance: hostMaintenance.data || [], bookings: bookings.data || [], compliance: compliance.data || [], disputes: disputes.data || [], installRecords: installRecords.data || [], hosts: hosts.data || [], vehicles: vehicles.data || [],
  }), [paymentAlerts.data, operationalAlerts.data, notifications.data, activities.data, telematicsEvents.data, commands.data, threads.data, dealerEvents.data, reputationEvents.data, reviewQueue.data, hostMaintenance.data, bookings.data, compliance.data, disputes.data, installRecords.data, hosts.data, vehicles.data]);

  const needsAction = applyFilters(unified.needsAction, filters, roleScope, allowedHostIds, user?.email);
  const visibleNotifications = applyFilters(unified.notifications, filters, roleScope, allowedHostIds, user?.email);
  const visibleEvents = applyFilters(unified.events, filters, roleScope, allowedHostIds, user?.email);
  const visibleAudit = applyFilters(unified.audit, filters, roleScope, allowedHostIds, user?.email);
  const streamItems = visibleEvents.filter(item => item.domain === activeStream);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["unified-ops"] });

  return (
    <div className="min-h-screen bg-background mesh-bg">
      <div className="border-b border-white/10 bg-slate-950/70 px-4 py-6 backdrop-blur-xl sm:px-6">
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-primary">Unified Command Center</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-syne text-3xl font-black text-white">Operations Center</h1>
            <p className="mt-1 max-w-3xl text-sm text-white/45">A single premium admin view for alerts, notifications, business events, exceptions, communication follow-up, and audit trails.</p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-white/50">Role scope: {roleScope}</div>
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        <UnifiedOpsSummaryCards needsAction={needsAction} notifications={visibleNotifications} events={visibleEvents} audit={visibleAudit} />
        <UnifiedOpsFilters filters={filters} setFilters={setFilters} hosts={hosts.data || []} vehicles={vehicles.data || []} />

        {loading && <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/45">Loading unified operations data…</div>}

        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <UnifiedOpsItemList title="Needs Action" subtitle="Highest-priority queue across payments, telematics, compliance, disputes, installs, fleet, hosts, and dealer operations." items={needsAction} variant="needs" onSelect={setSelectedItem} />
          <UnifiedOpsItemList title="Notifications" subtitle="User-facing informational delivery stream." items={visibleNotifications} variant="notifications" onSelect={setSelectedItem} limit={12} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <UnifiedOpsItemList title="Activity Timeline" subtitle="Business activity from ActivityEvent." items={visibleEvents} variant="events" onSelect={setSelectedItem} limit={18} />
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] overflow-hidden">
            <div className="border-b border-white/10 px-4 py-3">
              <p className="font-black text-white">Domain Event Streams</p>
              <p className="text-xs text-white/40">Filtered operational streams by business area.</p>
            </div>
            <div className="flex gap-1 overflow-x-auto border-b border-white/10 p-2 no-scrollbar">
              {STREAM_TABS.map(tab => <button key={tab} onClick={() => setActiveStream(tab)} className={`rounded-xl px-3 py-2 text-xs font-bold capitalize whitespace-nowrap ${activeStream === tab ? "gradient-primary text-white" : "text-white/45 hover:bg-white/10"}`}>{tab.replace(/_/g, " ")}</button>)}
            </div>
            <UnifiedOpsItemList title={`${activeStream.replace(/_/g, " ")} stream`} items={streamItems} variant="events" onSelect={setSelectedItem} limit={14} />
          </div>
        </div>

        <UnifiedOpsItemList title="Audit Trail" subtitle="Admin, system, automation, and webhook activity only." items={visibleAudit} variant="audit" onSelect={setSelectedItem} limit={25} />
      </div>

      <UnifiedOpsDrawer item={selectedItem} onClose={() => setSelectedItem(null)} onChanged={invalidate} />
    </div>
  );
}