import React from "react";
import { MessageSquareText, ArrowRight } from "lucide-react";

export default function ReviewCompletionNudge({ pendingCount, onOpenPast }) {
  if (!pendingCount) return null;

  return (
    <button
      onClick={onOpenPast}
      className="w-full mb-4 rounded-3xl border border-pink-100 bg-white p-4 text-left shadow-sm active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-pink-50 flex items-center justify-center flex-shrink-0">
          <MessageSquareText className="h-5 w-5 text-pink-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-gray-900">Help improve your rental experience</p>
          <p className="text-xs text-gray-500 mt-0.5">You have {pendingCount} completed rental{pendingCount > 1 ? "s" : ""} ready for a quick internal review.</p>
        </div>
        <ArrowRight className="h-4 w-4 text-pink-500 flex-shrink-0" />
      </div>
    </button>
  );
}