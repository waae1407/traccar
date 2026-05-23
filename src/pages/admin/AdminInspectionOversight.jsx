import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Camera, Clock, ShieldAlert, CheckCircle2, MapPin, Lock } from "lucide-react";
import { OperationalPageShell, OperationalHero, OperationalKpiGrid, OperationalFilterBar, OperationalAdvancedFilters, OperationalExportToolbar, OperationalDataSection, OperationalDetailDrawer, OperationalPagination, OperationalMobileToolbar, OperationalEmptyState } from "@/components/operational";

const OVERRIDE_REASONS = ["fraud", "hidden_severe_damage", "stolen_vehicle", "insurance_claim", "gps_evidence_conflict", "legal_safety_issue"];

export default function AdminInspectionOversight() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ search: "", status: "" });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);
  const [override, setOverride] = useState({ reason: "fraud", notes: "" });
  const pageSize = 25;

  const { data: packets = [], isLoading } = useQuery({ queryKey: ["admin-inspection-packets"], queryFn: () => base44.entities.InspectionEvidencePacket.list("-created_date", 500) });
  const { data: bookings = [] } = useQuery({ queryKey: ["admin-inspection-bookings"], queryFn: () => base44.entities.BookingRequest.list("-created_date", 500) });
  const { data: photos = [] } = useQuery({ queryKey: ["admin-inspection-photos", selected?.id], queryFn: () => base44.entities.InspectionEvidencePhoto.filter({ packet_id: selected.id }, "created_date", 100), enabled: !!selected?.id });

  const bookingMap = Object.fromEntries(bookings.map((b) => [b.id, b]));
  const rows = useMemo(() => packets.filter((p) => {
    const b = bookingMap[p.booking_request_id];
    const q = filters.search.toLowerCase();
    const statusOk = !filters.status || p.evidence_status === filters.status;
    return statusOk && (!q || `${b?.vehicle_name || ""} ${b?.customer_full_name || ""} ${b?.user_email || ""} ${p.gps_tolerance_status || ""}`.toLowerCase().includes(q));
  }), [packets, bookingMap, filters]);
  const paged = rows.slice(page * pageSize, page * pageSize + pageSize);

  const overrideMutation = useMutation({ mutationFn: () => base44.functions.invoke("adminOverrideReturnEvidence", { packet_id: selected.id, override_reason: override.reason, notes: override.notes }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-inspection-packets"] }); setSelected(null); } });

  const exportRows = () => {
    const csv = ["booking,vehicle,status,type,gps,evidence_confidence,window_expires", ...rows.map((p) => `${p.booking_request_id},${bookingMap[p.booking_request_id]?.vehicle_name || ""},${p.evidence_status},${p.inspection_type},${p.gps_tolerance_status},${p.evidence_confidence},${p.dispute_window_expires_at || ""}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "inspection-oversight.csv"; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <OperationalPageShell mode="admin">
      <OperationalHero mode="admin" eyebrow="Operational Governance" title="Inspection & Return Oversight" subtitle="Evidence packets, return review windows, GPS tolerance, photo-specific disputes, and admin override visibility." />
      <OperationalKpiGrid mode="admin" metrics={[
        { label: "Return Pending", value: packets.filter((p) => p.inspection_type === "dropoff" && p.evidence_status === "locked" && !p.dispute_window_closed_at).length, icon: Clock, variant: "warning" },
        { label: "Disputed", value: packets.filter((p) => p.evidence_status === "disputed").length, icon: ShieldAlert, variant: "danger" },
        { label: "Auto Accepted", value: packets.filter((p) => p.evidence_status === "auto_accepted").length, icon: CheckCircle2, variant: "success" },
        { label: "GPS Outside 5mi", value: packets.filter((p) => p.gps_tolerance_status === "outside_5_miles").length, icon: MapPin, variant: "primary" },
      ]} />
      <OperationalFilterBar mode="admin" filters={filters} onChange={setFilters} placeholder="Search booking, vehicle, renter, GPS status" statuses={["draft", "submitted", "locked", "disputed", "accepted", "auto_accepted"]} resultCount={rows.length} totalCount={packets.length} />
      <OperationalAdvancedFilters mode="admin" filters={filters} onChange={setFilters} fields={[{ key: "type", label: "type", options: ["pickup", "dropoff", "host_dispute"] }]} />
      <OperationalExportToolbar mode="admin" exports={[{ label: "Export CSV", onClick: exportRows }]} />
      <OperationalDataSection mode="admin" title="Evidence packets" loading={isLoading} empty={rows.length === 0} emptyIcon={Camera} emptyTitle="No evidence packets" bodyClassName="divide-y divide-white/[0.06]">
        {paged.map((p) => {
          const b = bookingMap[p.booking_request_id];
          return <button key={p.id} onClick={() => setSelected(p)} className="w-full text-left p-4 hover:bg-white/[0.04]"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-white">{b?.vehicle_name || p.vehicle_id}</p><p className="text-xs text-white/35">{p.inspection_type} · {p.evidence_status} · {b?.customer_full_name || b?.user_email || "renter"}</p></div><span className="text-[10px] font-bold px-2 py-1 rounded-full border border-white/[0.08] text-white/50">GPS: {p.gps_tolerance_status}</span></div></button>;
        })}
      </OperationalDataSection>
      <OperationalPagination mode="admin" page={page} pageSize={pageSize} total={rows.length} onPageChange={setPage} />
      <OperationalMobileToolbar mode="admin"><button className="px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.1] text-xs font-bold text-white">{rows.length} packets</button></OperationalMobileToolbar>

      <OperationalDetailDrawer mode="admin" open={!!selected} onClose={() => setSelected(null)} title={bookingMap[selected?.booking_request_id]?.vehicle_name || "Evidence packet"} subtitle={selected?.evidence_status}>
        {selected && <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-xs">{[
            ["Type", selected.inspection_type], ["GPS", selected.gps_tolerance_status], ["Confidence", selected.evidence_confidence], ["Photo slots", selected.required_photo_slots_completed], ["Additional", selected.additional_photo_count], ["Lock", selected.lock_reason || "—"]
          ].map(([k, v]) => <div key={k} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3"><p className="text-white/35 uppercase text-[10px] font-bold">{k}</p><p className="text-white font-semibold mt-1">{v}</p></div>)}</div>
          <div className="grid grid-cols-2 gap-2">{photos.map((photo) => <a key={photo.id} href={photo.photo_url} target="_blank" rel="noreferrer" className="rounded-2xl overflow-hidden border border-white/[0.08]"><img src={photo.photo_url} alt="" className="h-28 w-full object-cover" /><p className="p-2 text-[10px] text-white/50 font-bold">{photo.photo_slot} · {photo.dispute_status}</p></a>)}</div>
          <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3"><p className="text-xs font-bold text-primary mb-1">Trust attribution preview</p><pre className="text-[10px] text-white/60 whitespace-pre-wrap">{JSON.stringify(selected.trust_attribution_preview || {}, null, 2)}</pre></div>
          <div className="border-t border-white/[0.08] pt-4 space-y-2"><p className="text-xs font-bold text-white/50 flex items-center gap-2"><Lock className="h-3.5 w-3.5" /> Admin override</p><select value={override.reason} onChange={(e) => setOverride({ ...override, reason: e.target.value })} className="w-full h-10 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white px-3 text-sm">{OVERRIDE_REASONS.map((r) => <option key={r} value={r}>{r.replaceAll("_", " ")}</option>)}</select><textarea value={override.notes} onChange={(e) => setOverride({ ...override, notes: e.target.value })} placeholder="Required governance note" className="w-full min-h-20 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white p-3 text-sm" /><button disabled={!override.notes.trim() || overrideMutation.isPending} onClick={() => overrideMutation.mutate()} className="w-full py-3 rounded-2xl bg-primary text-white text-sm font-black disabled:opacity-40">Reopen with Admin Override</button></div>
        </div>}
      </OperationalDetailDrawer>
    </OperationalPageShell>
  );
}