import React, { useState } from "react";
import { X, ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react";
import { format } from "date-fns";

const SLOT_LABELS = [
  "Interior Front", "Interior Rear",
  "Front Left", "Rear Left",
  "Front Right", "Rear Right",
  "Keys",
];

export default function InspectionPhotoGallery({ photos, submittedAt, locationLabel, title }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);

  if (!photos?.length) return null;

  return (
    <div>
      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">{title}</p>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {submittedAt && (
          <span className="flex items-center gap-1 text-[10px] text-gray-400">
            <Clock className="h-3 w-3" />
            {format(new Date(submittedAt), "MMM d, yyyy · h:mm a")}
          </span>
        )}
        {locationLabel && (
          <span className="flex items-center gap-1 text-[10px] text-gray-400">
            <MapPin className="h-3 w-3" />
            {locationLabel}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {photos.map((url, i) => (
          <button
            key={i}
            onClick={() => setLightboxIndex(i)}
            className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 active:scale-95 transition-transform"
          >
            <img src={url} alt={SLOT_LABELS[i] || `Photo ${i + 1}`} className="w-full h-full object-cover" />
            <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 text-[8px] font-bold text-white"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }}>
              {SLOT_LABELS[i] || `Photo ${i + 1}`}
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div className="fixed inset-0 z-[90] bg-black/95 flex flex-col" onClick={() => setLightboxIndex(null)}>
          <div className="flex items-center justify-between px-4 py-4 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <p className="text-white font-bold text-sm">{SLOT_LABELS[lightboxIndex] || `Photo ${lightboxIndex + 1}`}</p>
            <button onClick={() => setLightboxIndex(null)} className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center">
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center px-4 relative" onClick={(e) => e.stopPropagation()}>
            <img src={photos[lightboxIndex]} alt="" className="max-w-full max-h-full object-contain rounded-xl" />
            {lightboxIndex > 0 && (
              <button onClick={() => setLightboxIndex(lightboxIndex - 1)}
                className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/20">
                <ChevronLeft className="h-5 w-5 text-white" />
              </button>
            )}
            {lightboxIndex < photos.length - 1 && (
              <button onClick={() => setLightboxIndex(lightboxIndex + 1)}
                className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/20">
                <ChevronRight className="h-5 w-5 text-white" />
              </button>
            )}
          </div>
          <div className="px-4 pb-6 pt-2 text-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <p className="text-white/40 text-xs">{lightboxIndex + 1} of {photos.length} · Tap anywhere to close</p>
          </div>
        </div>
      )}
    </div>
  );
}