import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import OperationalEmptyState from "./OperationalEmptyState";

export default function OperationalDataSection({
  mode = "host",
  title,
  subtitle,
  count,
  actions,
  loading = false,
  empty = false,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  children,
  className,
  bodyClassName,
}) {
  const isAdmin = mode === "admin";

  return (
    <section className={cn("overflow-hidden rounded-3xl border shadow-sm", isAdmin ? "border-white/[0.08] bg-white/[0.04] shadow-card" : "border-gray-100 bg-white", className)}>
      {(title || actions) && (
        <div className={cn("flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between", isAdmin ? "border-white/[0.06]" : "border-gray-100")}>
          <div>
            {title && <h2 className={cn("text-sm font-bold", isAdmin ? "text-white" : "text-gray-900")}>{title}</h2>}
            {(subtitle || count !== undefined) && <p className={cn("mt-0.5 text-xs", isAdmin ? "text-white/35" : "text-gray-400")}>{subtitle || `${Number(count || 0).toLocaleString()} record${count === 1 ? "" : "s"}`}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div>}
        </div>
      )}

      <div className={bodyClassName}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-primary">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading records…
          </div>
        ) : empty ? (
          <OperationalEmptyState mode={mode} icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
        ) : children}
      </div>
    </section>
  );
}