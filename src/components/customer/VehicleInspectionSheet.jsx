import React, { useState, useRef, useEffect } from "react";
import { X, Camera, CheckCircle, Upload, Loader2, KeyRound, AlertTriangle, MapPin, Clock, Image, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

const PHOTO_SLOTS = [
  { id: "interior_front", label: "Interior Front (Driver Side)", icon: "🚗",
    aiPrompt: "Cartoon illustration showing the interior of this vehicle photographed from outside through the open driver (left) door. The camera angle looks inward diagonally showing the steering wheel on the left, dashboard ahead, driver seat in the foreground, and front passenger seat to the right. Realistic interior detail in the same cartoon illustration style as the exterior vehicle image." },
  { id: "interior_rear", label: "Interior Rear (Driver Side)", icon: "🪑",
    aiPrompt: "Cartoon illustration showing the interior of this vehicle photographed from outside through the open rear driver-side (left) door. The camera angle looks inward diagonally showing the full rear bench seat, center armrest with cupholders, seat belts, rear floor, and headrests. Realistic interior detail in the same cartoon illustration style as the exterior vehicle image." },
  { id: "exterior_front_left", label: "Front Left Corner (Driver Side)", icon: "↖️",
    aiPrompt: "Cartoon illustration of this vehicle shot from the FRONT-LEFT corner." },
  { id: "exterior_rear_left", label: "Rear Left Corner (Driver Side)", icon: "↙️",
    aiPrompt: "Cartoon illustration of this vehicle shot from the REAR-LEFT corner." },
  { id: "exterior_front_right", label: "Front Right Corner (Passenger Side)", icon: "↗️", mirrorX: true,
    aiPrompt: "Cartoon illustration of this vehicle shot from the FRONT-RIGHT corner." },
  { id: "exterior_rear_right", label: "Rear Right Corner (Passenger Side)", icon: "↘️", mirrorX: true,
    aiPrompt: "Cartoon illustration of this vehicle shot from the REAR-RIGHT corner." },
  { id: "vehicle_keys", label: "Vehicle Keys", icon: "🔑", isKeys: true,
    aiPrompt: "Cartoon illustration of this vehicle's car key(s) held up in a hand in front of the car." },
];

async function generateAngleImage(vehicleImageUrl, slot) {
  const result = await base44.integrations.Core.GenerateImage({
    prompt: `${slot.aiPrompt} The vehicle should match the style and color of the reference image exactly.`,
    existing_image_urls: [vehicleImageUrl],
  });
  return result.url;
}

async function captureLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { "User-Agent": "uRide-app/1.0" } }
    );
    const data = await res.json();
    const city = data.address?.city || data.address?.town || data.address?.village || data.address?.county || "";
    const state = data.address?.state || "";
    return city && state ? `${city}, ${state}` : city || state || null;
  } catch {
    return null;
  }
}

// ─── READ-ONLY VIEWER ────────────────────────────────────────────────────────

