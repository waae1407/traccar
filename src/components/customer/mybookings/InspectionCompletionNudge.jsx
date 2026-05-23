import React from "react";
import { Camera, ArrowRight } from "lucide-react";

export default function InspectionCompletionNudge({ missingCount, onOpenFirst }) {
  if (!missingCount) return null;

  return (
    <button
      onClick={onOpenFirst}
      className="w-full mb-4 rounded-3xl border border-amber-100 bg-amber-50 p-4 text-left active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-white flex items-center justify-center flex-shrink-0">
          <Camera className="h-5 w-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-amber-900">Finish inspection photos</p>
          <p className="text-xs text-amber-700 mt-0.5">Complete pickup or return photos to keep the rental record accurate.</p>
        </div>
        <ArrowRight className="h-4 w-4 text-amber-600 flex-shrink-0" />
      </div>
    </button>
  );
}