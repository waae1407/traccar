import React, { useState, useRef, useEffect } from "react";
import { X, Camera, CheckCircle, Upload, Loader2, KeyRound, AlertTriangle, MapPin, Clock, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

const PHOTO_SLOTS = [
  { id: "interior_front", label: "Interior Front (Driver Side)", icon: "🚗", aiPrompt: "Cartoon illustration showing the interior of this vehicle photographed from outside through the open driver door." },
  { id: "interior_rear", label: "Interior Rear (Driver Side)", icon: "🪑", aiPrompt: "Cartoon illustration showing the rear interior photographed through the open rear driver-side door." },
  { id: "exterior_front_left", label: "Front Left Corner (Driver Side)", icon: "↖️", aiPrompt: "Cartoon illustration of this vehicle shot from the FRONT-LEFT corner." },
  { id: "exterior_rear_left", label: "Rear Left Corner (Driver Side)", icon: "↙️", aiPrompt: "Cartoon illustration of this vehicle shot from the REAR-LEFT corner." },
  { id: "exterior_front_right", label: "Front Right Corner (Passenger Side)", icon: "↗️", mirrorX: true, aiPrompt: "Cartoon illustration of this vehicle shot from the FRONT-RIGHT corner." },
  { id: "exterior_rear_right", label: "Rear Right Corner (Passenger Side)", icon: "↘️", mirrorX: true, aiPrompt: "Cartoon illustration of this vehicle shot from the REAR-RIGHT corner." },
  { id: "vehicle_keys", label: "Vehicle Keys", icon: "🔑", isKeys: true, aiPrompt: "Cartoon illustration of this vehicle's car key(s) held up in a hand in front of the car." },
];

const ISSUE_CATEGORIES = [
  ["cleanliness", "Cleanliness"], ["warning_light", "Warning light"], ["odor", "Odor"],
  ["low_fuel_battery", "Low fuel/battery"], ["cosmetic_issue", "Cosmetic issue"],
  ["unsafe_issue", "Unsafe issue"], ["wrong_vehicle", "Wrong vehicle"],
  ["missing_item", "Missing item"], ["other", "Other"],
];

async function generateAngleImage(vehicleImageUrl, slot) {
  const result = await base44.integrations.Core.GenerateImage({
    prompt: `${slot.aiPrompt} Match the reference vehicle style and color exactly.`,
    existing_image_urls: [vehicleImageUrl],
  });
  return result.url;
}

async function captureLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}

function getDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, { headers: { "User-Agent": "uRide-app/1.0" } });
    const data = await res.json();
    const city = data.address?.city || data.address?.town || data.address?.village || data.address?.county || "";
    const state = data.address?.state || "";
    return city && state ? `${city}, ${state}` : city || state || null;
  } catch {
    return null;
  }
}

