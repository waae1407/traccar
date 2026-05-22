import React from "react";
import { cn } from "@/lib/utils";

export default function OperationalMobileToolbar({ mode = "host", children, className }) {
  if (!children) return null;
  return (
    <div className={cn("lg:hidden sticky bottom-3 z-20 flex gap-2 overflow-x-auto rounded-2xl border p-2 backdrop-blur-xl no-scrollbar", mode === "admin" ? "border-white/[0.1] bg-background/90 shadow-card" : "border-gray-200 bg-white/95 shadow-lg", className)}>
      {children}
    </div>
  );
}