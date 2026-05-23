import React from "react";
import { Star } from "lucide-react";

export default function PublicRating({ rating, count, compact = false }) {
  if (!rating || !count) return null;

  return (
    <div className="flex items-center gap-1">
      <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
      <span className={`${compact ? "text-[10px]" : "text-sm"} font-bold text-gray-700`}>{rating}</span>
      <span className={`${compact ? "text-[10px]" : "text-sm"} text-gray-400`}>({count})</span>
    </div>
  );
}