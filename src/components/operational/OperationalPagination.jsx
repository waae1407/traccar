import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function OperationalPagination({ mode = "host", page = 0, pageSize = 25, total = 0, onPageChange, className }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page + 1, totalPages);
  const buttonClass = mode === "admin"
    ? "border-white/[0.1] bg-white/[0.06] text-white/60 hover:bg-white/10 hover:text-white"
    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900";

  if (total <= pageSize) return null;

  return (
    <nav className={cn("flex items-center justify-between gap-3", className)}>
      <button type="button" onClick={() => onPageChange?.(Math.max(0, page - 1))} disabled={page <= 0} className={cn("inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40", buttonClass)}>
        <ChevronLeft className="h-3.5 w-3.5" /> Previous
      </button>
      <span className={cn("text-xs", mode === "admin" ? "text-white/35" : "text-gray-400")}>Page {currentPage} of {totalPages}</span>
      <button type="button" onClick={() => onPageChange?.(Math.min(totalPages - 1, page + 1))} disabled={currentPage >= totalPages} className={cn("inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40", buttonClass)}>
        Next <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </nav>
  );
}