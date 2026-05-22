import React from "react";
import { Button } from "@/components/ui/button";

export default function PrototypePagination({ page, pageSize, total, onPageChange }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-white/40 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
      <span>Page {page + 1} of {pageCount} · {total.toLocaleString()} records</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPageChange(page - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => onPageChange(page + 1)}>Next</Button>
      </div>
    </div>
  );
}