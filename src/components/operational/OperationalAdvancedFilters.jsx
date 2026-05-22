import React, { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const inputStyles = {
  host: "bg-white border-gray-200 text-gray-900 focus:border-pink-400",
  admin: "bg-white/[0.06] border-white/[0.1] text-white focus:border-primary/50",
};

export default function OperationalAdvancedFilters({ mode = "admin", filters = {}, onChange, hosts = [], fields = [], defaultOpen = false, className }) {
  const [open, setOpen] = useState(defaultOpen);
  const set = (key, value) => onChange?.({ ...filters, [key]: value });
  const controlClass = cn("h-10 rounded-xl border px-3 text-sm outline-none transition-colors", inputStyles[mode] || inputStyles.admin);

  return (
    <section className={cn("rounded-3xl border shadow-sm", mode === "admin" ? "border-white/[0.08] bg-white/[0.04] shadow-card" : "border-gray-100 bg-white", className)}>
      <button type="button" onClick={() => setOpen(!open)} className={cn("flex w-full items-center justify-between gap-3 px-4 py-3 text-left", mode === "admin" ? "text-white" : "text-gray-900")}>
        <span className="flex items-center gap-2 text-sm font-bold">
          <SlidersHorizontal className="h-4 w-4 text-primary" /> Advanced filters
        </span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180", mode === "admin" ? "text-white/40" : "text-gray-400")} />
      </button>

      {open && (
        <div className="grid grid-cols-1 gap-3 border-t border-white/[0.06] p-4 sm:grid-cols-2 xl:grid-cols-4">
          {hosts.length > 0 && (
            <select className={controlClass} value={filters.hostId || ""} onChange={(event) => set("hostId", event.target.value)}>
              <option value="">All hosts</option>
              {hosts.map((host) => <option key={host.id} value={host.id}>{host.business_name || host.full_name || host.email}</option>)}
            </select>
          )}

          {fields.map((field) => {
            if (field.type === "date" || field.type === "text") {
              return (
                <input
                  key={field.key}
                  type={field.type}
                  className={controlClass}
                  placeholder={field.placeholder || field.label || field.key}
                  value={filters[field.key] || ""}
                  onChange={(event) => set(field.key, event.target.value)}
                />
              );
            }

            return (
              <select key={field.key} className={controlClass} value={filters[field.key] || ""} onChange={(event) => set(field.key, event.target.value)}>
                <option value="">{field.placeholder || `All ${field.label || field.key}`}</option>
                {(field.options || []).map((option) => <option key={option.value || option} value={option.value || option}>{option.label || option}</option>)}
              </select>
            );
          })}
        </div>
      )}
    </section>
  );
}