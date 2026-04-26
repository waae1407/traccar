import React, { useState } from "react";
import { Camera, CheckCircle2, XCircle, RotateCcw, MapPin, Clock } from "lucide-react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const SLOT_LABELS = [
  "Interior Front", "Interior Rear",
  "Front Left", "Rear Left",
  "Front Right", "Rear Right",
  "Keys",
];

function PhotoGrid({ photos, labels, title, emptyText }) {
  const [lightbox, setLightbox] = useState(null);

  if (!photos?.length) {
    return (
      <div className="rounded-xl border border-white/[0.06] p-4 text-center">
        <p className="text-xs text-white/30">{emptyText}</p>
      </div>
    );
  }

  return (
    <div>
      {lightbox !== null && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center" onClick={() => setLightbox(null)}>
          <img src={photos[lightbox]} alt="" className="max-w-full max-h-full object-contain rounded-xl" />
          <div className="absolute bottom-6 left-0 right-0 text-center">
            <span className="text-white/60 text-xs">{labels?.[lightbox] || `Photo ${lightbox + 1}`} · Tap to close</span>
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {photos.map((url, i) => (
          <button key={i} onClick={() => setLightbox(i)} className="relative rounded-xl overflow-hidden aspect-square group">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all" />
            <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 text-[9px] font-bold text-white"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }}>
              {labels?.[i] || `Photo ${i + 1}`}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MetaBadge({ icon: IconComp, value, label }) {
  const Icon = IconComp;
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
      <Icon className="h-3.5 w-3.5 text-primary/70 flex-shrink-0" />
      <div>
        <p className="text-[10px] text-white/30 uppercase tracking-wider">{label}</p>
        <p className="text-xs font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}

export default function InspectionGallery({ booking, onUpdate }) {
  const queryClient = useQueryClient();
  const [cleanNotes, setCleanNotes] = useState(booking?.clean_return_admin_notes || "");
  const [endingRental, setEndingRental] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.BookingRequest.update(booking.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-requests-admin"] });
      onUpdate?.();
      toast.success("Updated successfully");
    },
  });

  const handleEndRental = async () => {
    if (!confirm(`End rental for ${booking.customer_full_name}? This will mark the booking as completed, stop billing, and set the vehicle to Out of Service pending admin inspection.`)) return;
    setEndingRental(true);
    try {
      await updateMutation.mutateAsync({
        booking_status: "completed",
        rental_ended_at: new Date().toISOString(),
        rental_ended_by: "admin",
        autopay_enabled: false,
      });
      // Set vehicle to Out of Service (requires admin to manually clear to Available)
      if (booking.vehicle_id) {
        await base44.entities.Vehicle.update(booking.vehicle_id, { status: "Out of Service" });
      }
      await base44.entities.Notification.create({
        user_email: booking.user_email,
        title: "Rental Ended",
        body: `Your rental for ${booking.vehicle_name} has been ended by our team. Thank you for renting with uRide!`,
        type: "booking",
        booking_request_id: booking.id,
      });
      toast.success("Rental ended. Vehicle set to Out of Service — check fleet to clear it.");
    } finally {
      setEndingRental(false);
    }
  };

  const pickupDone = booking?.pickup_photos?.length > 0;
  const dropoffDone = booking?.return_exterior_photos?.length > 0;

  return (
    <div className="space-y-5">
      {/* End Rental — admin action */}
      {["approved", "confirmed", "active"].includes(booking?.booking_status) && (
        <div className="p-4 rounded-2xl border border-red-500/20" style={{ background: "hsl(0 72% 58% / 0.06)" }}>
          <p className="text-sm font-bold text-red-300 mb-1">⛔ Admin: End Rental</p>
          <p className="text-xs text-white/40 mb-3">
            Marks as completed, stops billing, sets vehicle to Out of Service. Admin must manually clear the vehicle to Available after physical inspection.
          </p>
          <button
            onClick={handleEndRental}
            disabled={endingRental || updateMutation.isPending}
            className="w-full py-2.5 rounded-xl font-bold text-sm text-white bg-red-500 hover:bg-red-600 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
          >
            {endingRental ? "Ending…" : "End Rental Now"}
          </button>
        </div>
      )}

      {/* Inspection Status Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`flex items-center gap-2 p-3 rounded-xl border ${pickupDone ? "border-green-500/25 bg-green-500/[0.06]" : "border-white/[0.06] bg-white/[0.03]"}`}>
          {pickupDone
            ? <CheckCircle2 className="h-4 w-4 text-green-400" />
            : <XCircle className="h-4 w-4 text-white/20" />}
          <div>
            <p className="text-xs font-bold text-white">{pickupDone ? "Pickup ✓" : "Pickup Pending"}</p>
            {booking?.pickup_submitted_at && (
              <p className="text-[10px] text-white/35">{format(new Date(booking.pickup_submitted_at), "MMM d, h:mm a")}</p>
            )}
          </div>
        </div>
        <div className={`flex items-center gap-2 p-3 rounded-xl border ${dropoffDone ? "border-green-500/25 bg-green-500/[0.06]" : "border-white/[0.06] bg-white/[0.03]"}`}>
          {dropoffDone
            ? <CheckCircle2 className="h-4 w-4 text-green-400" />
            : <XCircle className="h-4 w-4 text-white/20" />}
          <div>
            <p className="text-xs font-bold text-white">{dropoffDone ? "Drop-off ✓" : "Drop-off Pending"}</p>
            {booking?.dropoff_submitted_at && (
              <p className="text-[10px] text-white/35">{format(new Date(booking.dropoff_submitted_at), "MMM d, h:mm a")}</p>
            )}
          </div>
        </div>
      </div>

      {/* Pickup Photos */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-1.5">
            <Camera className="h-3.5 w-3.5" /> Pickup Photos ({booking?.pickup_photos?.length || 0})
          </p>
          {pickupDone && (
            <button
              onClick={() => {
                if (!confirm("Clear pickup photos? Customer will need to redo the inspection.")) return;
                updateMutation.mutate({ pickup_photos: [], pickup_submitted_at: null, pickup_location_label: null });
              }}
              className="flex items-center gap-1 text-[10px] font-bold text-orange-400 border border-orange-500/20 px-2 py-1 rounded-lg hover:bg-orange-500/[0.08]"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          )}
        </div>

        {/* Pickup metadata — immutable */}
        {pickupDone && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <MetaBadge icon={Clock} label="Submitted at" value={booking.pickup_submitted_at ? format(new Date(booking.pickup_submitted_at), "MMM d, yyyy h:mm a") : null} />
            <MetaBadge icon={MapPin} label="Location" value={booking.pickup_location_label || (booking.pickup_location_lat ? `${booking.pickup_location_lat?.toFixed(4)}, ${booking.pickup_location_lon?.toFixed(4)}` : null)} />
          </div>
        )}

        <PhotoGrid photos={booking?.pickup_photos} labels={SLOT_LABELS} emptyText="No pickup photos submitted yet" />
      </div>

      {/* Drop-off Photos */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-1.5">
            <Camera className="h-3.5 w-3.5" /> Drop-off Photos ({booking?.return_exterior_photos?.length || 0})
          </p>
        </div>

        {/* Drop-off metadata — immutable */}
        {dropoffDone && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <MetaBadge icon={Clock} label="Submitted at" value={booking.dropoff_submitted_at ? format(new Date(booking.dropoff_submitted_at), "MMM d, yyyy h:mm a") : null} />
            <MetaBadge icon={MapPin} label="Location" value={booking.dropoff_location_label || (booking.dropoff_location_lat ? `${booking.dropoff_location_lat?.toFixed(4)}, ${booking.dropoff_location_lon?.toFixed(4)}` : null)} />
          </div>
        )}

        <PhotoGrid photos={booking?.return_exterior_photos} labels={SLOT_LABELS} emptyText="No drop-off photos submitted yet" />

        {/* Clean return review */}
        {dropoffDone && booking?.clean_return_status === "photos_submitted" && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-bold text-white/50 uppercase tracking-wider">Clean Return Review</p>
            <textarea
              value={cleanNotes}
              onChange={(e) => setCleanNotes(e.target.value)}
              placeholder="Notes on vehicle condition…"
              rows={2}
              className="w-full px-3 py-2 rounded-xl text-xs bg-white/[0.05] border border-white/[0.1] text-white placeholder:text-white/20 focus:outline-none resize-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => updateMutation.mutate({ clean_return_status: "approved_clean", clean_return_credit_issued: true, clean_return_admin_notes: cleanNotes })}
                disabled={updateMutation.isPending}
                className="py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5"
                style={{ background: "linear-gradient(135deg, hsl(152 60% 46%), hsl(199 90% 54%))" }}
              >
                ✓ Approve — Issue $50
              </button>
              <button
                onClick={() => updateMutation.mutate({ clean_return_status: "not_clean", clean_return_admin_notes: cleanNotes })}
                disabled={updateMutation.isPending}
                className="py-2 rounded-xl text-xs font-bold text-red-400 border border-red-500/20 hover:bg-red-500/[0.08]"
              >
                ✗ Not Clean
              </button>
            </div>
          </div>
        )}

        {dropoffDone && booking?.clean_return_status === "approved_clean" && (
          <div className="mt-2 flex items-center gap-2 p-2 rounded-xl bg-green-500/[0.08] border border-green-500/20">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            <p className="text-xs text-green-300 font-semibold">Clean return approved — $50 credit issued</p>
          </div>
        )}
      </div>

      {/* Rental end info */}
      {booking?.rental_ended_at && (
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Rental Ended</p>
          <p className="text-xs text-white/60">{format(new Date(booking.rental_ended_at), "MMM d, yyyy h:mm a")} · by {booking.rental_ended_by || "—"}</p>
        </div>
      )}
    </div>
  );
}