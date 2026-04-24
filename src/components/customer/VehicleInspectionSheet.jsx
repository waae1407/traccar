import React, { useState, useRef, useEffect } from "react";
import { X, Camera, CheckCircle, Upload, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// 6 mandatory inspection shots with AI prompt instructions per angle
const PHOTO_SLOTS = [
  {
    id: "interior_front",
    label: "Interior Front (Driver Side)",
    instruction: "Open the driver door fully. Stand outside and shoot inward at an angle — capture the steering wheel, dashboard, driver seat, and front passenger seat all in one shot.",
    aiPrompt: "Cartoon illustration showing the interior of this vehicle photographed from outside through the open driver (left) door. The camera angle looks inward diagonally showing the steering wheel on the left, dashboard ahead, driver seat in the foreground, and front passenger seat to the right. Realistic interior detail in the same cartoon illustration style as the exterior vehicle image.",
    icon: "🚗",
  },
  {
    id: "interior_rear",
    label: "Interior Rear (Driver Side)",
    instruction: "Open the rear driver-side door fully. Stand outside and shoot inward at an angle — capture the full back seat, floor, center armrest, and headrests in one shot.",
    aiPrompt: "Cartoon illustration showing the interior of this vehicle photographed from outside through the open rear driver-side (left) door. The camera angle looks inward diagonally showing the full rear bench seat, center armrest with cupholders, seat belts, rear floor, and headrests. Realistic interior detail in the same cartoon illustration style as the exterior vehicle image.",
    icon: "🪑",
  },
  {
    id: "exterior_front_left",
    label: "Front Left Corner (Driver Side)",
    instruction: "Stand at the front-left (driver) corner. Capture both the front bumper and the entire driver-side panel in one diagonal shot.",
    aiPrompt: "Cartoon illustration of this vehicle shot from the FRONT-LEFT corner. The camera is positioned at the front-left of the car. You can see: the front headlights and front bumper facing toward you on the left, and the entire LEFT side of the car (driver side) stretching away to the right. The rear of the car is NOT visible. Same cartoon style as the reference image.",
    icon: "↖️",
  },
  {
    id: "exterior_rear_left",
    label: "Rear Left Corner (Driver Side)",
    instruction: "Stand at the rear-left (driver) corner. Capture the rear bumper and the entire driver-side panel in one diagonal shot.",
    aiPrompt: "Cartoon illustration of this vehicle shot from the REAR-LEFT corner. The camera is positioned at the rear-left of the car. You can see: the rear tail lights and rear bumper facing toward you on the right, and the entire LEFT side of the car (driver side) stretching away to the left. The front of the car is NOT visible. Same cartoon style as the reference image.",
    icon: "↙️",
  },
  {
    id: "exterior_front_right",
    label: "Front Right Corner (Passenger Side)",
    instruction: "Stand at the front-right (passenger) corner. Capture both the front bumper and the entire passenger-side panel in one diagonal shot.",
    aiPrompt: "Cartoon illustration of this vehicle shot from the FRONT-LEFT corner. The camera is positioned at the front-left of the car. You can see: the front headlights and front bumper facing toward you on the left, and the entire LEFT side of the car stretching away to the right. The rear of the car is NOT visible. Same cartoon style as the reference image.",
    mirrorX: true,
    icon: "↗️",
  },
  {
    id: "exterior_rear_right",
    label: "Rear Right Corner (Passenger Side)",
    instruction: "Stand at the rear-right (passenger) corner. Capture the rear bumper and the entire passenger-side panel in one diagonal shot.",
    aiPrompt: "Cartoon illustration of this vehicle shot from the REAR-LEFT corner. The camera is positioned at the rear-left of the car. You can see: the rear tail lights and rear bumper facing toward you on the right, and the entire LEFT side of the car stretching away to the left. The front of the car is NOT visible. Same cartoon style as the reference image.",
    mirrorX: true,
    icon: "↘️",
  },
];

// Generate angle-specific cartoon image using the vehicle's existing image as reference
async function generateAngleImage(vehicleImageUrl, slot) {
  const result = await base44.integrations.Core.GenerateImage({
    prompt: `${slot.aiPrompt} The vehicle should match the style and color of the reference image exactly.`,
    existing_image_urls: [vehicleImageUrl],
  });
  return result.url;
}

function PhotoSlot({ slot, photo, onCapture, uploading, sampleImage, sampleLoading }) {
  const inputRef = useRef(null);

  return (
    <div className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
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
        /* Captured — full bleed preview */
        <div className="relative h-44">
          <img src={photo.preview} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <div className="h-12 w-12 rounded-full bg-green-500/20 border-2 border-green-400 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-400" />
            </div>
          </div>
          {/* Label + retake */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-3"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }}>
            <p className="text-white text-xs font-bold">{slot.label}</p>
            <button
              onClick={() => inputRef.current?.click()}
              className="px-3 py-1 rounded-lg text-[10px] font-bold text-white bg-white/20 border border-white/30 backdrop-blur-sm"
            >
              Retake
            </button>
          </div>
        </div>
      ) : (
        /* Sample + tap to capture */
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full text-left active:scale-[0.98] transition-transform"
        >
          {/* Sample image */}
          <div className="relative w-full h-44 bg-gray-100">
            {sampleLoading ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
                <span className="text-[10px] text-white/40">Generating example…</span>
              </div>
            ) : sampleImage ? (
              <img
                src={sampleImage}
                alt={slot.label}
                className="w-full h-full object-cover"
                style={slot.mirrorX ? { transform: "scaleX(-1)" } : {}}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-5xl opacity-30">
                {slot.icon}
              </div>
            )}
            {/* Camera icon top-right */}
            <div className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/20">
              <Camera className="h-4 w-4 text-white" />
            </div>
          </div>

          {/* Bottom tap bar */}
          <div className="flex items-center justify-center gap-2 py-3"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            {uploading
              ? <Loader2 className="h-4 w-4 text-white animate-spin" />
              : <Camera className="h-4 w-4 text-white" />}
            <span className="text-white text-xs font-bold">
              {uploading ? "Uploading…" : "Tap to capture"}
            </span>
          </div>
        </button>
      )}
    </div>
  );
}

