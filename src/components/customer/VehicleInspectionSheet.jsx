import React, { useState, useRef } from "react";
import { X, Camera, CheckCircle, Upload, Loader2, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// 6 mandatory inspection shots with diagram reference images (Unsplash stock angles)
const PHOTO_SLOTS = [
  {
    id: "interior_front",
    label: "Interior Front",
    instruction: "Open the driver door fully. Stand outside and photograph the entire front cabin — dashboard, steering wheel, and front seats visible.",
    sampleImage: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=400&q=80",
    sampleLabel: "Driver door open · Full front cabin view",
    icon: "🚗",
  },
  {
    id: "interior_rear",
    label: "Interior Rear",
    instruction: "Open the rear driver-side door fully. Photograph the entire back seat area — floor, seat, and headrests clearly visible.",
    sampleImage: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80",
    sampleLabel: "Rear driver door open · Full back seat view",
    icon: "🪑",
  },
  {
    id: "exterior_front_right",
    label: "Front Right Angle",
    instruction: "Stand at the front-right corner of the vehicle. Capture both the front bumper and right side in one diagonal shot.",
    sampleImage: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=400&q=80",
    sampleLabel: "Front-right 45° angle · Full bumper & side visible",
    icon: "↗️",
  },
  {
    id: "exterior_rear_right",
    label: "Rear Right Angle",
    instruction: "Stand at the rear-right corner. Capture the entire rear bumper and right side panel in one diagonal shot.",
    sampleImage: "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&q=80",
    sampleLabel: "Rear-right 45° angle · Full rear & side visible",
    icon: "↘️",
  },
  {
    id: "exterior_rear_left",
    label: "Rear Left Angle",
    instruction: "Stand at the rear-left corner. Capture the rear bumper and entire left side panel in one diagonal shot.",
    sampleImage: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=400&q=80",
    sampleLabel: "Rear-left 45° angle · Full rear & left side visible",
    icon: "↙️",
  },
  {
    id: "exterior_front_left",
    label: "Front Left Angle",
    instruction: "Stand at the front-left corner. Capture the front bumper and entire left side panel in one diagonal shot.",
    sampleImage: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=400&q=80",
    sampleLabel: "Front-left 45° angle · Full front & left side visible",
    icon: "↖️",
  },
];

function PhotoSlot({ slot, photo, onCapture, uploading }) {
  const inputRef = useRef(null);
  const [showSample, setShowSample] = useState(false);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{slot.icon}</span>
          <div>
            <p className="font-bold text-gray-900 text-sm">{slot.label}</p>
            <p className="text-[10px] text-gray-400">Required</p>
          </div>
        </div>
        {photo && <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />}
      </div>

      {/* Instruction */}
      <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
        <p className="text-xs text-blue-700 leading-relaxed">{slot.instruction}</p>
      </div>

      {/* Sample reference toggle */}
      <div className="px-4 pt-3">
        <button
          onClick={() => setShowSample(!showSample)}
          className="text-[11px] font-bold text-pink-500 underline mb-2"
        >
          {showSample ? "Hide example" : "📷 See example shot"}
        </button>
        {showSample && (
          <div className="mb-3 rounded-xl overflow-hidden border border-gray-200">
            <img src={slot.sampleImage} alt={slot.label} className="w-full h-36 object-cover" />
            <div className="px-2.5 py-1.5 bg-gray-50">
              <p className="text-[10px] text-gray-500 font-semibold">{slot.sampleLabel}</p>
            </div>
          </div>
        )}
      </div>

      {/* Upload area */}
      <div className="px-4 pb-4">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onCapture(slot.id, file);
          }}
        />

        {photo ? (
          <div className="relative rounded-xl overflow-hidden border-2 border-green-400">
            <img src={photo.preview} alt="" className="w-full h-32 object-cover" />
            <div className="absolute inset-0 bg-green-500/10 flex items-center justify-center">
              <div className="bg-white/90 rounded-full p-1.5">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
            </div>
            <button
              onClick={() => inputRef.current?.click()}
              className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-white/90 text-[10px] font-bold text-gray-700 border border-gray-200"
            >
              Retake
            </button>
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full h-28 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2 active:scale-[0.98] transition-transform bg-gray-50"
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 text-pink-400 animate-spin" />
            ) : (
              <>
                <Camera className="h-6 w-6 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500">Tap to take photo</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default function VehicleInspectionSheet({ booking, type, onClose, onComplete }) {
  // type = "pickup" | "dropoff"
  const [photos, setPhotos] = useState({});
  const [uploading, setUploading] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const updateBooking = useMutation({
    mutationFn: (data) => base44.entities.BookingRequest.update(booking.id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-booking-requests"] }),
  });

  const handleCapture = async (slotId, file) => {
    const preview = URL.createObjectURL(file);
    setUploading((u) => ({ ...u, [slotId]: true }));
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setPhotos((p) => ({ ...p, [slotId]: { preview, url: file_url } }));
    } catch {
      alert("Upload failed. Please try again.");
    } finally {
      setUploading((u) => ({ ...u, [slotId]: false }));
    }
  };

  const completedCount = Object.keys(photos).length;
  const allDone = completedCount === PHOTO_SLOTS.length;

  const handleSubmit = async () => {
    if (!allDone) return;
    setSubmitting(true);
    const urls = PHOTO_SLOTS.map((s) => photos[s.id].url);

    const field = type === "pickup" ? "pickup_photos" : "return_exterior_photos";
    const statusUpdate = type === "dropoff"
      ? { clean_return_status: "photos_submitted", booking_status: "pending_review" }
      : {};

    await updateBooking.mutateAsync({ [field]: urls, ...statusUpdate });
    setSubmitting(false);
    onComplete?.();
    onClose();
  };

  const isPickup = type === "pickup";

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="font-bold text-gray-900 text-base">
            {isPickup ? "Pickup Inspection" : "Drop-off Inspection"}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {completedCount}/{PHOTO_SLOTS.length} photos · All 6 required
          </p>
        </div>
        <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
          <X className="h-4 w-4 text-gray-600" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-200">
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${(completedCount / PHOTO_SLOTS.length) * 100}%`,
            background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))",
          }}
        />
      </div>

      {/* Banner */}
      <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-start gap-2 flex-shrink-0">
        <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 font-medium">
          {isPickup
            ? "Document the vehicle BEFORE you drive away. These photos protect you from any pre-existing damage claims."
            : "Document the vehicle BEFORE you walk away. These photos confirm the condition at return."}
        </p>
      </div>

      {/* Photo slots */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-32">
        {PHOTO_SLOTS.map((slot) => (
          <PhotoSlot
            key={slot.id}
            slot={slot}
            photo={photos[slot.id]}
            onCapture={handleCapture}
            uploading={uploading[slot.id]}
          />
        ))}
      </div>

      {/* Submit footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 safe-area-bottom">
        {!allDone && (
          <p className="text-center text-xs text-gray-400 mb-2">
            {PHOTO_SLOTS.length - completedCount} photo{PHOTO_SLOTS.length - completedCount !== 1 ? "s" : ""} remaining
          </p>
        )}
        <button
          onClick={handleSubmit}
          disabled={!allDone || submitting}
          className="w-full py-4 rounded-2xl font-bold text-sm text-white disabled:opacity-40 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
        >
          {submitting
            ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
            : allDone
            ? <><Upload className="h-4 w-4" />{isPickup ? "Submit Pickup Photos" : "Submit Drop-off Photos"}</>
            : `Complete all 6 photos to continue`}
        </button>
      </div>
    </div>
  );
}