function ReadOnlyViewer({ submittedPhotos, submittedAt, locationLabel, type, onClose }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const isPickup = type === "pickup";

  const formattedTime = submittedAt
    ? format(new Date(submittedAt), "MMMM d, yyyy 'at' h:mm a")
    : null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center justify-between flex-shrink-0 border-b border-gray-100">
        <div>
          <h2 className="font-bold text-gray-900 text-base" style={{ fontFamily: "var(--font-syne)" }}>
            {isPickup ? "Pickup Inspection" : "Drop-off Inspection"}
          </h2>
          <p className="text-[11px] text-green-600 font-semibold mt-0.5">✓ Submitted — Read Only</p>
        </div>
        <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
          <X className="h-4 w-4 text-gray-500" />
        </button>
      </div>

      {/* Proof stamp */}
      <div className="mx-4 mt-3 rounded-2xl overflow-hidden border border-green-200" style={{ background: "linear-gradient(135deg, #f0fdf4, #dcfce7)" }}>
        <div className="px-4 py-3 flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-green-800">Photos Submitted Successfully</p>
            <p className="text-[11px] text-green-700 mt-0.5">These photos are locked and cannot be retaken.</p>
            <div className="mt-2 space-y-1">
              {formattedTime && (
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3 text-green-600 flex-shrink-0" />
                  <span className="text-[11px] font-semibold text-green-700">{formattedTime}</span>
                </div>
              )}
              {locationLabel && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-3 w-3 text-green-600 flex-shrink-0" />
                  <span className="text-[11px] font-semibold text-green-700">{locationLabel}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div className="fixed inset-0 z-[80] bg-black/95 flex flex-col" onClick={() => setLightboxIndex(null)}>
          <div className="flex items-center justify-between px-4 py-4 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="text-white font-bold text-sm">{PHOTO_SLOTS[lightboxIndex]?.label}</p>
              <p className="text-white/40 text-[11px] mt-0.5">{lightboxIndex + 1} of {submittedPhotos.length}</p>
            </div>
            <button onClick={() => setLightboxIndex(null)} className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center">
              <X className="h-4 w-4 text-white" />
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center px-4 relative" onClick={(e) => e.stopPropagation()}>
            <img
              src={submittedPhotos[lightboxIndex]}
              alt=""
              className="max-w-full max-h-full object-contain rounded-xl"
            />
            {lightboxIndex > 0 && (
              <button onClick={() => setLightboxIndex(lightboxIndex - 1)}
                className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/20">
                <ChevronLeft className="h-5 w-5 text-white" />
              </button>
            )}
            {lightboxIndex < submittedPhotos.length - 1 && (
              <button onClick={() => setLightboxIndex(lightboxIndex + 1)}
                className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/20">
                <ChevronRight className="h-5 w-5 text-white" />
              </button>
            )}
          </div>

          {/* Proof footer inside lightbox */}
          <div className="px-4 pb-6 pt-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              {formattedTime && (
                <span className="flex items-center gap-1.5 text-xs text-white/60">
                  <Clock className="h-3.5 w-3.5 text-white/40" />{formattedTime}
                </span>
              )}
              {locationLabel && (
                <span className="flex items-center gap-1.5 text-xs text-white/60">
                  <MapPin className="h-3.5 w-3.5 text-white/40" />{locationLabel}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Photo grid — each slot is a tappable CTA */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-8">
        {PHOTO_SLOTS.map((slot, index) => {
          const photoUrl = submittedPhotos[index];
          return (
            <button
              key={slot.id}
              onClick={() => setLightboxIndex(index)}
              className="w-full rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white active:scale-[0.98] transition-transform text-left"
            >
              <div className="relative h-44">
                {photoUrl ? (
                  <img src={photoUrl} alt={slot.label} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gray-100 flex items-center justify-center text-4xl opacity-30">
                    {slot.icon}
                  </div>
                )}
                {/* Overlay */}
                <div className="absolute inset-0 bg-black/20" />
                {/* View icon */}
                <div className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/20">
                  <Eye className="h-4 w-4 text-white" />
                </div>
                {/* Label */}
                <div className="absolute bottom-0 left-0 right-0 px-4 py-3"
                  style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)" }}>
                  <p className="text-white text-xs font-bold">{slot.label}</p>
                </div>
              </div>
              {/* CTA bar */}
              <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-50">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-xs font-semibold text-green-700">Photo submitted</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs text-gray-400 font-medium">Tap to view</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── CAPTURE SLOT (for new submissions) ──────────────────────────────────────

function PhotoSlot({ slot, photo, onCapture, uploading, sampleImage, sampleLoading }) {
  const inputRef = useRef(null);

  return (
    <div className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
      <input
        ref={inputRef}
        type="file"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onCapture(slot.id, file);
        }}
      />

      {photo ? (
        <div className="relative h-44">
          <img src={photo.preview} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <div className="h-12 w-12 rounded-full bg-green-500/20 border-2 border-green-400 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-400" />
            </div>
          </div>
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
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full text-left active:scale-[0.98] transition-transform"
        >
          {slot.isKeys && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-red-100"
              style={{ background: "linear-gradient(135deg, #fff1f2, #ffe4e6)" }}>
              <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
              <p className="text-[11px] font-black text-red-600 tracking-tight">
                ⚠️ Lost keys = <span className="text-red-700">$250 expense</span> — all keys must be in frame
              </p>
            </div>
          )}
          <div className="relative w-full h-44 bg-gray-100">
            {sampleLoading ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
                <span className="text-[10px] text-gray-400">Generating example…</span>
              </div>
            ) : sampleImage ? (
              <img src={sampleImage} alt={slot.label} className="w-full h-full object-cover"
                style={slot.mirrorX ? { transform: "scaleX(-1)" } : {}} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-5xl opacity-30">
                {slot.icon}
              </div>
            )}
            <div className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/20">
              <Camera className="h-4 w-4 text-white" />
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 py-3"
            style={{ background: slot.isKeys
              ? "linear-gradient(135deg, #dc2626, #9f1239)"
              : "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            {uploading
              ? <Loader2 className="h-4 w-4 text-white animate-spin" />
              : slot.isKeys ? <KeyRound className="h-4 w-4 text-white" />
              : <Camera className="h-4 w-4 text-white" />}
            <span className="text-white text-xs font-bold">
              {uploading ? "Uploading…" : slot.isKeys ? "📸 Photograph all keys now" : "Tap to capture"}
            </span>
          </div>
        </button>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function VehicleInspectionSheet({ booking, type, onClose, onComplete }) {
  const isPickup = type === "pickup";

  // Determine if already submitted (read-only mode)
  const submittedPhotos = isPickup ? booking?.pickup_photos : booking?.return_exterior_photos;
  const isSubmitted = submittedPhotos?.length > 0;
  const submittedAt = isPickup ? booking?.pickup_submitted_at : booking?.dropoff_submitted_at;
  const locationLabel = isPickup ? booking?.pickup_location_label : booking?.dropoff_location_label;

  // ── Read-only mode ──
  if (isSubmitted) {
    return (
      <ReadOnlyViewer
        submittedPhotos={submittedPhotos}
        submittedAt={submittedAt}
        locationLabel={locationLabel}
        type={type}
        onClose={onClose}
      />
    );
  }

  // ── Capture mode ──
  return <CaptureMode booking={booking} type={type} onClose={onClose} onComplete={onComplete} isPickup={isPickup} />;
}

function CaptureMode({ booking, type, onClose, onComplete, isPickup }) {
  const [photos, setPhotos] = useState({});
  const [uploading, setUploading] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [sampleImages, setSampleImages] = useState({});
  const [samplesLoading, setSamplesLoading] = useState({});
  const queryClient = useQueryClient();

  const vehicleImageUrl = booking?.vehicle_image;
  const cachedImages = booking?.inspection_sample_images || {};

  useEffect(() => {
    if (!vehicleImageUrl) return;

    // Load cached images immediately (instant display)
    if (Object.keys(cachedImages).length > 0) {
      setSampleImages(cachedImages);
    }

    // Find slots that still need generation (not in cache)
    const slotsToGenerate = PHOTO_SLOTS.filter((slot) => slot.aiPrompt && !cachedImages[slot.id]);
    if (slotsToGenerate.length === 0) return;

    // Mark all missing slots as loading
    const loadingState = {};
    slotsToGenerate.forEach((s) => { loadingState[s.id] = true; });
    setSamplesLoading(loadingState);

    // Generate all missing slots in parallel
    const newlyGenerated = {};
    Promise.all(
      slotsToGenerate.map(async (slot) => {
        try {
          const url = await generateAngleImage(vehicleImageUrl, slot);
          newlyGenerated[slot.id] = url;
          setSampleImages((prev) => ({ ...prev, [slot.id]: url }));
        } catch { /* emoji fallback */ }
        finally {
          setSamplesLoading((prev) => ({ ...prev, [slot.id]: false }));
        }
      })
    ).then(() => {
      // Save newly generated images back to the booking for caching
      if (Object.keys(newlyGenerated).length > 0 && booking?.id) {
        const merged = { ...cachedImages, ...newlyGenerated };
        base44.entities.BookingRequest.update(booking.id, {
          inspection_sample_images: merged,
        }).catch(() => {}); // silent — caching is best-effort
      }
    });
  }, [vehicleImageUrl, booking?.id]);

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
    const submittedAt = new Date().toISOString();
    const gps = await captureLocation();
    let locationLabel = null;
    if (gps) locationLabel = await reverseGeocode(gps.lat, gps.lon);

    const urls = PHOTO_SLOTS.map((s) => photos[s.id].url);
    const field = isPickup ? "pickup_photos" : "return_exterior_photos";
    const metaFields = isPickup
      ? {
          pickup_submitted_at: submittedAt,
          ...(gps && { pickup_location_lat: gps.lat, pickup_location_lon: gps.lon }),
          ...(locationLabel && { pickup_location_label: locationLabel }),
        }
      : {
          dropoff_submitted_at: submittedAt,
          ...(gps && { dropoff_location_lat: gps.lat, dropoff_location_lon: gps.lon }),
          ...(locationLabel && { dropoff_location_label: locationLabel }),
          clean_return_status: "photos_submitted",
          booking_status: "pending_review",
        };

    await updateBooking.mutateAsync({ [field]: urls, ...metaFields });

    // Trigger AI photo inspection in background (don't block the user)
    const triggerFn = isPickup ? "triggerPickupInspection" : "triggerDropoffInspection";
    base44.functions.invoke(triggerFn, { booking_id: booking.id })
      .catch((e) => console.warn("AI inspection trigger failed:", e.message));

    setSubmitting(false);
    onComplete?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-gray-50">
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

      <div className="h-1 bg-gray-200 flex-shrink-0">
        <div className="h-full transition-all duration-500"
          style={{ width: `${(completedCount / PHOTO_SLOTS.length) * 100}%`, background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }} />
      </div>

      <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-100">
        <MapPin className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
        <p className="text-[11px] text-blue-700 font-medium">
          Your GPS location & timestamp will be recorded on submission for accountability
        </p>
      </div>

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