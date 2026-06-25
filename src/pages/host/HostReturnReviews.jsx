import { uploadFile } from "@/utils/uploadFile";
import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Clock, ShieldAlert, CheckCircle2, Camera, Upload, Ban, AlertTriangle, MapPin, Ruler } from "lucide-react";
import { formatDistanceToNow, format, isValid } from "date-fns";
import { OperationalPageShell, OperationalHero, OperationalKpiGrid, OperationalFilterBar, OperationalDataSection, OperationalDetailDrawer, OperationalEmptyState, OperationalMobileToolbar } from "@/components/operational";

const DISPUTE_CATEGORIES = ["new_damage", "excessive_dirt", "smoke_odor", "missing_key_item", "low_fuel_battery", "mileage_issue", "wrong_return_location", "unsafe_condition", "other"];
const SLOT_LABELS = { interior_front: "Interior Front", interior_rear: "Interior Rear", exterior_front_left: "Front Left", exterior_rear_left: "Rear Left", exterior_front_right: "Front Right", exterior_rear_right: "Rear Right", vehicle_keys: "Vehicle Keys" };

function safeFmt(str, fmt = "MMM d, yyyy · h:mm a") {
  if (!str) return null;
  const d = new Date(str);
  return isValid(d) ? format(d, fmt) : str;
}

function LifecycleRow({ label, value }) {
  if (!value && value !== 0 && value !== false) return null;
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : typeof value === "string" ? value.replace(/_/g, " ") : String(value);
  return (
    <div className="flex justify-between text-xs py-1.5 gap-2">
      <span className="text-gray-400 whitespace-nowrap">{label}</span>
      <span className="text-gray-700 font-medium text-right">{display}</span>
    </div>
  );
}