function ReadOnlyViewer({ submittedPhotos, submittedAt, locationLabel, type, onClose }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const isPickup = type === "pickup";
  const formattedTime = submittedAt ? format(new Date(submittedAt), "MMMM d, yyyy 'at' h:mm a") : null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-gray-50">
      <div className="bg-white px-4 py-4 flex items-center justify-between flex-shrink-0 border-b border-gray-100">
        <div>
          <h2 className="font-bold text-gray-900 text-base" style={{ fontFamily: "var(--font-syne)" }}>{isPickup ? "Pickup Inspection" : "Drop-off Inspection"}</h2>
          <p className="text-[11px] text-green-600 font-semibold mt-0.5">✓ Submitted — Read Only</p>
        </div>
        <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center"><X className="h-4 w-4 text-gray-500" /></button>
      </div>

      <div className="mx-4 mt-3 rounded-2xl overflow-hidden border border-green-200 bg-green-50">
        <div className="px-4 py-3 flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-green-800">Photos Submitted Successfully</p>
            <p className="text-[11px] text-green-700 mt-0.5">These photos are locked and cannot be retaken.</p>
            <div className="mt-2 space-y-1">
              {formattedTime && <div className="flex items-center gap-2"><Clock className="h-3 w-3 text-green-600" /><span className="text-[11px] font-semibold text-green-700">{formattedTime}</span></div>}
              {locationLabel && <div className="flex items-center gap-2"><MapPin className="h-3 w-3 text-green-600" /><span className="text-[11px] font-semibold text-green-700">{locationLabel}</span></div>}
            </div>
          </div>
        </div>
      </div>

      {lightboxIndex !== null && (
        <div className="fixed inset-0 z-[80] bg-black/95 flex flex-col" onClick={() => setLightboxIndex(null)}>
          <div className="flex items-center justify-between px-4 py-4 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <div><p className="text-white font-bold text-sm">{PHOTO_SLOTS[lightboxIndex]?.label}</p><p className="text-white/40 text-[11px]">{lightboxIndex + 1} of {submittedPhotos.length}</p></div>
            <button onClick={() => setLightboxIndex(null)} className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center"><X className="h-4 w-4 text-white" /></button>
          </div>
          <div className="flex-1 flex items-center justify-center px-4 relative" onClick={(e) => e.stopPropagation()}>
            <img src={submittedPhotos[lightboxIndex]} alt="" className="max-w-full max-h-full object-contain rounded-xl" />
            {lightboxIndex > 0 && <button onClick={() => setLightboxIndex(lightboxIndex - 1)} className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/50 flex items-center justify-center"><ChevronLeft className="h-5 w-5 text-white" /></button>}
            {lightboxIndex < submittedPhotos.length - 1 && <button onClick={() => setLightboxIndex(lightboxIndex + 1)} className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/50 flex items-center justify-center"><ChevronRight className="h-5 w-5 text-white" /></button>}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-8">
        {PHOTO_SLOTS.map((slot, index) => {
          const photoUrl = submittedPhotos[index];
          return (
            <button key={slot.id} onClick={() => setLightboxIndex(index)} className="w-full rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white active:scale-[0.98] transition-transform text-left">
              <div className="relative h-44">
                {photoUrl ? <img src={photoUrl} alt={slot.label} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gray-100 flex items-center justify-center text-4xl opacity-30">{slot.icon}</div>}
                <div className="absolute inset-0 bg-black/20" />
                <div className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/40 flex items-center justify-center"><Eye className="h-4 w-4 text-white" /></div>
                <div className="absolute bottom-0 left-0 right-0 px-4 py-3" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)" }}><p className="text-white text-xs font-bold">{slot.label}</p></div>
              </div>
              <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-50"><span className="text-xs font-semibold text-green-700">Photo submitted</span><span className="text-xs text-gray-400 font-medium">Tap to view</span></div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PhotoSlot({ slot, photo, onCapture, uploading, sampleImage, sampleLoading }) {
  const inputRef = useRef(null);
  return (
    <div className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
      <input ref={inputRef} type="file" capture="environment" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) onCapture(slot.id, file); }} />
      {photo ? (
        <div className="relative h-44">
          <img src={photo.preview} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center"><CheckCircle className="h-8 w-8 text-green-400" /></div>
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-3" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }}>
            <p className="text-white text-xs font-bold">{slot.label}</p>
            <button onClick={() => inputRef.current?.click()} className="px-3 py-1 rounded-lg text-[10px] font-bold text-white bg-white/20 border border-white/30">Retake</button>
          </div>
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()} disabled={uploading} className="w-full text-left active:scale-[0.98] transition-transform">
          {slot.isKeys && <div className="flex items-center gap-2 px-4 py-2 border-b border-red-100 bg-red-50"><AlertTriangle className="h-3.5 w-3.5 text-red-500" /><p className="text-[11px] font-black text-red-600">Lost keys = <span className="text-red-700">$250 expense</span> — all keys must be in frame</p></div>}
          <div className="relative w-full h-44 bg-gray-100">
            {sampleLoading ? <div className="w-full h-full flex flex-col items-center justify-center gap-2"><Loader2 className="h-5 w-5 text-primary animate-spin" /><span className="text-[10px] text-gray-400">Generating example…</span></div>
              : sampleImage ? <img src={sampleImage} alt={slot.label} className="w-full h-full object-cover" style={slot.mirrorX ? { transform: "scaleX(-1)" } : {}} />
              : <div className="w-full h-full flex items-center justify-center text-5xl opacity-30">{slot.icon}</div>}
            <div className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/40 flex items-center justify-center"><Camera className="h-4 w-4 text-white" /></div>
          </div>
          <div className="flex items-center justify-center gap-2 py-3" style={{ background: slot.isKeys ? "linear-gradient(135deg, #dc2626, #9f1239)" : "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            {uploading ? <Loader2 className="h-4 w-4 text-white animate-spin" /> : slot.isKeys ? <KeyRound className="h-4 w-4 text-white" /> : <Camera className="h-4 w-4 text-white" />}
            <span className="text-white text-xs font-bold">{uploading ? "Uploading…" : slot.isKeys ? "Photograph all keys now" : "Tap to capture"}</span>
          </div>
        </button>
      )}
    </div>
  );
}

function AdditionalPhotoUploader({ photos, onCapture, uploading }) {
  const inputRef = useRef(null);
  return (
    <div className="rounded-2xl bg-white border border-gray-100 p-4">
      <input ref={inputRef} type="file" capture="environment" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) onCapture(file); }} />
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-sm font-black text-gray-900">Additional photos</p><p className="text-[11px] text-gray-500">Optional context for dashboard, odometer, fuel, or extra issue photos.</p></div>
        <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className="px-3 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>Add Photo</button>
      </div>
      {photos.length > 0 && <div className="grid grid-cols-3 gap-2 mt-3">{photos.map((p, i) => <img key={i} src={p.preview} alt="" className="h-20 w-full object-cover rounded-xl" />)}</div>}
    </div>
  );
}

async function compressImage(file, maxWidthPx = 1600, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxWidthPx) { height = Math.round((height * maxWidthPx) / width); width = maxWidthPx; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob ? new File([blob], file.name || "photo.jpg", { type: "image/jpeg" }) : file), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export default function VehicleInspectionSheet({ booking, type, onClose, onComplete }) {
  const isPickup = type === "pickup";
  const submittedPhotos = isPickup ? booking?.pickup_photos : booking?.return_exterior_photos;
  const isSubmitted = submittedPhotos?.length > 0;
  const submittedAt = isPickup ? booking?.pickup_submitted_at : booking?.dropoff_submitted_at;
  const locationLabel = isPickup ? booking?.pickup_location_label : booking?.dropoff_location_label;

  if (isSubmitted) return <ReadOnlyViewer submittedPhotos={submittedPhotos} submittedAt={submittedAt} locationLabel={locationLabel} type={type} onClose={onClose} />;
  return <CaptureMode booking={booking} type={type} onClose={onClose} onComplete={onComplete} isPickup={isPickup} />;
}

function CaptureMode({ booking, onClose, onComplete, isPickup }) {
  const [photos, setPhotos] = useState({});
  const [additionalPhotos, setAdditionalPhotos] = useState([]);
  const [uploading, setUploading] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [sampleImages, setSampleImages] = useState({});
  const [samplesLoading, setSamplesLoading] = useState({});
  const [issueGrade, setIssueGrade] = useState("excellent");
  const [issueCategories, setIssueCategories] = useState([]);
  const [issueDescription, setIssueDescription] = useState("");
  const queryClient = useQueryClient();

  const vehicleImageUrl = booking?.vehicle_image;
  const cachedImages = booking?.inspection_sample_images || {};

  useEffect(() => {
    if (!vehicleImageUrl) return;
    if (Object.keys(cachedImages).length > 0) setSampleImages(cachedImages);
    const slotsToGenerate = PHOTO_SLOTS.filter((slot) => slot.aiPrompt && !cachedImages[slot.id]);
    if (slotsToGenerate.length === 0) return;
    const loadingState = {};
    slotsToGenerate.forEach((s) => { loadingState[s.id] = true; });
    setSamplesLoading(loadingState);
    const newlyGenerated = {};
    Promise.all(slotsToGenerate.map(async (slot) => {
      try {
        const url = await generateAngleImage(vehicleImageUrl, slot);
        newlyGenerated[slot.id] = url;
        setSampleImages((prev) => ({ ...prev, [slot.id]: url }));
      } catch { /* fallback */ }
      finally { setSamplesLoading((prev) => ({ ...prev, [slot.id]: false })); }
    })).then(() => {
      if (Object.keys(newlyGenerated).length > 0 && booking?.id) {
        base44.entities.BookingRequest.update(booking.id, { inspection_sample_images: { ...cachedImages, ...newlyGenerated } }).catch(() => {});
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
      const compressed = await compressImage(file);
      const { file_url } = await base44.integrations.Core.UploadFile({ file: compressed });
      setPhotos((p) => ({ ...p, [slotId]: { preview, url: file_url } }));
    } finally {
      setUploading((u) => ({ ...u, [slotId]: false }));
    }
  };

  const handleAdditionalCapture = async (file) => {
    const preview = URL.createObjectURL(file);
    const key = `additional_${Date.now()}`;
    setUploading((u) => ({ ...u, [key]: true }));
    try {
      const compressed = await compressImage(file);
      const { file_url } = await base44.integrations.Core.UploadFile({ file: compressed });
      setAdditionalPhotos((prev) => [...prev, { preview, url: file_url }]);
    } finally {
      setUploading((u) => ({ ...u, [key]: false }));
    }
  };

  const completedCount = Object.keys(photos).length;
  const pickupIssueDetailsRequired = isPickup && (issueGrade === "problematic" || issueCategories.includes("other"));
  const allDone = completedCount === PHOTO_SLOTS.length && (!pickupIssueDetailsRequired || issueDescription.trim().length > 0);

  const handleSubmit = async () => {
    if (!allDone) return;
    setSubmitting(true);
    const submittedAt = new Date().toISOString();
    const gps = await captureLocation();
    const locationLabel = gps ? await reverseGeocode(gps.lat, gps.lon) : null;
    const urls = PHOTO_SLOTS.map((s) => photos[s.id].url);
    const additionalUrls = additionalPhotos.map((p) => p.url);
    const expectedLat = isPickup ? booking?.pickup_location_lat : booking?.dropoff_location_lat;
    const expectedLon = isPickup ? booking?.pickup_location_lon : booking?.dropoff_location_lon;
    const distanceMiles = gps && expectedLat && expectedLon ? getDistanceMiles(gps.lat, gps.lon, expectedLat, expectedLon) : null;
    const gpsStatus = !gps ? "missing" : distanceMiles !== null ? (distanceMiles <= 5 ? "within_5_miles" : "outside_5_miles") : "not_checked";
    const disputeWindowExpiresAt = isPickup ? null : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const packet = await base44.entities.InspectionEvidencePacket.create({
      booking_request_id: booking.id,
      vehicle_id: booking.vehicle_id,
      host_id: booking.host_id,
      renter_user_id: booking.user_id,
      inspection_type: isPickup ? "pickup" : "dropoff",
      evidence_status: isPickup ? "submitted" : "locked",
      submitted_by_role: "renter",
      submitted_by_user_id: booking.user_id,
      submitted_at: submittedAt,
      ...(gps && { gps_lat: gps.lat, gps_lon: gps.lon, gps_accuracy: gps.accuracy }),
      ...(locationLabel && { location_label: locationLabel }),
      ...(distanceMiles !== null && { gps_distance_miles: distanceMiles }),
      gps_tolerance_status: gpsStatus,
      evidence_confidence: gpsStatus === "outside_5_miles" || gpsStatus === "missing" ? "moderate" : "high",
      required_photo_slots_completed: PHOTO_SLOTS.length,
      additional_photo_count: additionalUrls.length,
      issue_grade: isPickup ? issueGrade : "excellent",
      issue_categories: isPickup ? issueCategories : [],
      issue_description: isPickup ? issueDescription : "",
      evidence_locked_at: isPickup ? null : submittedAt,
      lock_reason: isPickup ? "" : "renter_dropoff_submitted",
      dispute_window_expires_at: disputeWindowExpiresAt,
      trust_attribution_preview: isPickup
        ? { affects: ["host_trust", "vehicle_quality"], renter_trust: "compliance_or_fraud_only" }
        : { affects: ["private_renter_trust", "return_accountability"], host_trust: "no_direct_negative_attribution" },
    });

    await Promise.all([
      ...PHOTO_SLOTS.map((slot) => base44.entities.InspectionEvidencePhoto.create({ packet_id: packet.id, booking_request_id: booking.id, photo_slot: slot.id, photo_url: photos[slot.id].url, uploaded_by_role: "renter", uploaded_at: submittedAt, ...(gps && { gps_lat: gps.lat, gps_lon: gps.lon }), dispute_available_until: disputeWindowExpiresAt })),
      ...additionalUrls.map((url, index) => base44.entities.InspectionEvidencePhoto.create({ packet_id: packet.id, booking_request_id: booking.id, photo_slot: `additional_${index + 1}`, photo_url: url, uploaded_by_role: "renter", uploaded_at: submittedAt, ...(gps && { gps_lat: gps.lat, gps_lon: gps.lon }), dispute_available_until: disputeWindowExpiresAt }))
    ]);

    const field = isPickup ? "pickup_photos" : "return_exterior_photos";
    const metaFields = isPickup
      ? { pickup_submitted_at: submittedAt, ...(gps && { pickup_location_lat: gps.lat, pickup_location_lon: gps.lon }), ...(locationLabel && { pickup_location_label: locationLabel }) }
      : { dropoff_submitted_at: submittedAt, ...(gps && { dropoff_location_lat: gps.lat, dropoff_location_lon: gps.lon }), ...(locationLabel && { dropoff_location_label: locationLabel }), clean_return_status: "photos_submitted", booking_status: "return_pending_host_review", pending_review_alert_active: true };

    await updateBooking.mutateAsync({ [field]: urls, ...metaFields });
    if (!isPickup && booking.vehicle_id) await base44.entities.Vehicle.update(booking.vehicle_id, { status: "Return Pending Host Review" });
    setSubmitting(false);
    onComplete?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-gray-50">
      <div className="bg-white px-4 py-4 flex items-center justify-between flex-shrink-0 border-b border-gray-100">
        <div><h2 className="font-bold text-gray-900 text-base" style={{ fontFamily: "var(--font-syne)" }}>{isPickup ? "Pickup Inspection" : "Drop-off Inspection"}</h2><p className="text-[11px] text-gray-400 mt-0.5">{completedCount}/{PHOTO_SLOTS.length} photos · All required</p></div>
        <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center"><X className="h-4 w-4 text-gray-500" /></button>
      </div>
      <div className="h-1 bg-gray-200"><div className="h-full transition-all duration-500" style={{ width: `${(completedCount / PHOTO_SLOTS.length) * 100}%`, background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }} /></div>
      <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-100"><MapPin className="h-3.5 w-3.5 text-blue-500" /><p className="text-[11px] text-blue-700 font-medium">GPS location and timestamp will be recorded when available.</p></div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-32">
        {isPickup && (
          <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-3">
            <div><p className="text-sm font-black text-gray-900">Pickup condition</p><p className="text-[11px] text-gray-500 mt-0.5">Problematic means a noticeable issue affected cleanliness, readiness, safety, or the rental experience.</p></div>
            <div className="grid grid-cols-3 gap-2">{[["excellent", "Excellent"], ["fair", "Fair"], ["problematic", "Problematic"]].map(([value, label]) => <button key={value} type="button" onClick={() => setIssueGrade(value)} className={`py-2 rounded-xl text-xs font-bold border ${issueGrade === value ? "bg-pink-50 border-pink-300 text-pink-600" : "border-gray-200 text-gray-500"}`}>{label}</button>)}</div>
            {issueGrade !== "excellent" && <div className="flex flex-wrap gap-2">{ISSUE_CATEGORIES.map(([value, label]) => <button key={value} type="button" onClick={() => setIssueCategories((prev) => prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value])} className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${issueCategories.includes(value) ? "bg-amber-50 border-amber-300 text-amber-700" : "border-gray-200 text-gray-500"}`}>{label}</button>)}</div>}
            {(issueGrade === "problematic" || issueCategories.includes("other")) && <textarea value={issueDescription} onChange={(e) => setIssueDescription(e.target.value)} placeholder="Briefly describe the issue..." className="w-full min-h-20 rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-pink-300" />}
          </div>
        )}
        {PHOTO_SLOTS.map((slot) => <PhotoSlot key={slot.id} slot={slot} photo={photos[slot.id]} onCapture={handleCapture} uploading={uploading[slot.id]} sampleImage={sampleImages[slot.id]} sampleLoading={samplesLoading[slot.id]} />)}
        <AdditionalPhotoUploader photos={additionalPhotos} onCapture={handleAdditionalCapture} uploading={Object.values(uploading).some(Boolean)} />
      </div>
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4">
        <button onClick={handleSubmit} disabled={!allDone || submitting} className="w-full py-4 rounded-2xl font-bold text-sm text-white disabled:opacity-30 flex items-center justify-center gap-2 transition-all active:scale-[0.98]" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</> : allDone ? <><Upload className="h-4 w-4" />{isPickup ? "Submit Pickup Photos" : "Submit Drop-off Photos"}</> : pickupIssueDetailsRequired ? "Describe the pickup issue to continue" : `Complete all ${PHOTO_SLOTS.length - completedCount} remaining photos`}
        </button>
      </div>
    </div>
  );
}