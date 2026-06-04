import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function ExpandableSection({ title, children, defaultOpen = false, className = "" }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className={cn("glass overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left"
      >
        <CardHeader className="flex flex-row items-center justify-between gap-3 py-4">
          <CardTitle className="text-base font-black">{title}</CardTitle>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </CardHeader>
      </button>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}