function PacketCard({ packet, booking, onClick }) {
  const expires = packet.dispute_window_expires_at ? formatDistanceToNow(new Date(packet.dispute_window_expires_at), { addSuffix: true }) : "No timer";
  return (
    <button onClick={onClick} className="w-full text-left p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-gray-900">{booking?.vehicle_name || "Vehicle return"}</p>
          <p className="text-xs text-gray-400">{booking?.customer_full_name || booking?.user_email || "Renter"}</p>
          {booking?.return_completed_at && <p className="text-xs text-gray-400 mt-0.5">Returned: {safeFmt(booking.return_completed_at)}</p>}
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100 whitespace-nowrap">{expires}</span>
      </div>
    </button>
  );
}

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

  // Separate into lifecycle sections
  const sections = useMemo(() => {
    const q = filters.search.toLowerCase();
    const filtered = packets.filter((p) => {
      const booking = bookingMap[p.booking_request_id];
      return !q || `${booking?.vehicle_name || ""} ${booking?.customer_full_name || ""} ${booking?.user_email || ""}`.toLowerCase().includes(q);
    });

    const pending = [];
    const completed = [];
    const autoCompleted = [];
    const disputed = [];
    const voided = [];

    filtered.forEach((p) => {
      const b = bookingMap[p.booking_request_id];
      const isVoided = b?.is_superseded || b?.booking_status === "cancelled" || b?.booking_status === "superseded_invalid";
      const isDisputed = p.evidence_status === "disputed" || b?.damage_dispute_status === "open";
      const isAuto = p.evidence_status === "auto_accepted" || b?.completion_reason === "host_review_window_expired" || b?.completion_reason === "auto_completed";
      const isAccepted = p.evidence_status === "accepted" || b?.host_review_status === "approved" || b?.host_review_status === "auto_completed";
      const isPending = p.evidence_status === "locked" && !p.dispute_window_closed_at && b?.booking_status !== "completed" && !isAccepted;

      if (isVoided) voided.push(p);
      else if (isDisputed) disputed.push(p);
      else if (isAuto) autoCompleted.push(p);
      else if (isAccepted) completed.push(p);
      else pending.push(p);
    });

    return { pending, completed, autoCompleted, disputed, voided };
  }, [packets, bookingMap, filters.search]);

  const totalCount = sections.pending.length + sections.completed.length + sections.autoCompleted.length + sections.disputed.length + sections.voided.length;

  const acceptMutation = useMutation({ mutationFn: (id) => base44.functions.invoke("acceptReturnReview", { booking_request_id: id }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["host-return-packets"] }); qc.invalidateQueries({ queryKey: ["host-return-bookings"] }); setSelected(null); } });
  const disputeMutation = useMutation({ mutationFn: (payload) => base44.functions.invoke("openReturnDispute", payload), onSuccess: () => { qc.invalidateQueries({ queryKey: ["host-return-packets"] }); qc.invalidateQueries({ queryKey: ["host-return-bookings"] }); setSelected(null); setDisputeForm({ photo: null, category: "new_damage", notes: "", evidence: [] }); } });

  const uploadEvidence = async (file) => {
    const { file_url } = await uploadFile(file);
    setDisputeForm((prev) => ({ ...prev, evidence: [...prev.evidence, file_url] }));
  };

  const selectedBooking = selected ? bookingMap[selected.booking_request_id] : null;
  const windowOpen = selected && !selected.dispute_window_closed_at && (!selected.dispute_window_expires_at || new Date(selected.dispute_window_expires_at) > new Date()) && selectedBooking?.booking_status !== "completed";

  function SectionShell({ title, icon: Icon, variant, items, children }) {
    if (!items.length) return null;
    const colors = {
      warning: "border-amber-200 bg-amber-50/50",
      success: "border-emerald-200 bg-emerald-50/50",
      auto: "border-blue-200 bg-blue-50/50",
      danger: "border-red-200 bg-red-50/50",
      void: "border-gray-200 bg-gray-50/50",
    };
    return (
      <div className={`rounded-2xl border ${colors[variant] || ""} overflow-hidden`}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <Icon className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          <span className="text-xs text-gray-400 font-medium">({items.length})</span>
        </div>
        <div className="divide-y divide-gray-100">{children}</div>
      </div>
    );
  }

  return (
    <OperationalPageShell mode="host">
      <OperationalHero mode="host" eyebrow="Return Review" title="Return Reviews" subtitle="Accept clean returns or open photo-specific disputes during the 24-hour review window." />
      <OperationalKpiGrid mode="host" metrics={[
        { label: "Pending Review", value: sections.pending.length, icon: Clock, variant: "warning" },
        { label: "Disputed", value: sections.disputed.length, icon: ShieldAlert, variant: "danger" },
        { label: "Completed", value: sections.completed.length, icon: CheckCircle2, variant: "success" },
        { label: "Auto-Completed", value: sections.autoCompleted.length, icon: CheckCircle2, variant: "info" },
      ]} />
      <OperationalFilterBar mode="host" filters={filters} onChange={setFilters} placeholder="Search vehicle or renter" resultCount={totalCount} totalCount={packets.length} />

      <div className="space-y-4">
        <SectionShell title="Pending Review" icon={Clock} variant="warning" items={sections.pending}>
          {sections.pending.map((packet) => <PacketCard key={packet.id} packet={packet} booking={bookingMap[packet.booking_request_id]} onClick={() => setSelected(packet)} />)}
        </SectionShell>

        <SectionShell title="Completed" icon={CheckCircle2} variant="success" items={sections.completed}>
          {sections.completed.map((packet) => <PacketCard key={packet.id} packet={packet} booking={bookingMap[packet.booking_request_id]} onClick={() => setSelected(packet)} />)}
        </SectionShell>

        <SectionShell title="Auto-Completed" icon={CheckCircle2} variant="auto" items={sections.autoCompleted}>
          {sections.autoCompleted.map((packet) => <PacketCard key={packet.id} packet={packet} booking={bookingMap[packet.booking_request_id]} onClick={() => setSelected(packet)} />)}
        </SectionShell>

        <SectionShell title="Disputed" icon={ShieldAlert} variant="danger" items={sections.disputed}>
          {sections.disputed.map((packet) => <PacketCard key={packet.id} packet={packet} booking={bookingMap[packet.booking_request_id]} onClick={() => setSelected(packet)} />)}
        </SectionShell>

        <SectionShell title="Voided / Superseded" icon={Ban} variant="void" items={sections.voided}>
          {sections.voided.map((packet) => <PacketCard key={packet.id} packet={packet} booking={bookingMap[packet.booking_request_id]} onClick={() => setSelected(packet)} />)}
        </SectionShell>

        {isLoading && <OperationalDataSection mode="host" title="Loading..." loading={true} empty={false} emptyIcon={Camera} />}
        {!isLoading && totalCount === 0 && (
          <OperationalDataSection mode="host" title="Return evidence" loading={false} empty={true} emptyIcon={Camera} emptyTitle="No return reviews" emptyDescription="Drop-off evidence will appear here after renters return vehicles." />
        )}
      </div>

      <OperationalMobileToolbar mode="host"><button className="px-3 py-2 rounded-xl bg-white border text-xs font-bold">{totalCount} returns</button></OperationalMobileToolbar>

      <OperationalDetailDrawer mode="host" open={!!selected} onClose={() => setSelected(null)} title={selectedBooking?.vehicle_name || "Return evidence"} subtitle={selected?.evidence_status}>
        {selected && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-500">Evidence is locked after renter submission. Host dispute rights close after 24 hours, acceptance, or vehicle availability.</div>

            {/* Lifecycle details for selected return */}
            {selectedBooking && (
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 space-y-0.5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Rental Lifecycle</p>
                <LifecycleRow label="Phase" value={selectedBooking.rental_lifecycle_phase} />
                <LifecycleRow label="Return Completed At" value={safeFmt(selectedBooking.return_completed_at)} />
                <LifecycleRow label="Host Review Due At" value={safeFmt(selectedBooking.host_review_due_at)} />
                <LifecycleRow label="Host Review Status" value={selectedBooking.host_review_status} />
                <LifecycleRow label="Auto-Completed At" value={safeFmt(selectedBooking.auto_completed_at)} />
                <LifecycleRow label="Completion Reason" value={selectedBooking.completion_reason} />
                <LifecycleRow label="Billing Stopped At" value={safeFmt(selectedBooking.billing_stopped_at)} />
                <LifecycleRow label="Billing Stop Reason" value={selectedBooking.billing_stop_reason} />
                <LifecycleRow label="Dispute Deadline At" value={safeFmt(selectedBooking.damage_dispute_deadline_at)} />
                <LifecycleRow label="Dispute Allowed After Auto-Complete" value={selectedBooking.damage_dispute_allowed_after_auto_complete} />
                <LifecycleRow label="Dispute Status" value={selectedBooking.damage_dispute_status} />
                {selectedBooking.vehicle_moved_after_return_at && (
                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-200">
                    <MapPin className="h-3 w-3 text-amber-500" />
                    <span className="text-xs text-amber-700 font-medium">Vehicle moved after return: {safeFmt(selectedBooking.vehicle_moved_after_return_at, "MMM d, h:mm a")}</span>
                  </div>
                )}
                {selectedBooking.vehicle_distance_from_return_miles != null && (
                  <div className="flex items-center gap-1.5">
                    <Ruler className="h-3 w-3 text-gray-400" />
                    <span className="text-xs text-gray-500">Distance from return point: {selectedBooking.vehicle_distance_from_return_miles?.toFixed(1)} mi</span>
                  </div>
                )}
              </div>
            )}

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