export default function VehicleInspectionSheet({ booking, type, onClose, onComplete }) {
  const [photos, setPhotos] = useState({});
  const [uploading, setUploading] = useState({});
  const [submitting, setSubmitting] = useState(false);
  // sampleImages: { [slotId]: url } — generated from vehicle cartoon
  const [sampleImages, setSampleImages] = useState({});
  const [samplesLoading, setSamplesLoading] = useState({});
  const queryClient = useQueryClient();

  const vehicleImageUrl = booking?.vehicle_image;

  // Generate all 6 angle images on mount if vehicle has a cartoon image
  useEffect(() => {
    if (!vehicleImageUrl) return;

    PHOTO_SLOTS.forEach(async (slot) => {
      setSamplesLoading((s) => ({ ...s, [slot.id]: true }));
      try {
        const url = await generateAngleImage(vehicleImageUrl, slot);
        setSampleImages((s) => ({ ...s, [slot.id]: url }));
      } catch {
        // If generation fails, slot will show emoji fallback
      } finally {
        setSamplesLoading((s) => ({ ...s, [slot.id]: false }));
      }
    });
  }, [vehicleImageUrl]);

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
  const isPickup = type === "pickup";

  const handleSubmit = async () => {
    if (!allDone) return;
    setSubmitting(true);
    const urls = PHOTO_SLOTS.map((s) => photos[s.id].url);
    const field = isPickup ? "pickup_photos" : "return_exterior_photos";
    const statusUpdate = !isPickup ? { clean_return_status: "photos_submitted", booking_status: "pending_review" } : {};
    await updateBooking.mutateAsync({ [field]: urls, ...statusUpdate });
    setSubmitting(false);
    onComplete?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center justify-between flex-shrink-0 border-b border-gray-100">
        <div>
          <h2 className="font-bold text-gray-900 text-base" style={{ fontFamily: "var(--font-syne)" }}>
            {isPickup ? "Pickup Inspection" : "Drop-off Inspection"}
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {completedCount}/{PHOTO_SLOTS.length} photos · All required
          </p>
        </div>
        <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
          <X className="h-4 w-4 text-gray-500" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-200 flex-shrink-0">
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${(completedCount / PHOTO_SLOTS.length) * 100}%`,
            background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))",
          }}
        />
      </div>

      {/* Photo slots */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-32">
        {PHOTO_SLOTS.map((slot) => (
          <PhotoSlot
            key={slot.id}
            slot={slot}
            photo={photos[slot.id]}
            onCapture={handleCapture}
            uploading={uploading[slot.id]}
            sampleImage={sampleImages[slot.id]}
            sampleLoading={samplesLoading[slot.id]}
          />
        ))}
      </div>

      {/* Submit footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4">
        <button
          onClick={handleSubmit}
          disabled={!allDone || submitting}
          className="w-full py-4 rounded-2xl font-bold text-sm text-white disabled:opacity-30 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
        >
          {submitting
            ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
            : allDone
            ? <><Upload className="h-4 w-4" />{isPickup ? "Submit Pickup Photos" : "Submit Drop-off Photos"}</>
            : `Complete all ${PHOTO_SLOTS.length - completedCount} remaining photos`}
        </button>
      </div>
    </div>
  );
}