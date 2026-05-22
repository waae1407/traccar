import React from "react";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export default function OperationalEmptyState({ mode = "host", icon: Icon = FileText, title = "No records found", description, action, className }) {
  return (
    <div className={cn("px-4 py-12 text-center", className)}>
      {Icon && <Icon className={cn("mx-auto mb-3 h-9 w-9", mode === "admin" ? "text-white/20" : "text-gray-300")} />}
      <p className={cn("text-sm font-semibold", mode === "admin" ? "text-white/70" : "text-gray-700")}>{title}</p>
      {description && <p className={cn("mx-auto mt-1 max-w-md text-xs", mode === "admin" ? "text-white/35" : "text-gray-400")}>{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}