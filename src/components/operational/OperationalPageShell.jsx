import React from "react";
import { cn } from "@/lib/utils";

const shellStyles = {
  host: "min-h-full bg-gray-50 text-gray-900",
  admin: "min-h-full mesh-bg text-white",
};

const contentStyles = {
  host: "mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8",
  admin: "mx-auto w-full max-w-[120rem] px-4 py-4 sm:px-6 sm:py-6 lg:px-8",
};

export default function OperationalPageShell({ mode = "host", children, className, contentClassName, fullWidth = false }) {
  return (
    <main className={cn(shellStyles[mode] || shellStyles.host, className)} data-operational-mode={mode}>
      <div className={cn(fullWidth ? "w-full px-4 py-4 sm:px-6 sm:py-6 lg:px-8" : contentStyles[mode] || contentStyles.host, "space-y-5", contentClassName)}>
        {children}
      </div>
    </main>
  );
}