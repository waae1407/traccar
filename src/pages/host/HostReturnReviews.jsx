import { uploadFile } from "@/utils/uploadFile";
import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Clock, ShieldAlert, CheckCircle2, Camera, Upload } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { OperationalPageShell, OperationalHero, OperationalKpiGrid, OperationalFilterBar, OperationalDataSection, OperationalDetailDrawer, OperationalEmptyState, OperationalMobileToolbar } from "@/components/operational";

const DISPUTE_CATEGORIES = ["new_damage", "excessive_dirt", "smoke_odor", "missing_key_item", "low_fuel_battery", "mileage_issue", "wrong_return_location", "unsafe_condition", "other"];
const SLOT_LABELS = { interior_front: "Interior Front", interior_rear: "Interior Rear", exterior_front_left: "Front Left", exterior_rear_left: "Rear Left", exterior_front_right: "Front Right", exterior_rear_right: "Rear Right", vehicle_keys: "Vehicle Keys" };

export default function HostReturnReviews() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ search: "" });
  const [selected, setSelected] = useState(null);
  const [disputeForm, setDisputeForm] = useState({ photo: null, category: "new_damage", notes: "", evidence: [] });

  const { data: hosts = [] } = useQuery({ queryKey: ["host-return-profile", user?.email], queryFn: () => base44.entities.Host.filter({ email: user.email }), enabled: !!user?.email });
  const host = hosts[0];

  const { data: packets = [], isLoading } = useQuery({
    queryKey: ["host-return-packets", host?.id],
    queryFn: () => base44.entities.InspectionEvidencePacket.filter({ host_id: host.id, inspection_type: "dropoff" }, "-created_date", 200),
    enabled: !!host?.id,
  });

  const { data: bookings = [] } = useQuery({ queryKey: ["host-return-bookings", host?.id], queryFn: () => base44.entities.BookingRequest.filter({ host_id: host.id }, "-created_date", 300), enabled: !!host?.id });
  const { data: photos = [] } = useQuery({ queryKey: ["host-return-photos", selected?.id], queryFn: () => base44.entities.InspectionEvidencePhoto.filter({ packet_id: selected.id }, "created_date", 100), enabled: !!selected?.id });

  const bookingMap = Object.fromEntries(bookings.map((b) => [b.id, b]));
  const rows = useMemo(() => packets.filter((p) => {
    const booking = bookingMap[p.booking_request_id];
    const q = filters.search.toLowerCase();
    return !q || `${booking?.vehicle_name || ""} ${booking?.customer_full_name || ""} ${booking?.user_email || ""}`.toLowerCase().includes(q);
  }), [packets, bookingMap, filters.search]);

  const acceptMutation = useMutation({ mutationFn: (id) => base44.functions.invoke("acceptReturnReview", { booking_request_id: id }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["host-return-packets"] }); qc.invalidateQueries({ queryKey: ["host-return-bookings"] }); setSelected(null); } });
  const disputeMutation = useMutation({ mutationFn: (payload) => base44.functions.invoke("openReturnDispute", payload), onSuccess: () => { qc.invalidateQueries({ queryKey: ["host-return-packets"] }); qc.invalidateQueries({ queryKey: ["host-return-bookings"] }); setSelected(null); setDisputeForm({ photo: null, category: "new_damage", notes: "", evidence: [] }); } });

  const uploadEvidence = async (file) => {
    const { file_url } = await uploadFile(file);
    setDisputeForm((prev) => ({ ...prev, evidence: [...prev.evidence, file_url] }));
  };

  const selectedBooking = selected ? bookingMap[selected.booking_request_id] : null;
  const windowOpen = selected && !selected.dispute_window_closed_at && (!selected.dispute_window_expires_at || new Date(selected.dispute_window_expires_at) > new Date()) && selectedBooking?.booking_status !== "completed";

  return (
    <OperationalPageShell mode="host">
      <OperationalHero mode="host" eyebrow="Return Review" title="Return Reviews" subtitle="Accept clean returns or open photo-specific disputes during the 24-hour review window." />
      <OperationalKpiGrid mode="host" metrics={[
        { label: "Pending Review", value: packets.filter((p) => p.evidence_status === "locked" && !p.dispute_window_closed_at).length, icon: Clock, variant: "warning" },
        { label: "Disputed", value: packets.filter((p) => p.evidence_status === "disputed").length, icon: ShieldAlert, variant: "danger" },
        { label: "Accepted", value: packets.filter((p) => ["accepted", "auto_accepted"].includes(p.evidence_status)).length, icon: CheckCircle2, variant: "success" },
        { label: "Evidence Packets", value: packets.length, icon: Camera, variant: "info" },
      ]} />
      <OperationalFilterBar mode="host" filters={filters} onChange={setFilters} placeholder="Search vehicle or renter" resultCount={rows.length} totalCount={packets.length} />
      <OperationalDataSection mode="host" title="Return evidence" loading={isLoading} empty={rows.length === 0} emptyIcon={Camera} emptyTitle="No return reviews" emptyDescription="Drop-off evidence will appear here after renters return vehicles.">
        <div className="divide-y divide-gray-100">
          {rows.map((packet) => {
            const booking = bookingMap[packet.booking_request_id];
            const expires = packet.dispute_window_expires_at ? formatDistanceToNow(new Date(packet.dispute_window_expires_at), { addSuffix: true }) : "No timer";
            return (
              <button key={packet.id} onClick={() => setSelected(packet)} className="w-full text-left p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-sm font-bold text-gray-900">{booking?.vehicle_name || "Vehicle return"}</p><p className="text-xs text-gray-400">{booking?.customer_full_name || booking?.user_email || "Renter"} · {packet.evidence_status}</p></div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">Window {expires}</span>
                </div>
              </button>
            );
          })}
        </div>
      </OperationalDataSection>
      <OperationalMobileToolbar mode="host"><button className="px-3 py-2 rounded-xl bg-white border text-xs font-bold">{rows.length} returns</button></OperationalMobileToolbar>

      <OperationalDetailDrawer mode="host" open={!!selected} onClose={() => setSelected(null)} title={selectedBooking?.vehicle_name || "Return evidence"} subtitle={selected?.evidence_status}>
        {selected && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-500">Evidence is locked after renter submission. Host dispute rights close after 24 hours, acceptance, or vehicle availability.</div>
            <div className="grid grid-cols-2 gap-2">{photos.map((photo) => <button key={photo.id} onClick={() => setDisputeForm((p) => ({ ...p, photo }))} className={`rounded-2xl overflow-hidden border text-left ${disputeForm.photo?.id === photo.id ? "border-pink-400 ring-2 ring-pink-100" : "border-gray-100"}`}><img src={photo.photo_url} alt="" className="h-28 w-full object-cover" /><p className="p-2 text-[10px] font-bold text-gray-600">{SLOT_LABELS[photo.photo_slot] || photo.photo_slot}</p></button>)}</div>
            {windowOpen ? <div className="space-y-3 border-t pt-4">
              <button disabled={acceptMutation.isPending} onClick={() => acceptMutation.mutate(selected.booking_request_id)} className="w-full py-3 rounded-2xl text-sm font-black text-white bg-emerald-500">Accept Return</button>
              <select value={disputeForm.category} onChange={(e) => setDisputeForm({ ...disputeForm, category: e.target.value })} className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm">{DISPUTE_CATEGORIES.map((c) => <option key={c} value={c}>{c.replaceAll("_", " ")}</option>)}</select>
              <textarea value={disputeForm.notes} onChange={(e) => setDisputeForm({ ...disputeForm, notes: e.target.value })} placeholder="Optional notes tied to this photo/area" className="w-full min-h-20 rounded-xl border border-gray-200 p-3 text-sm" />
              <label className="flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-gray-300 text-xs font-bold text-gray-500"><Upload className="h-4 w-4" /> Upload dispute photo<input type="file" capture="environment" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadEvidence(file); }} /></label>
              {disputeForm.evidence.length > 0 && <p className="text-xs text-emerald-600 font-bold">{disputeForm.evidence.length} host evidence photo(s) added</p>}
              <button disabled={!disputeForm.photo || disputeForm.evidence.length === 0 || disputeMutation.isPending} onClick={() => disputeMutation.mutate({ booking_request_id: selected.booking_request_id, packet_id: selected.id, photo_id: disputeForm.photo.id, photo_slot: disputeForm.photo.photo_slot, dispute_category: disputeForm.category, host_evidence_urls: disputeForm.evidence, notes: disputeForm.notes })} className="w-full py-3 rounded-2xl text-sm font-black text-white bg-red-500 disabled:opacity-40">Open Photo-Specific Dispute</button>
            </div> : <OperationalEmptyState mode="host" icon={CheckCircle2} title="Dispute window closed" description="Late host disputes are blocked unless an admin override applies." />}
          </div>
        )}
      </OperationalDetailDrawer>
    </OperationalPageShell>
  );
}